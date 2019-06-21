'use strict'

const {parallel} = require('async')

module.exports = (secure) => {
  var Exchange = require('../src')
  if (!secure) {
    Exchange = new Proxy(Exchange, {
      construct (ExchangeClass, [swarm, options]) {
        if (!options) {
          options = {}
        }
        options.secure = false
        return new ExchangeClass(swarm, options)
      }
    })
  }


  return {
    opt: {
      peerA: {
        addrs: []
      },
      peerB: {
        addrs: []
      },
      peerM: {
        addrs: ['/ip4/127.0.0.1/tcp/5394/ws']
      },
      exchangeM: {
        enableServer: true
      }
    },
    before: (eA, eB, eM, cb) => {
      parallel([eA, eB].map(e => cb => e.swarm.dial(eM.swarm.peerInfo, cb)), err => {
        if (err) {
          return cb(err)
        }

        setTimeout(() => cb(), 250) // wait for peers to find server
      })
    },
    Exchange
  }
}
