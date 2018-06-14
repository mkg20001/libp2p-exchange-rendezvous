'use strict'

const protons = require('protons')

module.exports = protons(`

/*

ServerTypes {
  ID_LOOKUP = 1; // response to clients id lookup request
  {data: pubKey}
  REQUEST   = 2; // other client is requesting response from this client
  RESPONSE  = 3; // other client send response to this client's request
}

ClientTypes {
  ID_LOOKUP = 1; // client asks for pubKey of an id
  {remote: Id}
  REQUEST   = 2; // client is requesting something
  {data: encryptedData, signature: dataSignature, remote: Id}
  RESPONSE  = 3; // client is responding to a request
  {data: encryptedData, signature: dataSignature}
}

*/

enum Error {
  E_NOT_FOUND = 1; // peer not connected
  E_NACK      = 2; // NACK response
  E_TIMEOUT   = 3; // timeout occured
  E_OTHER     = 9; // other error
}

enum Type {
  ID_LOOKUP = 1;
  REQUEST   = 2;
  RESPONSE  = 3;
}

message RPC {
  required Type type = 1;
  required int64 id = 2; // unique request id (client initiated=even, server initiated=odd)
  int64 timestamp = 3;   // TODO: use this to prevent replay attacks
  Error error = 4;
  string ns = 5;
  bytes data = 6;        // max 1mb (1024 ^ 2)
  bytes signature = 7;
  bytes remote = 8;
}

`)

module.exports.TAG = '/p2p/exchange/rendezvous/1.0.0'

module.exports.ETABLE = {
  1: 'Peer not found (peer might not be connected?)',
  2: 'Other side refused to process request',
  3: 'Other side did not respond in time',
  9: 'Internal Server Error'
}
