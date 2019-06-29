'use strict'

/* eslint-disable max-nested-callbacks */

const debug = require('debug')
const log = debug('libp2p:exchange:rendezvous:rpc')

const Pushable = require('pull-pushable')
const pull = require('pull-stream')
const {Type, ErrorType, ETABLE} = require('./proto.js')
const Id = require('peer-id')

const prom = (fnc) => new Promise((resolve, reject) => fnc((err, res) => err ? reject(err) : resolve(res)))
const defer = () => {
  let _resolve
  let _reject

  let fired = false
  function lock (d) {
    if (fired) {
      throw new Error('already fired!')
    }
    fired = false

    d()
  }

  let prom = new Promise((resolve, reject) => {
    _resolve = resolve
    _reject = reject
  })

  prom.resolve = (...a) => process.nextTick(() => lock(() => _resolve(...a)))
  prom.reject = (...a) => process.nextTick(() => lock(() => _reject(...a)))
  setTimeout(() => prom.reject(new Error('Timeout')), 10 * 1000)

  return prom
}

module.exports = (myId, requestHandler, secure) => {
  let online = true

  let cbs = {}
  let id = 1

  const source = Pushable() // TODO: since we're in pull.drain, the return does nothing yet. need to be fixed. possibly need an entirely new rpc.
  const sink = pull.drain(async data => { // eslint-disable-line complexity
    log('got %s %s', data.type, data.id) // TODO: make this madness a bit more logical

    switch (data.type) {
      case Type.ID_LOOKUP: {
        let prom = cbs[data.id]
        if (prom && prom.requestedId) {
          delete cbs[data.id]

          log('got id lookup response %s', data.id)

          let id

          try {
            if (data.error) {
              throw new Error(ETABLE[data.error] || 'N/A')
            }

            id = await prom(cb => Id.createFromProtobuf(data.remote, cb))
            if (id.toB58String() !== prom.requestedId) {
              throw new Error('Id is not matching!')
            }
          } catch (err) {
            return prom.reject(err)
          }

          return prom.resolve(id)
        }

        break
      }
      case Type.REQUEST: {
        log('got request %s', data.ns)

        const doRequest = async () => {
          let remoteId

          try {
            remoteId = await prom(cb => Id.createFromProtobuf(data.remote, cb))
          } catch (err) {
            log('id read err %s', err)
            return ErrorType.E_NACK
          }

          if (secure) {
            try {
              const ok = await prom(cb => remoteId.pubKey.verify(data.data, data.signature, cb))
              if (!ok) {
                log('signature invalid')
                return ErrorType.E_NACK
              }
            } catch (err) {
              log('signature err %s', err)
              return ErrorType.E_NACK
            }

            let request
            try {
              request = await prom(cb => myId.privKey.decrypt(data.data, cb))
            } catch (err) {
              return ErrorType.E_NACK
            }

            let res
            try {
              res = requestHandler(data.ns, remoteId, request)
              if (res.nack) {
                log('request nack')
                return ErrorType.E_NACK
              }
            } catch (err) {
              log('request err %s', err)
              return ErrorType.E_NACK
            }

            try {
              const encrypted = await prom(cb => remoteId.pubKey.encrypt(res.result, cb))
              const signature = await prom(cb => myId.privKey.sign(encrypted, cb))

              return {data: encrypted, signature}
            } catch (err) {
              log('crypto error %s', err)
            }
          } else {
            try {
              const res = await requestHandler(data.ns, remoteId, data.data)
              if (res.nack) {
                return res.nack
              }

              return {data: res.result}
            } catch (err) {
              return ErrorType.E_NACK
            }
          }
        }

        let out = {
          type: Type.RESPONSE,
          id: data.id
        }

        let res
        try {
          res = await doRequest()
        } catch (err) {
          log('internal request error %s', err)
          res = ErrorType.E_OTHER
        }

        if (!res.data) {
          out.error = res
        } else {
          Object.assign(out, res)
        }

        source.push(out)

        break
      }
      case Type.RESPONSE: {
        let prom = cbs[data.id]

        if (prom && prom.remoteId) {
          delete cbs[data.id]

          try {
            if (data.error) {
              throw new Error(ETABLE[data.error] || 'N/A')
            }

            if (secure) {
              const ok = await prom(cb => prom.remoteId.pubKey.verify(data.data, data.signature, cb))
              if (!ok) {
                throw new Error('Signature check failed')
              }
              const result = await prom(cb => myId.privKey.decrypt(data.data, cb))
              return result
            } else {
              return data.data
            }
          } catch (err) {
            log('response error %s', err)
            prom.reject(err)
          }
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

  /* source.push({ // send this fake ID_LOOKUP as first packet so the server has our pubKey
    type: Type.ID_LOOKUP,
    id: 0,
    remote: myId.marshal(true) // TODO: get marshal fnc merged into peer-id
  }) */

  return {
    source,
    sink,
    methods: {
      online: () => online,
      lookup: async (b58) => {
        if (!online) {
          throw new Error('Not online!')
        }

        let rid = id++ * 2
        cbs[rid] = defer()
        cbs[rid].requestedId = b58

        source.push({
          type: Type.ID_LOOKUP,
          id: rid,
          remote: Buffer.from(b58)
        })

        return cbs[rid]
      },
      request: async (remoteId, ns, data) => {
        if (!online) {
          throw new Error('Not online!')
        }

        const sendRequest = (data, signature) => {
          let rid = id++ * 2

          cbs[rid] = defer()
          cbs[rid].remoteId = remoteId

          const request = {
            type: Type.REQUEST,
            id: rid,
            ns,
            data,
            remote: Buffer.from(remoteId.toB58String())
          }

          if (signature) {
            request.signature = signature
          }

          source.push(request)

          return cbs[rid]
        }

        if (secure) {
          const encrypted = await prom(cb => remoteId.pubKey.encrypt(data, cb))
          const signature = await prom(cb => myId.privKey.sign(data, cb))
          return sendRequest(encrypted, signature)
        } else {
          return sendRequest(data)
        }
      }
    }
  }
}
