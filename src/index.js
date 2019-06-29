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
    super(swarm)
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

  _rpc (call, ...args) {
    this.rpc = this.rpc.filter(r => r.online()) // remove disconnected peers
    const cb = args.pop()

    if (!this.rpc.length) {
      return cb(new Error('No rendezvous-points connected!'))
    }

    let list = this.rpc.slice(0)

    function tryPeer (rpc) {
      rpc[call](...args, (err, res) => {
        if (err) {
          let next = list.shift()
          if (!next) {
            return cb(err)
          } else {
            return tryPeer(next)
          }
        }

        return cb(err, res)
      })
    }

    tryPeer(list.shift())
  }

  _getPubKey (id, cb) {
    if (id.pubKey) { // already has pubKey, nothing to do
      return cb(null, id)
    }

    // TODO: check peerBook for key, add a cache

    log('looking up pubKey for %s', id.toB58String())

    this._rpc('lookup', id.toB58String(), cb)
  }

  request (peerId, ns, data, cb) {
    log('request on %s to %s', ns, peerId.toB58String())

    if (this.secure) {
      this._getPubKey(peerId, (err, peerId) => {
        if (err) {
          return cb(err)
        }

        log('sending request on %s to %s', ns, peerId.toB58String())
        this._rpc('request', peerId, ns, data, cb)
      })
    } else {
      this._rpc('request', peerId, ns, data, cb)
    }
  }
}

module.exports = Exchange
