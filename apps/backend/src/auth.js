const crypto = require('crypto');
const nacl = require('tweetnacl');

// Wire contract shared with the client. See packages/protocol.
const {
  PROTOCOL_VERSION,
  FORWARD_SKEW_MS,
  buildRegisterMessage,
  buildSendMessage,
  buildContactsMessage,
  ed25519FromKeyString,
} = require('@whispers/protocol');

const HEX_64 = /^[a-f0-9]{64}$/i;
const HEX_128 = /^[a-f0-9]{128}$/i;
const HEX_ANY = /^[a-f0-9]+$/i;

function isHex(str, exactLen) {
  if (typeof str !== 'string') return false;
  if (exactLen !== undefined) return new RegExp(`^[a-f0-9]{${exactLen}}$`, 'i').test(str);
  return str.length > 0 && str.length % 2 === 0 && HEX_ANY.test(str);
}

/**
 * Validate a stringified key object: JSON with 64-hex `ed25519` and `x25519`.
 * Accepts an optional `0x` prefix on each key.
 */
function isValidKeyObject(raw) {
  if (typeof raw !== 'string' || raw.length > 500) return false;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== 'object') return false;
  const prefixed = /^(0x)?[a-f0-9]{64}$/i;
  return typeof parsed.ed25519 === 'string' && prefixed.test(parsed.ed25519) &&
         typeof parsed.x25519 === 'string' && prefixed.test(parsed.x25519);
}

/** Validate the encrypted-message envelope: JSON with hex `encrypted`, `nonce`, `signature`. */
function isValidEncryptedMessage(raw) {
  if (typeof raw !== 'string' || raw.length > 5000) return false;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  return isHex(parsed.encrypted) && isHex(parsed.nonce) && isHex(parsed.signature);
}

/**
 * One-directional timestamp check. Rejects timestamps too far in the future
 * (skew) or older than `toleranceMs`.
 */
function isTimestampValid(timestamp, toleranceMs, now = Date.now()) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
    return false;
  }
  if (timestamp > now + FORWARD_SKEW_MS) return false;
  if (timestamp < now - toleranceMs) return false;
  return true;
}

/** Verify an ed25519 signature. All inputs are hex strings except `message`. */
function verifySignature(publicKeyHex, message, signatureHex) {
  try {
    if (!HEX_64.test(publicKeyHex) || !HEX_128.test(signatureHex)) return false;
    const messageBytes = Buffer.from(message, 'utf8');
    const sigBytes = Buffer.from(signatureHex, 'hex');
    const keyBytes = Buffer.from(publicKeyHex, 'hex');
    return nacl.sign.detached.verify(messageBytes, sigBytes, keyBytes);
  } catch {
    return false;
  }
}

/**
 * Stable key for replay detection: sha256 of the signing key + the signature.
 * A given signature from a given key is accepted exactly once.
 */
function nonceHash(signerEd25519Hex, signatureHex) {
  return crypto
    .createHash('sha256')
    .update(`${signerEd25519Hex}:${signatureHex}`)
    .digest('hex');
}

/** Constant-time string comparison. */
function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Short fingerprint of a key for logs (first 8 hex chars). */
function fingerprint(hex) {
  return typeof hex === 'string' && hex.length >= 8 ? hex.slice(0, 8) : '????????';
}

module.exports = {
  // Wire contract, re-exported from @whispers/protocol under the names the rest
  // of the backend already uses.
  PROTOCOL_VERSION,
  FORWARD_SKEW_MS,
  parseEd25519: ed25519FromKeyString,
  registerMessage: buildRegisterMessage,
  sendMessage: buildSendMessage,
  contactsMessage: buildContactsMessage,
  // Server-side validation helpers.
  HEX_64,
  HEX_128,
  isHex,
  isValidKeyObject,
  isValidEncryptedMessage,
  isTimestampValid,
  verifySignature,
  nonceHash,
  timingSafeEqualStr,
  fingerprint,
};
