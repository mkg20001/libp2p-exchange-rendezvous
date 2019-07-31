# libp2p-exchange-rendezvous

[![](https://img.shields.io/badge/made%20by-mkg20001-blue.svg?style=flat-square)](https://github.com/mkg20001)

> Data Exchange component that uses other peers to exchange requests/responses

## Use-Case

The use case for this exchange component is to allow exchanges between two peers that are not directly connected but share one or more rendezvous peers.

## Example

```js
'use strict'

const Exchange = require('libp2p-exchange-direct')

const exchangeA = new Exchange(swarmA)
const exchangeB = new Exchange(swarmB)
const exchangeM = new Exchange(swarmM, {enableServer: true})

// even though those are async, they don't do anything async. so feel free to skip await for this example
exchangeA.start()
exchangeB.start()
exchangeM.start()

exchangeB.listen('example', async (data) => {
  return Buffer.from(String(data).reverse()) // reverse buffer as string and send back as buffer
})

swarmA.dial(swarmM.peerInfo, err => {
  if (err) throw err

  swarmB.dial(swarmM.peerInfo, err => {
    if (err) throw err

    exchangeA.request(swarmB.peerInfo.id, 'example', Buffer.from('Hello World!')).then(console.log, console.error)
  })
})
```
