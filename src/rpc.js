'use strict'

/* eslint-disable max-nested-callbacks */

const debug = require('debug')
const log = debug('libp2p:exchange:rendezvous:rpc')

const Pushable = require('pull-pushable')
const pull = require('pull-stream')
const {Type, Error, ETABLE} = require('./proto.js')
const Id = require('peer-id')
const once = require('once')
const wrap = (cb) => {
  cb = once(cb)
  setTimeout(() => cb(new Error('Timeout')), 10 * 1000)
  return cb
}

module.exports = (myId, requestHandler) => {
  let online = true

  let cbs = {}
  let id = 1

  const source = Pushable()
  const sink = pull.drain(data => {
    switch (data.type) {
      case Type.ID_LOOKUP: {
        let cb = cbs[data.id]
        if (cb && cb.requestedId) {
          delete cbs[data.id]

          if (data.error) {
            return cb(new Error(ETABLE[data.error] || 'N/A'))
          }

          Id.createFromProtobuf(data.remote, (err, id) => {
            if (err) {
              return cb(err)
            }

            if (Id.toB58String() !== cb.requestedId) {
              return cb(new Error('Id is not matching!'))
            }

            return cb(null, id)
          })
        }

        break
      }
      case Type.REQUEST: {
        let cb = (err, res) => {
          let out = {
            type: Type.RESPONSE,
            id: data.id
          }

          if (err) {
            out.error = err
          } else {
            Object.assign(out, res)
          }

          source.push(res)
        }

        Id.createFromProtobuf(data.remote, (err, remoteId) => {
          if (err) {
            log(err)
            return cb(Error.E_NACK)
          }

          remoteId.pubKey.verify(data.data, data.signature, (err, ok) => {
            if (err || !ok) {
              log(err || 'Signature check failed')
              return cb(Error.E_NACK)
            }

            myId.privKey.decrypt(data.data, (err, request) => {
              if (err) {
                log(err)
                return cb(Error.E_NACK)
              }

              requestHandler(data.ns, remoteId, request, (err, res) => {
                if (err) {
                  log(err)
                  return cb(Error.E_NACK)
                }

                if (res.nack) {
                  return cb(Error.E_NACK)
                }

                remoteId.pubKey.encrypt(res.result, (err, result) => {
                  if (err) {
                    log(err)
                    return cb(Error.E_OTHER)
                  }

                  myId.privKey.sign(result, (err, signature) => {
                    if (err) {
                      log(err)
                      return cb(Error.E_OTHER)
                    }

                    cb(null, {data: result, signature})
                  })
                })
              })
            })
          })
        })

        break
      }
      case Type.RESPONSE: {
        let cb = cbs[data.id]

        if (cb && cb.remoteId) {
          delete cbs[data.id]

          if (data.error) {
            return cb(new Error(ETABLE[data.error] || 'N/A'))
          }

          cb.remoteId.pubKey.verify(data.data, data.signature, (err, ok) => {
            if (err || !ok) {
              return cb(err || new Error('Signature check failed'))
            }

            myId.privKey.decrypt(data.data, (err, result) => {
              if (err) {
                return cb(err)
              }

              return cb(null, result)
            })
          })
        }

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

  source.push({ // send this fake ID_LOOKUP as first packet so the server has our pubKey
    type: Type.ID_LOOKUP,
    id: 0,
    remote: myId.marshal(true)
  })

  return {
    source,
    sink,
    methods: {
      online: () => online,
      lookup: (b58, cb) => {
        if (!online) {
          return cb(new Error('Not online!'))
        }

        let rid = id++ * 2
        cbs[rid] = wrap(cb)
        cbs[rid].requestedId = b58

        source.push({
          type: Type.ID_LOOKUP,
          id: rid,
          remote: Buffer.from(b58)
        })
      },
      request: (remoteId, ns, data, cb) => {
        if (!online) {
          return cb(new Error('Not online!'))
        }

        remoteId.pubKey.encrypt(data, (err, data) => {
          if (err) {
            return cb(err)
          }

          myId.privKey.sign(data, (err, signature) => {
            if (err) {
              return cb(err)
            }

            let rid = id++ * 2

            cbs[rid] = wrap(cb)
            cbs[rid].remoteId = remoteId

            source.push({
              type: Type.REQUEST,
              id: rid,
              data,
              signature
            })
          })
        })
      }
    }
  }
}
