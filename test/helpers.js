const helpers = require('autobase-test-helpers')
const Corestore = require('corestore')
const Autobase = require('autobase')

module.exports = {
  createStores,
  createBase,
  create,
  addWriter,
  apply,
  confirm,
  ...helpers
}

async function createStores (n, t, opts = {}) {
  const storage = opts.storage || (() => t.tmp())
  const offset = opts.offset || 0

  const stores = []
  for (let i = offset; i < n + offset; i++) {
    const primaryKey = Buffer.alloc(32, i)
    const globalCache = opts.globalCache || null
    const dir = await storage()
    stores.push(new Corestore(dir, { primaryKey, globalCache, unsafe: true }))
  }

  t.teardown(() => Promise.all(stores.map((s) => s.close())), { order: 2 })

  return stores
}

async function create (n, t, opts = {}) {
  const stores = await createStores(n, t, opts)
  const bases = [createBase(stores[0], null, t, opts)]
  await bases[0].ready()
  bases[0].name = 'a'
  if (n === 1) return { stores, bases }

  for (let i = 1; i < n; i++) {
    const base = createBase(stores[i], bases[0].local.key, t, opts)
    await base.ready()
    bases.push(base)
    // naming them makes debugging easier so why not
    base.name = String.fromCharCode('a'.charCodeAt(0) + i)
  }

  return {
    stores,
    bases
  }
}

function createBase (store, key, t, opts = {}) {
  const moreOpts = {
    apply,
    open,
    close: undefined,
    valueEncoding: 'json',
    ackInterval: 0,
    ackThreshold: 0,
    fastForward: false,
    ...opts
  }

  const base = new Autobase(store.session(), key, moreOpts)

  if (opts.maxSupportedVersion !== undefined) {
    base.maxSupportedVersion = opts.maxSupportedVersion
  }

  t.teardown(
    async () => {
      return base.close()
    },
    { order: 1 }
  )

  return base
}

function open (store) {
  return store.get('view', { valueEncoding: 'json' })
}

async function apply (batch, view, base) {
  for (const { value } of batch) {
    if (value.add) {
      const key = Buffer.from(value.add, 'hex')
      await base.addWriter(key, { indexer: value.indexer })
      continue
    }

    if (view) await view.append(value)
  }
}

async function addWriter (base, add, indexer = true) {
  return base.append({ add: add.local.key.toString('hex'), indexer })
}

async function confirm (bases, options = {}) {
  await helpers.replicateAndSync(bases, options)

  for (let i = 0; i < 2; i++) {
    const writers = bases.filter((b) => !!b.localWriter)
    const maj = options.majority || Math.floor(writers.length / 2) + 1
    for (let j = 0; j < maj; j++) {
      if (!writers[j].ackable) continue

      await writers[j].append(null)
      await helpers.replicateAndSync(bases, options)
    }
  }

  await helpers.replicateAndSync(bases, options)
}
