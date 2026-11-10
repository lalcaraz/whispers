const test = require('node:test');
const assert = require('node:assert/strict');
const nacl = require('tweetnacl');
const auth = require('../src/auth');
const { makeIdentity, sign, toHex } = require('./helpers');

test('isValidKeyObject accepts a well-formed key object', () => {
  const { keyObject } = makeIdentity();
  assert.equal(auth.isValidKeyObject(keyObject), true);
});

test('isValidKeyObject rejects junk, non-JSON, wrong lengths, oversize', () => {
  assert.equal(auth.isValidKeyObject('not json'), false);
  assert.equal(auth.isValidKeyObject(JSON.stringify({ ed25519: 'abc', x25519: 'abc' })), false);
  assert.equal(auth.isValidKeyObject(JSON.stringify({ ed25519: 'a'.repeat(64) })), false);
  assert.equal(auth.isValidKeyObject('x'.repeat(600)), false);
  assert.equal(auth.isValidKeyObject(42), false);
});

test('parseEd25519 extracts the bare hex, tolerates 0x prefix, rejects bad input', () => {
  const hex = 'a'.repeat(64);
  assert.equal(auth.parseEd25519(JSON.stringify({ ed25519: hex, x25519: hex })), hex);
  assert.equal(auth.parseEd25519(JSON.stringify({ ed25519: `0x${hex}`, x25519: hex })), hex);
  assert.equal(auth.parseEd25519('nope'), null);
  assert.equal(auth.parseEd25519(JSON.stringify({ ed25519: 'short' })), null);
});

test('isValidEncryptedMessage requires hex encrypted/nonce/signature', () => {
  assert.equal(
    auth.isValidEncryptedMessage(JSON.stringify({ encrypted: 'ab', nonce: 'cd', signature: 'ef' })),
    true
  );
  assert.equal(
    auth.isValidEncryptedMessage(JSON.stringify({ encrypted: 'xyz', nonce: 'cd', signature: 'ef' })),
    false
  );
  assert.equal(auth.isValidEncryptedMessage(JSON.stringify({ encrypted: 'ab' })), false);
  assert.equal(auth.isValidEncryptedMessage('a'.repeat(6000)), false);
});

test('isTimestampValid: now is valid, far past invalid, far future invalid', () => {
  const now = 1_000_000_000_000;
  const tol = 300_000;
  assert.equal(auth.isTimestampValid(now, tol, now), true);
  assert.equal(auth.isTimestampValid(now - tol - 1, tol, now), false);
  assert.equal(auth.isTimestampValid(now + auth.FORWARD_SKEW_MS + 1, tol, now), false);
  assert.equal(auth.isTimestampValid(now + 5_000, tol, now), true, 'small forward skew allowed');
  assert.equal(auth.isTimestampValid('123', tol, now), false);
  assert.equal(auth.isTimestampValid(-1, tol, now), false);
});

test('verifySignature: valid signature passes, tampered message/sig/key fail', () => {
  const id = makeIdentity();
  const msg = '123abc';
  const sig = sign(msg, id.secretKey);
  assert.equal(auth.verifySignature(id.ed25519Hex, msg, sig), true);
  assert.equal(auth.verifySignature(id.ed25519Hex, `${msg}x`, sig), false);
  assert.equal(auth.verifySignature(id.ed25519Hex, msg, 'ff'.repeat(64)), false);
  const other = makeIdentity();
  assert.equal(auth.verifySignature(other.ed25519Hex, msg, sig), false);
});

test('verifySignature: malformed hex inputs return false, never throw', () => {
  assert.equal(auth.verifySignature('nothex', 'm', 'nothex'), false);
  assert.equal(auth.verifySignature('a'.repeat(64), 'm', 'a'.repeat(10)), false);
});

test('message builders are order-sensitive and separatorless', () => {
  assert.equal(auth.registerMessage(1, 'DEST', 'TOK'), '1DESTTOK');
  assert.equal(auth.sendMessage(1, 'DEST', 'ENV'), '1DESTENV');
  assert.equal(auth.contactsMessage(1, 'add', 'KEY'), '1addKEY');
});

test('nonceHash is stable and distinguishes inputs', () => {
  const a = auth.nonceHash('key1', 'sig1');
  assert.equal(a, auth.nonceHash('key1', 'sig1'));
  assert.notEqual(a, auth.nonceHash('key1', 'sig2'));
  assert.notEqual(a, auth.nonceHash('key2', 'sig1'));
  assert.match(a, /^[a-f0-9]{64}$/);
});

test('timingSafeEqualStr compares correctly', () => {
  assert.equal(auth.timingSafeEqualStr('secret', 'secret'), true);
  assert.equal(auth.timingSafeEqualStr('secret', 'Secret'), false);
  assert.equal(auth.timingSafeEqualStr('secret', 'secretx'), false);
  assert.equal(auth.timingSafeEqualStr('', ''), true);
});

test('sanity: tweetnacl detached verify contract matches our usage', () => {
  const kp = nacl.sign.keyPair();
  const m = Buffer.from('hello', 'utf8');
  const s = nacl.sign.detached(m, kp.secretKey);
  assert.equal(nacl.sign.detached.verify(m, s, kp.publicKey), true);
  assert.equal(toHex(s).length, 128);
});
