import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519.js';

import {
  KEY_VERSION,
  deriveKeys,
  publicKeyString,
  signWithEd25519,
  encryptMessage,
  decryptMessage,
  conversationId,
  toHex,
  hexToBytes,
  type StoredKeys,
} from '../src/utils/crypto-core.ts';

function identity(fill?: number): { keys: StoredKeys; pub: string } {
  const seed = fill === undefined ? new Uint8Array(randomBytes(32)) : new Uint8Array(32).fill(fill);
  const keys = deriveKeys(seed);
  return { keys, pub: publicKeyString(keys) };
}

test('deriveKeys is deterministic and versioned', () => {
  const seed = new Uint8Array(32).fill(1);
  const a = deriveKeys(seed);
  const b = deriveKeys(seed);
  assert.deepEqual(a, b);
  assert.equal(a.keyVersion, KEY_VERSION);
});

test('deriveKeys produces distinct ed25519 and x25519 private keys (P1-7)', () => {
  const { keys } = identity(9);
  assert.notEqual(keys.ed25519.privateKey, keys.x25519.privateKey);
  assert.equal(keys.ed25519.privateKey.length, 64);
  assert.equal(keys.x25519.privateKey.length, 64);
  // Neither derived secret equals the raw seed.
  assert.notEqual(keys.ed25519.privateKey, '09'.repeat(32));
  assert.notEqual(keys.x25519.privateKey, '09'.repeat(32));
});

test('deriveKeys rejects a non-32-byte seed', () => {
  assert.throws(() => deriveKeys(new Uint8Array(16)));
  assert.throws(() => deriveKeys('nope' as unknown as Uint8Array));
});

test('publicKeyString is canonical JSON with lowercase hex', () => {
  const { keys } = identity(2);
  const s = JSON.parse(publicKeyString(keys));
  assert.deepEqual(Object.keys(s), ['ed25519', 'x25519']);
  assert.match(s.ed25519, /^[0-9a-f]{64}$/);
});

test('signWithEd25519 yields a signature that verifies', () => {
  const { keys } = identity(3);
  const sig = signWithEd25519('1699999999999DESTENV', keys.ed25519.privateKey);
  assert.equal(sig.length, 128);
  const ok = ed25519.verify(
    hexToBytes(sig),
    new TextEncoder().encode('1699999999999DESTENV'),
    hexToBytes(keys.ed25519.publicKey)
  );
  assert.equal(ok, true);
});

test('encrypt -> decrypt round trip returns the message and authenticated sender', () => {
  const alice = identity();
  const bob = identity();
  const { message: envelope } = encryptMessage({
    message: 'meet at the bridge',
    senderKeys: alice.keys,
    senderPublicKey: alice.pub,
    recipientPublicKey: bob.pub,
    nonce: new Uint8Array(randomBytes(12)),
    now: 1700000000000,
  });

  const out = decryptMessage({
    origin: alice.pub,
    envelope: JSON.parse(envelope),
    recipientKeys: bob.keys,
  });
  assert.ok(out);
  assert.equal(out!.message, 'meet at the bridge');
  assert.equal(out!.timestamp, 1700000000000);
  assert.equal(out!.senderPublicKey, alice.pub);
});

test('decrypt returns null when the signature does not verify (P0-3)', () => {
  const alice = identity();
  const bob = identity();
  const { message: envelope } = encryptMessage({
    message: 'hi',
    senderKeys: alice.keys,
    senderPublicKey: alice.pub,
    recipientPublicKey: bob.pub,
    nonce: new Uint8Array(randomBytes(12)),
  });
  const parsed = JSON.parse(envelope);
  parsed.signature = 'ff'.repeat(64); // wrong signature

  const out = decryptMessage({ origin: alice.pub, envelope: parsed, recipientKeys: bob.keys });
  assert.equal(out, null);
});

test('decrypt returns null when the ciphertext is tampered', () => {
  const alice = identity();
  const bob = identity();
  const { message: envelope } = encryptMessage({
    message: 'hi',
    senderKeys: alice.keys,
    senderPublicKey: alice.pub,
    recipientPublicKey: bob.pub,
    nonce: new Uint8Array(randomBytes(12)),
  });
  const parsed = JSON.parse(envelope);
  const bytes = hexToBytes(parsed.encrypted);
  bytes[0] ^= 0xff;
  parsed.encrypted = toHex(bytes);

  const out = decryptMessage({ origin: alice.pub, envelope: parsed, recipientKeys: bob.keys });
  assert.equal(out, null);
});

test('decrypt returns null when the plaintext identity does not match origin (P0-3 binding)', () => {
  const alice = identity();
  const bob = identity();
  const mallory = identity();

  // Alice encrypts but lies about who she is inside the payload.
  const { message: envelope } = encryptMessage({
    message: 'trust me',
    senderKeys: alice.keys,
    senderPublicKey: mallory.pub, // claim to be mallory
    recipientPublicKey: bob.pub,
    nonce: new Uint8Array(randomBytes(12)),
  });

  const out = decryptMessage({ origin: alice.pub, envelope: JSON.parse(envelope), recipientKeys: bob.keys });
  assert.equal(out, null);
});

test('decrypt returns null when origin is swapped to a third party', () => {
  const alice = identity();
  const bob = identity();
  const victim = identity();
  const { message: envelope } = encryptMessage({
    message: 'hi',
    senderKeys: alice.keys,
    senderPublicKey: alice.pub,
    recipientPublicKey: bob.pub,
    nonce: new Uint8Array(randomBytes(12)),
  });
  // Attacker forwards Alice's real envelope but relabels origin as the victim.
  const out = decryptMessage({ origin: victim.pub, envelope: JSON.parse(envelope), recipientKeys: bob.keys });
  assert.equal(out, null);
});

test('decrypt returns null for a malformed envelope', () => {
  const bob = identity();
  const alice = identity();
  assert.equal(
    decryptMessage({ origin: alice.pub, envelope: { encrypted: 'ab', signature: 'cd' }, recipientKeys: bob.keys }),
    null
  );
  assert.equal(
    decryptMessage({ origin: alice.pub, envelope: {}, recipientKeys: bob.keys }),
    null
  );
});

test('encryptMessage requires a 12-byte nonce', () => {
  const a = identity();
  const b = identity();
  assert.throws(() =>
    encryptMessage({
      message: 'x',
      senderKeys: a.keys,
      senderPublicKey: a.pub,
      recipientPublicKey: b.pub,
      nonce: new Uint8Array(8),
    })
  );
});

test('hexToBytes validates its input', () => {
  assert.deepEqual(Array.from(hexToBytes('00ff10')), [0, 255, 16]);
  assert.throws(() => hexToBytes('abc'));       // odd length
  assert.throws(() => hexToBytes('zz'));        // non-hex
  assert.throws(() => hexToBytes(123 as unknown as string));
});

test('conversationId is deterministic and order-independent', () => {
  const a = identity(1);
  const b = identity(2);
  const id1 = conversationId(a.pub, b.pub);
  const id2 = conversationId(b.pub, a.pub);
  assert.equal(id1, id2);
  assert.match(id1, /^[0-9a-f]{64}$/);
  assert.notEqual(id1, conversationId(a.pub, identity(3).pub));
});
