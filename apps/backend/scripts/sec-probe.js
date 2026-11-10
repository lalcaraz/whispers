#!/usr/bin/env node
/**
 * Security probe for a running Whispers relay.
 *
 *   node scripts/sec-probe.js [baseUrl]        # default http://localhost:3000
 *   TARGET=https://api.example.com node scripts/sec-probe.js
 *
 * Black-box checks, run against your own server. Most negative tests go through
 * /send, which rate-limits per sender key (30 / 15 min), so fresh identities give
 * plenty of headroom. /register, /contacts and /cleanup share one per-IP bucket
 * (10 / 15 min): a handful of checks there run last and DEGRADE TO A NOTE if the
 * bucket is already spent — restart the server for a fully clean run.
 *
 * Exit code: 0 = no failures, 1 = at least one FAIL.
 *
 * Findings history: docs/security-probe.md
 */
'use strict';

const nacl = require('tweetnacl');

const BASE = (process.argv[2] || process.env.TARGET || 'http://localhost:3000').replace(/\/$/, '');
const H = { 'x-whispers-protocol': '2', 'content-type': 'application/json' };

let pass = 0;
let failCount = 0;
let notes = 0;
const P = (m) => { pass++; console.log(`  \x1b[32mPASS\x1b[0m  ${m}`); };
const F = (m) => { failCount++; console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`); };
const N = (m) => { notes++; console.log(`  \x1b[33mNOTE\x1b[0m  ${m}`); };

const hex = (u8) => Buffer.from(u8).toString('hex');
const sign = (msg, secretKey) => hex(nacl.sign.detached(Buffer.from(msg, 'utf8'), secretKey));

function identity() {
  const ed = nacl.sign.keyPair();
  const x = nacl.box.keyPair();
  return { ed, keyObject: JSON.stringify({ ed25519: hex(ed.publicKey), x25519: hex(x.publicKey) }) };
}
const envelope = () =>
  JSON.stringify({ encrypted: 'ab'.repeat(16), nonce: 'cd'.repeat(12), signature: 'ef'.repeat(32) });

async function req(path, { method = 'POST', headers = {}, body, raw } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers };
}

/** A fully valid signed /send body: fresh sender -> fresh recipient. */
function validSend(overrides = {}) {
  const a = overrides._a || identity();
  const ts = overrides.timestamp ?? Date.now();
  const destination = overrides.destination ?? identity().keyObject;
  const encryptedMessage = overrides.encryptedMessage ?? envelope();
  const signature =
    overrides.signature ?? sign(`${ts}${destination}${encryptedMessage}`, a.ed.secretKey);
  return { origin: a.keyObject, destination, encryptedMessage, timestamp: ts, signature };
}

async function main() {
  console.log(`\n=== Whispers relay security probe — ${BASE} ===`);

  // Bail early if the server is not reachable.
  try {
    const h = await req('/health', { method: 'GET' });
    if (h.status !== 200) { console.error(`\n/health returned ${h.status} — is the server up?`); process.exit(2); }
  } catch (err) {
    console.error(`\nCannot reach ${BASE}: ${err.message}`);
    process.exit(2);
  }

  console.log('\n[1] Headers / information disclosure');
  {
    const r = await req('/health', { method: 'GET' });
    r.headers.get('x-powered-by')
      ? F(`X-Powered-By leaked: ${r.headers.get('x-powered-by')}`)
      : P('no X-Powered-By header');
    r.headers.get('x-content-type-options') === 'nosniff'
      ? P('X-Content-Type-Options: nosniff')
      : F('missing X-Content-Type-Options: nosniff');
    const server = r.headers.get('server');
    !server || !/express|node\.js/i.test(server)
      ? P('no framework banner in Server header')
      : N(`Server header: ${server}`);
    r.headers.get('strict-transport-security') ? P('HSTS header present') : N('no HSTS header (add it at the TLS proxy)');
    N(`/health body: ${r.text.trim()}`);
  }

  console.log('\n[2] Protocol-version gate (via /send)');
  for (const [label, headers] of [
    ['header missing', { 'content-type': 'application/json' }],
    ['version 1', { ...H, 'x-whispers-protocol': '1' }],
    ['version 999', { ...H, 'x-whispers-protocol': '999' }],
  ]) {
    const r = await req('/send', { headers, body: validSend() });
    r.status === 400 ? P(`${label} -> 400`) : F(`${label} -> ${r.status} (expected 400)`);
  }

  console.log('\n[3] Authentication / signature forgery (via /send)');
  {
    let r = await req('/send', {
      headers: H,
      body: (() => { const b = validSend(); delete b.signature; return b; })(),
    });
    [400, 401].includes(r.status) ? P(`missing signature -> ${r.status}`) : F(`missing signature -> ${r.status}`);

    r = await req('/send', { headers: H, body: { ...validSend(), signature: 'de'.repeat(64) } });
    r.status === 401 ? P('forged signature -> 401') : F(`forged signature -> ${r.status}`);

    const victim = identity();
    const attacker = identity();
    const dst = identity().keyObject;
    const ts = Date.now();
    const env = envelope();
    r = await req('/send', {
      headers: H,
      body: {
        origin: victim.keyObject,
        destination: dst,
        encryptedMessage: env,
        timestamp: ts,
        signature: sign(`${ts}${dst}${env}`, attacker.ed.secretKey),
      },
    });
    r.status === 401 ? P('signature by a different key -> 401 (no sender spoofing)') : F(`cross-key signature -> ${r.status}`);

    const s = validSend();
    r = await req('/send', { headers: H, body: { ...s, destination: identity().keyObject } });
    r.status === 401 ? P('signature bound to a different destination -> 401') : F(`payload swap -> ${r.status}`);
  }

  console.log('\n[4] Replay protection (via /send)');
  {
    const s = validSend();
    const first = await req('/send', { headers: H, body: s });
    const again = await req('/send', { headers: H, body: s });
    if ((first.status === 403 || first.status === 404) && again.status === 401) {
      P(`replayed signed request -> 401 (first ${first.status}, nonce burned before authz)`);
    } else if (first.status === again.status && [403, 404].includes(first.status)) {
      F(`REPLAY: same signature processed twice (${first.status}/${again.status})`);
    } else {
      N(`replay inconclusive: ${first.status}/${again.status}`);
    }
  }

  console.log('\n[5] Timestamp window (via /send)');
  for (const [label, timestamp] of [
    ['stale (-1h)', Date.now() - 3600e3],
    ['future (+1h)', Date.now() + 3600e3],
    ['zero', 0],
    ['negative', -1],
    ['string', '123'],
  ]) {
    const r = await req('/send', { headers: H, body: validSend({ timestamp }) });
    [400, 401].includes(r.status) ? P(`timestamp ${label} -> ${r.status}`) : F(`timestamp ${label} -> ${r.status}`);
  }

  console.log('\n[6] Input validation (via /send)');
  {
    const cases = [
      ['origin not JSON', { ...validSend(), origin: 'nope' }],
      ['origin with SQL metacharacters', { ...validSend(), origin: JSON.stringify({ ed25519: "' OR 1=1--", x25519: 'a'.repeat(64) }) }],
      ['destination missing x25519', { ...validSend(), destination: JSON.stringify({ ed25519: 'a'.repeat(64) }) }],
      ['envelope fields not hex', { ...validSend(), encryptedMessage: JSON.stringify({ encrypted: 'ZZZ', nonce: 'x', signature: 'y' }) }],
      ['envelope not JSON', { ...validSend(), encryptedMessage: 'plaintext' }],
      ['__proto__ in body', JSON.parse(`{"origin":"x","destination":"y","encryptedMessage":"z","timestamp":1,"signature":"${'a'.repeat(128)}","__proto__":{"polluted":true}}`)],
      ['array as body', [1, 2, 3]],
      ['signature wrong length', { ...validSend(), signature: 'ab' }],
    ];
    for (const [label, body] of cases) {
      const r = await req('/send', { headers: H, body });
      if ([400, 401].includes(r.status)) P(`${label} -> ${r.status}`);
      else if (r.status === 500) F(`${label} -> 500 (unhandled)`);
      else F(`${label} -> ${r.status}`);
    }
    ({}).polluted === undefined ? P('no prototype pollution') : F('PROTOTYPE POLLUTED via __proto__ payload');
  }

  console.log('\n[7] Payload size limit');
  {
    const r = await req('/send', { headers: H, raw: JSON.stringify({ origin: 'A'.repeat(300 * 1024) }) });
    [400, 413].includes(r.status) ? P(`~300 kB body -> ${r.status}`) : F(`oversized body -> ${r.status}`);
  }

  console.log('\n[8] HTTP methods / CORS');
  {
    for (const m of ['GET', 'PUT', 'DELETE', 'PATCH']) {
      const r = await req('/send', { method: m });
      [404, 405].includes(r.status) ? P(`/send ${m} -> ${r.status}`) : N(`/send ${m} -> ${r.status}`);
    }
    const o = await req('/send', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    const acao = o.headers.get('access-control-allow-origin');
    acao === '*' ? F('CORS: Access-Control-Allow-Origin is *') : P(`no permissive CORS (ACAO: ${acao || 'none'})`);
  }

  console.log('\n[9] Error handling');
  {
    const r = await req('/send', { headers: H, raw: '{bad json' });
    r.status === 400 ? P('malformed JSON body -> 400') : F(`malformed JSON -> ${r.status}`);
    /\bat \w+ \(|node_modules|\.js:\d+:\d+\)/.test(r.text)
      ? F('stack trace leaked in error response')
      : P('no stack trace in error responses');
  }

  console.log('\n[10] /send rate limiting (per sender key)');
  {
    const sender = identity();
    let n = 0;
    let got429 = false;
    let retryAfter = null;
    for (let i = 0; i < 45; i++) {
      const r = await req('/send', { headers: H, body: validSend({ _a: sender, timestamp: Date.now() + i }) });
      n++;
      if (r.status === 429) { got429 = true; retryAfter = r.headers.get('retry-after'); break; }
    }
    got429
      ? P(`same sender key rate-limited after ${n} requests (429, Retry-After: ${retryAfter})`)
      : F(`no 429 after ${n} same-key /send requests`);
  }

  console.log('\n[11] Privileged bucket: /cleanup key + /register identity (per-IP, 10 / 15 min)');
  {
    let spent = false;
    const cleanupCases = [
      ['empty object', {}],
      ['empty string key', { key: '' }],
      ['common placeholder', { key: 'changeme' }],
    ];
    for (const [label, body] of cleanupCases) {
      const r = await req('/cleanup', { headers: { 'content-type': 'application/json' }, body });
      if (r.status === 429) { spent = true; N(`/cleanup ${label} -> 429 (per-IP bucket already spent — restart server for a clean run)`); }
      else if (r.status === 401 || (label === 'empty object' && r.status === 400)) P(`/cleanup ${label} -> ${r.status}`);
      else F(`/cleanup ${label} -> ${r.status} (expected 401)`);
    }

    if (!spent) {
      const victim = identity();
      const attacker = identity();
      const token = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';
      const ts = Date.now();
      const r = await req('/register', {
        headers: H,
        body: {
          recipientId: victim.keyObject,
          expoPushToken: token,
          timestamp: ts,
          signature: sign(`${ts}${victim.keyObject}${token}`, attacker.ed.secretKey),
        },
      });
      r.status === 401
        ? P('/register signed by wrong key -> 401 (no identity takeover)')
        : r.status === 429
          ? N('/register identity check -> 429 (bucket spent)')
          : F(`/register cross-key signature -> ${r.status}`);
    }
  }

  console.log('\n[12] X-Forwarded-For rate-limit bypass (per-IP bucket, last test — spends it)');
  {
    // /cleanup with a bad key just returns 401. Hammer it with a rotating
    // X-Forwarded-For: if the limiter trusts the client-supplied header, every
    // fake IP is a fresh bucket and we never hit 429 (BYPASS). With trust proxy
    // set correctly the socket IP is used and 429 shows up.
    let sawThrottle = false;
    let sample = null;
    for (let i = 0; i < 20; i++) {
      const r = await req('/cleanup', {
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${i}` },
        body: { key: 'x' },
      });
      sample = r.status;
      if (r.status === 429) { sawThrottle = true; break; }
    }
    sawThrottle
      ? P('X-Forwarded-For does not reset the per-IP rate-limit bucket (trust proxy OK)')
      : F(`rate limit bypassable by rotating X-Forwarded-For (20x -> last ${sample}); set TRUST_PROXY_HOPS correctly`);
  }

  console.log(`\n=== ${pass} pass, ${failCount} fail, ${notes} note ===\n`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
