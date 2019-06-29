'use strict'

const pull = require('pull-stream')

const debug = require('debug')
const log = debug('libp2p:exchange:rendezvous')

const ExchangeBase = require('interface-data-exchange')
const {TAG} = require('./proto')
const _RPC = require('./rpc')
const Server = require('./server')
const ppb = require('pull-protocol-buffers')
const {RPC} = require('./proto.js')

class Exchange extends ExchangeBase {
  constructor (swarm, options) {
    super(swarm, 'libp2p:exchange:rendezvous')
    if (options && options.enableServer) {
      this.server = new Server(swarm, options)
    }

    this.secure = false

    if (options && options.secure) {
      this.secure = true
    }

    this.rpc = []
  }

  start () {
    if (this.server) {
      this.server.start()
    }

    this.swarm.on('peer:connect', peer => { // TODO: unhandle this event on .stop()
      this.swarm.dialProtocol(peer, TAG, (err, conn) => {
        if (err) {
          return log(err)
        }

        let rpc = _RPC(this.swarm.peerInfo.id, this._handle.bind(this), this.secure)

        pull(
          conn,
          ppb.decode(RPC),
          rpc,
          ppb.encode(RPC),
          conn
        )

        this.rpc.push(rpc.methods)
      })
    })
  }

  stop () {
    if (this.server) {
      this.server.stop()
    }
  }

  async _rpc (call, ...args) {
    this.rpc = this.rpc.filter(r => r.online()) // remove disconnected peers

    if (!this.rpc.length) {
      throw new Error('No rendezvous-points connected!')
    }

    let list = this.rpc.slice(0)

    async function tryPeer (rpc) {
      try {
        return rpc[call](...args)
      } catch (err) {
        let next = list.shift()
        if (!next) {
          throw err
        } else {
          return tryPeer(next)
        }
      }
    }

    return tryPeer(list.shift())
  }

  async _getPubKey (id) {
    if (id.pubKey) { // already has pubKey, nothing to do
      return id
    }

    // TODO: check peerBook for key, add a cache

    log('looking up pubKey for %s', id.toB58String())

    return this._rpc('lookup', id.toB58String())
  }

  async request (peerId, ns, data) {
    log('request on %s to %s', ns, peerId.toB58String())

    if (this.secure) {
      peerId = await this._getPubKey(peerId)
      log('sending request on %s to %s', ns, peerId.toB58String())
      return this._rpc('request', peerId, ns, data)
    } else {
      log('sending request on %s to %s (INSECURE)', ns, peerId.toB58String())
      return this._rpc('request', peerId, ns, data)
    }
  }
}

module.exports = Exchange
