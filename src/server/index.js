'use strict'

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
    this.swarm.handle(TAG, (proto, conn) => {
      if (err) {
        return log(err)
      }

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

        this.rpc[pi.id.toB58String()] = rpc
      })
    })
  }

  stop () {
    this.swarm.unhandle(TAG)
  }
}
