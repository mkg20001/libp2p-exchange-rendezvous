'use strict'

const prom = (fnc) => new Promise((resolve, reject) => fnc((err, res) => err ? reject(err) : resolve(res)))

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
  before: async (eA, eB, eM) => {
    await Promise.all([eA, eB].map((e) => prom(cb => e.swarm.dial(eM.swarm.peerInfo, cb))))
  },
  Exchange: require('../src')
})
