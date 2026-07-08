const { test } = require('brittle')
const { once } = require('events')

const { addWriter, replicate, create, createStores } = require('./helpers')
const AutobaseLightWriter = require('../')

test('basic', async (t) => {
  const { bases: [base] } = await create(1, t)
  const [store] = await createStores(1, t)

  const w = new AutobaseLightWriter(store, base.key, { valueEncoding: 'json' })
  await w.ready()
  await addWriter(base, w, false)
  await w.append({ hello: 'verden' })

  const unreplicate = replicate([w.store, base])

  t.is(base.system.members, 2, 'base added light writer')

  await once(base.view, 'append')
  t.is(base.view.length, 1, 'light writer block was appended')

  // Once syncing is working
  t.is(base.system.members, base.activeWriters.size, 'both are active writers')

  await unreplicate()
})
