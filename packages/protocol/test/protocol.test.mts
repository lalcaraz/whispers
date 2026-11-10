import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROTOCOL_VERSION,
  PROTOCOL_HEADER,
  FORWARD_SKEW_MS,
  buildRegisterMessage,
  buildSendMessage,
  buildContactsMessage,
  parseKeyObject,
  ed25519FromKeyString,
} from '../src/index.ts';

test('wire constants are the expected values', () => {
  assert.equal(PROTOCOL_VERSION, '2');
  assert.equal(PROTOCOL_HEADER, 'x-whispers-protocol');
  assert.equal(FORWARD_SKEW_MS, 30_000);
});

test('signed-message builders concatenate with no separators', () => {
  assert.equal(buildRegisterMessage(1730000000000, 'RID', 'TOKEN'), '1730000000000RIDTOKEN');
  assert.equal(buildSendMessage(1730000000000, 'DEST', 'ENVELOPE'), '1730000000000DESTENVELOPE');
  assert.equal(buildContactsMessage(1730000000000, 'add', 'KEYHEX'), '1730000000000addKEYHEX');
  assert.equal(buildContactsMessage(1730000000000, 'remove', 'KEYHEX'), '1730000000000removeKEYHEX');
});

test('parseKeyObject returns bare hex, preserves case, tolerates 0x', () => {
  const ed = 'A'.repeat(64);
  const x = 'b'.repeat(64);
  assert.deepEqual(parseKeyObject(JSON.stringify({ ed25519: ed, x25519: x })), { ed25519: ed, x25519: x });
  assert.deepEqual(
    parseKeyObject(JSON.stringify({ ed25519: `0x${ed}`, x25519: `0X${x}` })),
    { ed25519: ed, x25519: x },
  );
});

test('parseKeyObject rejects malformed input', () => {
  assert.equal(parseKeyObject('not json'), null);
  assert.equal(parseKeyObject(JSON.stringify({ ed25519: 'short', x25519: 'short' })), null);
  assert.equal(parseKeyObject(JSON.stringify({ ed25519: 'a'.repeat(64) })), null);
  assert.equal(parseKeyObject(42), null);
  assert.equal(parseKeyObject(null), null);
});

test('ed25519FromKeyString is lenient on x25519 (server parseEd25519 parity)', () => {
  // parseKeyObject needs both keys; ed25519FromKeyString needs only ed25519,
  // matching the server's original parseEd25519 used on unvalidated input.
  const onlyEd = JSON.stringify({ ed25519: 'a'.repeat(64) });
  assert.equal(parseKeyObject(onlyEd), null);
  assert.equal(ed25519FromKeyString(onlyEd), 'a'.repeat(64));
});

test('ed25519FromKeyString extracts the bare, lowercase hex', () => {
  assert.equal(
    ed25519FromKeyString(JSON.stringify({ ed25519: 'A'.repeat(64), x25519: 'b'.repeat(64) })),
    'a'.repeat(64),
  );
  assert.equal(
    ed25519FromKeyString(JSON.stringify({ ed25519: `0x${'C'.repeat(64)}`, x25519: 'd'.repeat(64) })),
    'c'.repeat(64),
  );
  assert.equal(ed25519FromKeyString('garbage'), null);
});
