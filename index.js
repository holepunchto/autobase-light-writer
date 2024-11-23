const { OplogMessage, Wakeup } = require('autobase/lib/messages.js')
const c = require('compact-encoding')

module.exports = class AutobaseLightWriter {
  constructor (store, key, opts = {}) {
    const active = opts.active !== false

    this.bootstrap = store.get({ key, active })
    this.store = store.namespace(this.bootstrap, { detach: false })
    this.valueEncoding = opts.valueEncoding || null
    this.local = this.store.get({ name: 'autobase-light-writer', active })

    this.wokeup = false
    this.extension = this.bootstrap.registerExtension('autobase', {
      onmessage: this._onmessage.bind(this)
    })

    this.ready().catch(noop)

    this.bootstrap.on('peer-add', (peer) => {
      this.extension.send(this._encodeWakeup(), peer)
    })
  }

  get key () {
    return this.bootstrap.key
  }

  get discoveryKey () {
    return this.bootstrap.discoveryKey
  }

  _onmessage (msg, peer) {
    this.extension.send(this._encodeWakeup(), peer)
  }

  async ready () {
    await this.bootstrap.ready()

    if (!this.wokeup) {
      this.wokeup = true
      this.extension.broadcast(this._encodeWakeup())
    }
  }

  close () {
    return this.store.close()
  }

  _encodeWakeup () {
    const writers = [{ key: this.local.key, length: this.local.length }]
    return c.encode(Wakeup, { version: 1, type: 1, writers })
  }

  append (message) {
    const value = this.valueEncoding === null ? message : c.encode(this.valueEncoding, message)
    const buffer = c.encode(OplogMessage, {
      version: 1,
      maxSupportedVersion: 1,
      digest: null,
      checkpoint: null,
      node: {
        heads: [],
        batch: 1,
        value
      }
    })

    return this.local.append(buffer)
  }
}

function noop () {}
