const test = require('node:test');
const assert = require('node:assert/strict');

const { buildTestApp } = require('./build');
const auth = require('../src/auth');
const {
  makeIdentity,
  sign,
  fakeToken,
  fakeEnvelope,
  request,
  PROTO_HEADER,
} = require('./helpers');

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

/** Build a signed /register body for an identity. */
function registerBody(id, token = fakeToken(), ts = Date.now()) {
  const signature = sign(auth.registerMessage(ts, id.keyObject, token), id.secretKey);
  return { recipientId: id.keyObject, expoPushToken: token, timestamp: ts, signature };
}

/** Build a signed /contacts body. */
function contactsBody(owner, action, contactHex, ts = Date.now()) {
  const signature = sign(auth.contactsMessage(ts, action, contactHex), owner.secretKey);
  return { recipientId: owner.keyObject, action, contactEd25519: contactHex, timestamp: ts, signature };
}

/** Build a signed /send body from `from` to `to`. */
function sendBody(from, to, ts = Date.now(), envelope = fakeEnvelope()) {
  const signature = sign(auth.sendMessage(ts, to.keyObject, envelope), from.secretKey);
  return {
    encryptedMessage: envelope,
    destination: to.keyObject,
    origin: from.keyObject,
    timestamp: ts,
    signature,
  };
}

test('health check needs no auth and reports the protocol version', async () => {
  const { app } = buildTestApp();
  const server = await listen(app);
  const res = await request(server, 'GET', '/health');
  server.close();
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.protocol, auth.PROTOCOL_VERSION);
});

test('endpoints reject a missing / wrong protocol header', async () => {
  const { app } = buildTestApp();
  const server = await listen(app);
  const id = makeIdentity();
  const noHeader = await request(server, 'POST', '/register', registerBody(id));
  const badHeader = await request(server, 'POST', '/register', registerBody(id), {
    'x-whispers-protocol': '1',
  });
  server.close();
  assert.equal(noHeader.status, 400);
  assert.equal(badHeader.status, 400);
});

test('/register accepts a correctly signed request and is idempotent', async () => {
  const { app, db } = buildTestApp();
  const server = await listen(app);
  const id = makeIdentity();

  const first = await request(server, 'POST', '/register', registerBody(id), PROTO_HEADER);
  assert.equal(first.status, 200);
  assert.equal(first.body.success, true);
  assert.equal(db.getToken(id.keyObject), fakeToken());

  const newToken = fakeToken('bbbbbbbbbbbbbbbbbbbbbb');
  const second = await request(server, 'POST', '/register', registerBody(id, newToken), PROTO_HEADER);
  server.close();
  assert.equal(second.status, 200);
  assert.equal(db.getToken(id.keyObject), newToken);
});

test('/register rejects a signature from the wrong key (hijack attempt)', async () => {
  const { app, db } = buildTestApp();
  const server = await listen(app);
  const victim = makeIdentity();
  const attacker = makeIdentity();
  const attackerToken = fakeToken('cccccccccccccccccccccc');

  // Attacker tries to bind the victim's recipientId to the attacker's token,
  // signing with the attacker's key.
  const ts = Date.now();
  const forged = {
    recipientId: victim.keyObject,
    expoPushToken: attackerToken,
    timestamp: ts,
    signature: sign(auth.registerMessage(ts, victim.keyObject, attackerToken), attacker.secretKey),
  };
  const res = await request(server, 'POST', '/register', forged, PROTO_HEADER);
  server.close();
  assert.equal(res.status, 401);
  assert.equal(db.getToken(victim.keyObject), null);
});

test('/register rejects stale and far-future timestamps', async () => {
  const { app } = buildTestApp();
  const server = await listen(app);
  const id = makeIdentity();
  const stale = await request(
    server,
    'POST',
    '/register',
    registerBody(id, fakeToken(), Date.now() - 400_000),
    PROTO_HEADER
  );
  const future = await request(
    server,
    'POST',
    '/register',
    registerBody(id, fakeToken(), Date.now() + 120_000),
    PROTO_HEADER
  );
  server.close();
  assert.equal(stale.status, 401);
  assert.equal(future.status, 401);
});

test('a captured /register request cannot be replayed', async () => {
  const { app } = buildTestApp();
  const server = await listen(app);
  const id = makeIdentity();
  const body = registerBody(id);
  const ok = await request(server, 'POST', '/register', body, PROTO_HEADER);
  const replay = await request(server, 'POST', '/register', body, PROTO_HEADER);
  server.close();
  assert.equal(ok.status, 200);
  assert.equal(replay.status, 401);
  assert.match(replay.body.error, /already processed/);
});

test('/send delivers when the recipient has allow-listed the sender', async () => {
  const { app, sent } = buildTestApp();
  const server = await listen(app);
  const alice = makeIdentity();
  const bob = makeIdentity();

  await request(server, 'POST', '/register', registerBody(bob), PROTO_HEADER);
  const add = await request(
    server,
    'POST',
    '/contacts',
    contactsBody(bob, 'add', alice.ed25519Hex),
    PROTO_HEADER
  );
  assert.equal(add.status, 200);

  const res = await request(server, 'POST', '/send', sendBody(alice, bob), PROTO_HEADER);
  server.close();
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, fakeToken());
  assert.equal(sent[0].data.origin, alice.keyObject);
});

test('/send is blocked (403) when the sender is not allow-listed', async () => {
  const { app, sent } = buildTestApp();
  const server = await listen(app);
  const alice = makeIdentity();
  const bob = makeIdentity();

  await request(server, 'POST', '/register', registerBody(bob), PROTO_HEADER);
  const res = await request(server, 'POST', '/send', sendBody(alice, bob), PROTO_HEADER);
  server.close();
  assert.equal(res.status, 403);
  assert.equal(sent.length, 0);
});

