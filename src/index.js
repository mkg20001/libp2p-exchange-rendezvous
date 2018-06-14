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
    if (options && options.allowServer) {
      this.server = new Server(swarm, options)
    }
  }

  start (cb) {
    if (this.server) {
      this.server.start()
    }

    this.swarm.on('peer:connect', peer => { // TODO: unhandle this event on .stop()
      this.swarm.dialProtocol(peer, TAG, (err, conn) => {
        if (err) {
          return log(err)
        }

        let rpc = _RPC(this.swarm.peerInfo.id, this._handle.bind(this))

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

    cb()
  }

  stop (cb) {
    if (this.server) {
      this.server.stop()
    }

    cb()
  }

  _getPubKey (id, cb) {
    if (id.pubKey) { // already has pubKey, nothing to do
      return cb(null, id)
    }

    // TODO: try peerMap and add a cache

    // TODO: do .lookup(id.toB58String(), cb) rpc call
  }

  request (peerId, ns, data, cb) {
    this.rpc = this.rpc.filter(r => r.online()) // remove disconnected peers

    this._getPubKey(peerId, (err, peerId) => {
      if (err) {
        return cb(err)
      }

      // TODO: do .request(peerId, ns, data, cb) rpc call
    })
  }
}

module.exports = Exchange
