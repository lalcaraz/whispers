import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519.js';

import {
  PROTOCOL_VERSION,
  buildRegisterMessage,
  buildSendMessage,
  buildContactsMessage,
  ed25519FromKeyString,
  deriveKeys,
  publicKeyString,
  signWithEd25519,
  hexToBytes,
} from '../src/utils/crypto-core.ts';

test('PROTOCOL_VERSION is the expected wire value', () => {
  assert.equal(PROTOCOL_VERSION, '2');
});

test('signed-message builders match the server format exactly (no separators)', () => {
  assert.equal(buildRegisterMessage(1730000000000, 'RID', 'TOKEN'), '1730000000000RIDTOKEN');
  assert.equal(buildSendMessage(1730000000000, 'DEST', 'ENVELOPE'), '1730000000000DESTENVELOPE');
  assert.equal(buildContactsMessage(1730000000000, 'add', 'KEYHEX'), '1730000000000addKEYHEX');
  assert.equal(buildContactsMessage(1730000000000, 'remove', 'KEYHEX'), '1730000000000removeKEYHEX');
});

test('ed25519FromKeyString extracts lowercase bare hex', () => {
  const hex = 'A'.repeat(64);
  assert.equal(ed25519FromKeyString(JSON.stringify({ ed25519: hex, x25519: 'b'.repeat(64) })), 'a'.repeat(64));
  assert.equal(ed25519FromKeyString(JSON.stringify({ ed25519: `0x${'c'.repeat(64)}`, x25519: 'd'.repeat(64) })), 'c'.repeat(64));
  assert.equal(ed25519FromKeyString('garbage'), null);
});

// Simulate the server-side verification for each endpoint.
function serverVerify(publicKeyHex: string, message: string, signatureHex: string): boolean {
  return ed25519.verify(hexToBytes(signatureHex), new TextEncoder().encode(message), hexToBytes(publicKeyHex));
}

test('a client-signed /register body verifies server-side', () => {
  const keys = deriveKeys(new Uint8Array(randomBytes(32)));
  const pub = publicKeyString(keys);
  const token = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';
  const ts = Date.now();
  const sig = signWithEd25519(buildRegisterMessage(ts, pub, token), keys.ed25519.privateKey);
  assert.equal(serverVerify(JSON.parse(pub).ed25519, buildRegisterMessage(ts, pub, token), sig), true);
  // wrong token -> fails
  assert.equal(serverVerify(JSON.parse(pub).ed25519, buildRegisterMessage(ts, pub, 'other'), sig), false);
});

test('a client-signed /contacts body verifies server-side', () => {
  const keys = deriveKeys(new Uint8Array(randomBytes(32)));
  const pub = publicKeyString(keys);
  const contact = 'e'.repeat(64);
  const ts = Date.now();
  const sig = signWithEd25519(buildContactsMessage(ts, 'add', contact), keys.ed25519.privateKey);
  assert.equal(serverVerify(JSON.parse(pub).ed25519, buildContactsMessage(ts, 'add', contact), sig), true);
  assert.equal(serverVerify(JSON.parse(pub).ed25519, buildContactsMessage(ts, 'remove', contact), sig), false);
});

test('a client-signed /send body verifies against the origin key', () => {
  const alice = deriveKeys(new Uint8Array(randomBytes(32)));
  const bob = deriveKeys(new Uint8Array(randomBytes(32)));
  const origin = publicKeyString(alice);
  const destination = publicKeyString(bob);
  const envelope = JSON.stringify({ encrypted: 'ab', nonce: 'cd', signature: 'ef' });
  const ts = Date.now();
  const sig = signWithEd25519(buildSendMessage(ts, destination, envelope), alice.ed25519.privateKey);
  assert.equal(serverVerify(JSON.parse(origin).ed25519, buildSendMessage(ts, destination, envelope), sig), true);
  // a different sender's key must not verify
  assert.equal(serverVerify(JSON.parse(destination).ed25519, buildSendMessage(ts, destination, envelope), sig), false);
});