test('/send 403 does not reveal whether the recipient exists', async () => {
  const { app } = buildTestApp();
  const server = await listen(app);
  const alice = makeIdentity();
  const ghost = makeIdentity(); // never registered

  const res = await request(server, 'POST', '/send', sendBody(alice, ghost), PROTO_HEADER);
  server.close();
  assert.equal(res.status, 403); // allow-list check comes before the recipient lookup
});

test('/send rejects a tampered envelope (signature no longer matches)', async () => {
  const { app } = buildTestApp();
  const server = await listen(app);
  const alice = makeIdentity();
  const bob = makeIdentity();
  await request(server, 'POST', '/register', registerBody(bob), PROTO_HEADER);
  await request(server, 'POST', '/contacts', contactsBody(bob, 'add', alice.ed25519Hex), PROTO_HEADER);

  const body = sendBody(alice, bob);
  body.encryptedMessage = fakeEnvelope().replace('ab', 'ba'); // change after signing
  const res = await request(server, 'POST', '/send', body, PROTO_HEADER);
  server.close();
  assert.equal(res.status, 401);
});

test('a captured /send request cannot be replayed', async () => {
  const { app, sent } = buildTestApp();
  const server = await listen(app);
  const alice = makeIdentity();
  const bob = makeIdentity();
  await request(server, 'POST', '/register', registerBody(bob), PROTO_HEADER);
  await request(server, 'POST', '/contacts', contactsBody(bob, 'add', alice.ed25519Hex), PROTO_HEADER);

  const body = sendBody(alice, bob);
  const ok = await request(server, 'POST', '/send', body, PROTO_HEADER);
  const replay = await request(server, 'POST', '/send', body, PROTO_HEADER);
  server.close();
  assert.equal(ok.status, 200);
  assert.equal(replay.status, 401);
  assert.equal(sent.length, 1);
});

test('/contacts remove revokes send access', async () => {
  const { app } = buildTestApp();
  const server = await listen(app);
  const alice = makeIdentity();
  const bob = makeIdentity();
  await request(server, 'POST', '/register', registerBody(bob), PROTO_HEADER);
  await request(server, 'POST', '/contacts', contactsBody(bob, 'add', alice.ed25519Hex), PROTO_HEADER);
  await request(server, 'POST', '/contacts', contactsBody(bob, 'remove', alice.ed25519Hex), PROTO_HEADER);

  const res = await request(server, 'POST', '/send', sendBody(alice, bob), PROTO_HEADER);
  server.close();
  assert.equal(res.status, 403);
});

test('/contacts rejects a signature from someone other than the list owner', async () => {
  const { app } = buildTestApp();
  const server = await listen(app);
  const bob = makeIdentity();
  const attacker = makeIdentity();
  const mallory = makeIdentity();

  // attacker signs a request to add mallory to bob's allow-list
  const ts = Date.now();
  const forged = {
    recipientId: bob.keyObject,
    action: 'add',
    contactEd25519: mallory.ed25519Hex,
    timestamp: ts,
    signature: sign(auth.contactsMessage(ts, 'add', mallory.ed25519Hex), attacker.secretKey),
  };
  const res = await request(server, 'POST', '/contacts', forged, PROTO_HEADER);
  server.close();
  assert.equal(res.status, 401);
});

test('/cleanup requires the shared key (constant-time) and removes stale rows', async () => {
  const { app, db } = buildTestApp();
  const server = await listen(app);

  const bad = await request(server, 'POST', '/cleanup', { key: 'wrong' });
  assert.equal(bad.status, 401);

  db.raw.prepare(
    "INSERT INTO recipients (recipient_id, expo_push_token, updated_at) VALUES ('old', 't', datetime('now','-48 hours'))"
  ).run();

  const ok = await request(server, 'POST', '/cleanup', { key: 'test-cleanup-key-1234567890' });
  server.close();
  assert.equal(ok.status, 200);
  assert.equal(ok.body.deletedCount, 1);
});

test('/cleanup with an empty configured key denies everyone', async () => {
  const { app } = buildTestApp({ cleanupKey: '' });
  const server = await listen(app);
  const res = await request(server, 'POST', '/cleanup', { key: '' });
  server.close();
  assert.equal(res.status, 401);
});

test('oversized body is rejected with 413', async () => {
  const { app } = buildTestApp();
  const server = await listen(app);
  const huge = { blob: 'x'.repeat(20000) };
  const res = await request(server, 'POST', '/register', huge, PROTO_HEADER);
  server.close();
  assert.equal(res.status, 413);
});

test('malformed JSON is rejected with 400', async () => {
  const { app } = buildTestApp();
  const server = await listen(app);
  const { port } = server.address();
  const http = require('node:http');
  const status = await new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, method: 'POST', path: '/register', headers: { 'content-type': 'application/json' } },
      (res) => resolve(res.statusCode)
    );
    req.end('{ not valid json ');
  });
  server.close();
  assert.equal(status, 400);
});

test('helmet headers are present and x-powered-by is gone', async () => {
  const { app } = buildTestApp();
  const server = await listen(app);
  const { port } = server.address();
  const http = require('node:http');
  const headers = await new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port, path: '/health' }, (res) => resolve(res.headers));
  });
  server.close();
  assert.equal(headers['x-powered-by'], undefined);
  assert.ok(headers['x-content-type-options']);
});
