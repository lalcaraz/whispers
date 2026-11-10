const nacl = require('tweetnacl');
const http = require('http');

const toHex = (u8) => Buffer.from(u8).toString('hex');

/** Generate an identity: an ed25519 signing keypair + an x25519 key for the envelope. */
function makeIdentity() {
  const sign = nacl.sign.keyPair();
  const box = nacl.box.keyPair();
  const keyObject = JSON.stringify({
    ed25519: toHex(sign.publicKey),
    x25519: toHex(box.publicKey),
  });
  return {
    keyObject,
    ed25519Hex: toHex(sign.publicKey),
    secretKey: sign.secretKey,
  };
}

function sign(message, secretKey) {
  return toHex(nacl.sign.detached(Buffer.from(message, 'utf8'), secretKey));
}

/** A syntactically valid Expo push token. */
function fakeToken(suffix = 'aaaaaaaaaaaaaaaaaaaaaa') {
  return `ExponentPushToken[${suffix}]`;
}

/** A well-formed encrypted-message envelope (contents are not verified server-side). */
function fakeEnvelope() {
  return JSON.stringify({
    encrypted: 'ab'.repeat(16),
    nonce: 'cd'.repeat(12),
    signature: 'ef'.repeat(32),
  });
}

/** Minimal JSON HTTP client for tests. */
function request(server, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        headers: {
          'content-type': 'application/json',
          ...(payload ? { 'content-length': payload.length } : {}),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json;
          try {
            json = JSON.parse(data);
          } catch {
            json = data;
          }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const PROTO_HEADER = { 'x-whispers-protocol': '2' };

module.exports = { makeIdentity, sign, fakeToken, fakeEnvelope, request, PROTO_HEADER, toHex };
