'use strict'

const debug = require('debug')
const log = debug('libp2p:exchange:rendezvous:server:rpc')

const Pushable = require('pull-pushable')
const pull = require('pull-stream')
const {Type, Error, ETABLE} = require('../proto.js')
const Id = require('peer-id')

module.exports = (pi, server) => {
  let online = true

  let cbs = {}
  let id = 1

  const source = Pushable()
  const sink = pull.drain(data => {
    switch (data.type) {
      case Type.ID_LOOKUP: {
        if (!data.id) {
          return Id.createFromProtobuf(data.remote, (err, id) => {
            if (err) {
              return log(err)
            }

            if (pi.id.toB58String() !== id.toB58String()) {
              return log('missmatch ID add %s !== %s', pi.id.toB58String(), id.toB58String())
            }

            log('added ID %s', id.toB58String())
            server.ids[pi.id.toB58String()] = id
          })
        }

        let cb = (err, res) => {
          let out = {
            type: Type.ID_LOOKUP,
            id: data.id
          }

          if (err) {
            out.error = err
          } else {
            Object.assign(out, res)
          }

          source.push(res)
        }

        let id = server.ids[String(data.remote)]

        if (id) {
          cb(null, {remote: id})
        } else {
          cb(Error.E_NOT_FOUND)
        }

        break
      }
      case Type.REQUEST: {
        // we get a request (data.data, data.signature) to forward to data.remote (b58string) and then get a response to forward back
        // TODO: add

        break
      }
      case Type.RESPONSE: {
        // TODO: add

        break
      }
      default: {
        log('rpc got unknown type %s', data.type)
      }
    }
  }, e => {
    source.end(e)
    online = false
  })

  return {
    source,
    sink,
    methods: {
      online: () => online,
      requestForward: () => {
        // TODO: add
      }
    }
  }
}
