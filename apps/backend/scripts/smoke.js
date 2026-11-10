#!/usr/bin/env node
/**
 * End-to-end smoke test against a freshly booted server.
 *
 * Boots src/server.js as a child process on a temp database with push delivery
 * stubbed (PUSH_DRY_RUN), then runs a full signed flow:
 *   register -> contacts add -> send (200) -> replay (401) -> unlisted send (403)
 *   -> cleanup (200)
 *
 * Exit code 0 = all checks passed. Operators can run `npm run smoke` to verify
 * an install without touching real Expo infrastructure.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const nacl = require('tweetnacl');

const auth = require('../src/auth');

const PORT = 4599;
const BASE = `http://127.0.0.1:${PORT}`;
const CLEANUP_KEY = 'smoke-cleanup-key-0123456789';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whispers-smoke-'));
const DB_PATH = path.join(tmpDir, 'smoke.db');

const toHex = (u8) => Buffer.from(u8).toString('hex');

function identity() {
  const s = nacl.sign.keyPair();
  const b = nacl.box.keyPair();
  return {
    keyObject: JSON.stringify({ ed25519: toHex(s.publicKey), x25519: toHex(b.publicKey) }),
    ed25519Hex: toHex(s.publicKey),
    secretKey: s.secretKey,
  };
}
const sign = (msg, sk) => toHex(nacl.sign.detached(Buffer.from(msg, 'utf8'), sk));
const envelope = () =>
  JSON.stringify({ encrypted: 'ab'.repeat(16), nonce: 'cd'.repeat(12), signature: 'ef'.repeat(32) });

function req(method, pathname, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const r = http.request(
      `${BASE}${pathname}`,
      {
        method,
        headers: {
          'content-type': 'application/json',
          ...(payload ? { 'content-length': payload.length } : {}),
          ...headers,
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          let j;
          try {
            j = JSON.parse(d);
          } catch {
            j = d;
          }
          resolve({ status: res.statusCode, body: j });
        });
      }
    );
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

const H = { 'x-whispers-protocol': auth.PROTOCOL_VERSION };
let passed = 0;
function check(label, cond) {
  if (cond) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    throw new Error(`smoke check failed: ${label}`);
  }
}

async function waitForHealth(retries = 50) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await req('GET', '/health');
      if (res.status === 200) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not become healthy');
}

async function main() {
  const res = await req('GET', '/health');
  check('health ok', res.status === 200 && res.body.protocol === auth.PROTOCOL_VERSION);

  const alice = identity();
  const bob = identity();
  const mallory = identity();
  const token = 'ExponentPushToken[smoke-aaaaaaaaaaaaaa]';

  // register bob (signed)
  let ts = Date.now();
  let r = await req(
    'POST',
    '/register',
    {
      recipientId: bob.keyObject,
      expoPushToken: token,
      timestamp: ts,
      signature: sign(auth.registerMessage(ts, bob.keyObject, token), bob.secretKey),
    },
    H
  );
  check('register bob -> 200', r.status === 200);

  // register with wrong key -> 401
  ts = Date.now();
  r = await req(
    'POST',
    '/register',
    {
      recipientId: bob.keyObject,
      expoPushToken: token,
      timestamp: ts,
      signature: sign(auth.registerMessage(ts, bob.keyObject, token), mallory.secretKey),
    },
    H
  );
  check('register bob with wrong signature -> 401', r.status === 401);

  // missing protocol header -> 400
  ts = Date.now();
  r = await req('POST', '/register', {
    recipientId: bob.keyObject,
    expoPushToken: token,
    timestamp: ts,
    signature: sign(auth.registerMessage(ts, bob.keyObject, token), bob.secretKey),
  });
  check('register without protocol header -> 400', r.status === 400);

  // bob allow-lists alice
  ts = Date.now();
  r = await req(
    'POST',
    '/contacts',
    {
      recipientId: bob.keyObject,
      action: 'add',
      contactEd25519: alice.ed25519Hex,
      timestamp: ts,
      signature: sign(auth.contactsMessage(ts, 'add', alice.ed25519Hex), bob.secretKey),
    },
    H
  );
  check('bob adds alice to allow-list -> 200', r.status === 200);

  // alice -> bob (signed, allow-listed)
  ts = Date.now();
  const env = envelope();
  const sendBody = {
    encryptedMessage: env,
    destination: bob.keyObject,
    origin: alice.keyObject,
    timestamp: ts,
    signature: sign(auth.sendMessage(ts, bob.keyObject, env), alice.secretKey),
  };
  r = await req('POST', '/send', sendBody, H);
  check('alice -> bob send -> 200', r.status === 200 && r.body.success === true);

  // replay the exact same request -> 401
  r = await req('POST', '/send', sendBody, H);
  check('replayed send -> 401', r.status === 401);

  // mallory (not allow-listed) -> bob -> 403
  ts = Date.now();
  const env2 = envelope();
  r = await req(
    'POST',
    '/send',
    {
      encryptedMessage: env2,
      destination: bob.keyObject,
      origin: mallory.keyObject,
      timestamp: ts,
      signature: sign(auth.sendMessage(ts, bob.keyObject, env2), mallory.secretKey),
    },
    H
  );
  check('unlisted sender -> 403', r.status === 403);

  // stale timestamp -> 401
  ts = Date.now() - 600000;
  const env3 = envelope();
  r = await req(
    'POST',
    '/send',
    {
      encryptedMessage: env3,
      destination: bob.keyObject,
      origin: alice.keyObject,
      timestamp: ts,
      signature: sign(auth.sendMessage(ts, bob.keyObject, env3), alice.secretKey),
    },
    H
  );
  check('stale timestamp -> 401', r.status === 401);

  // cleanup with wrong key -> 401, right key -> 200
  r = await req('POST', '/cleanup', { key: 'nope' });
  check('cleanup wrong key -> 401', r.status === 401);
  r = await req('POST', '/cleanup', { key: CLEANUP_KEY });
  check('cleanup right key -> 200', r.status === 200);
}

const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DB_PATH,
    NODE_ENV: 'development',
    PUSH_DRY_RUN: 'true',
    CLEANUP_KEY,
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});

let done = false;
function finish(code) {
  if (done) return;
  done = true;
  child.kill('SIGTERM');
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  process.exit(code);
}

child.on('exit', (code) => {
  if (!done) {
    console.error(`server exited early (code ${code})`);
    finish(1);
  }
});

(async () => {
  try {
    await waitForHealth();
    console.log('running smoke checks...');
    await main();
    console.log(`\nsmoke: ${passed} checks passed`);
    finish(0);
  } catch (err) {
    console.error(`\nsmoke failed: ${err.message}`);
    finish(1);
  }
})();
