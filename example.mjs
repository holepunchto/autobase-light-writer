import Corestore from 'corestore'
import Autobase from 'autobase'
import AutobaseLightWriter from './index.js'
import c from 'compact-encoding'

const base = new Autobase(new Corestore('./example-store/my-autobase'), {
  valueEncoding: c.json,
  open (store) {
    return store.get('view', { valueEncoding: c.json })
  },
  async apply (nodes, view, base) {
    for (const node of nodes) {
      const data = node.value

      if (data.type === 'add') await base.addWriter(Buffer.from(data.key, 'hex'), { indexer: false })
      await view.append(data)
    }
  }
})

await base.ready()

const w = new AutobaseLightWriter(new Corestore('./example-store/my-light-autobase'), base.key, { valueEncoding: c.json })
await w.append({ hello: 'verden' })

{
  const s1 = w.store.replicate(true)
  const s2 = base.store.replicate(false)

  s1.pipe(s2).pipe(s1)
}

base.view.on('append', async function () {
  console.log('onappend!', base.view.length, base.view.signedLength)
  for (let i = 0; i < base.view.length; i++) {
    console.log(i, await base.view.get(i))
  }
})

await base.update()
await base.ack()

if (base.view.length === 0) {
  await base.append({ type: 'add', key: w.local.key.toString('hex') })
}
