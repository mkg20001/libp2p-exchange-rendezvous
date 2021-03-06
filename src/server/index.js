'use strict'

const debug = require('debug')
const log = debug('libp2p:exchange:rendezvous:server')

const ppb = require('pull-protocol-buffers')
const pull = require('pull-stream')
const _RPC = require('./rpc')
const {TAG, RPC} = require('../proto')

class Server {
  constructor (swarm, options) {
    this.swarm = swarm
    this.rpc = {}
    this.ids = {}
  }

  start () {
    log('server started')

    this.swarm.handle(TAG, (proto, conn) => {
      conn.getPeerInfo((err, pi) => {
        if (err) {
          return log(err)
        }

        let rpc = _RPC(pi, this)

        pull(
          conn,
          ppb.decode(RPC),
          rpc,
          ppb.encode(RPC),
          conn
        )

        this.rpc[pi.id.toB58String()] = rpc.methods
      })
    })
  }

  stop () {
    log('server stopped')

    // TODO: close conns

    this.swarm.unhandle(TAG)
  }
}

module.exports = Server
