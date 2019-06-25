'use strict'

const {parallel} = require('async')

module.exports = (secure) => ({
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
    exchangeA: {
      secure
    },
    exchangeB: {
      secure
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
  Exchange: require('../src')
})
