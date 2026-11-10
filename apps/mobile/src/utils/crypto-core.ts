/**
 * Pure cryptographic core. No React Native / Expo imports, no ambient randomness:
 * every operation takes its inputs explicitly (seed, nonce, keys) so it can be
 * unit-tested under plain Node. The Expo glue lives in `keys.ts`.
 */
import { ed25519 } from '@noble/curves/ed25519.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { parseKeyObject } from '@whispers/protocol';

/**
 * Storage format version for the private-key blob. v2 derives the Ed25519 and
 * X25519 secrets from independent HKDF outputs of one seed (v1 reused the raw
 * seed for both). A stored blob without `keyVersion === KEY_VERSION` is stale.
 */
export const KEY_VERSION = 2;

// Wire contract shared with the relay. Re-exported so existing importers keep
// pulling these from `./crypto-core`. Source of truth: packages/protocol.
export {
  PROTOCOL_VERSION,
  buildRegisterMessage,
  buildSendMessage,
  buildContactsMessage,
  ed25519FromKeyString,
} from '@whispers/protocol';

const HKDF_INFO_ED = 'whispers/ed25519/v1';
const HKDF_INFO_X = 'whispers/x25519/v1';
const EMPTY = new Uint8Array(0);

export type KeyPairHex = {
  ed25519: { publicKey: string; privateKey: string };
  x25519: { publicKey: string; privateKey: string };
};

export type StoredKeys = KeyPairHex & { keyVersion: number };

export type Envelope = { encrypted: string; nonce: string; signature: string };

export type DecryptedMessage = {
  /** The authenticated sender identity (the request `origin`), not a value from the plaintext. */
  senderPublicKey: string;
  message: string;
  timestamp: number;
};

// --- Hex helpers ---

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error('Invalid hex string');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// --- Key derivation ---

/** Derive a v2 key blob from a 32-byte seed. */
export function deriveKeys(seed: Uint8Array): StoredKeys {
  if (!(seed instanceof Uint8Array) || seed.length !== 32) {
    throw new Error('Seed must be 32 bytes');
  }
  const edPriv = hkdf(sha256, seed, EMPTY, utf8(HKDF_INFO_ED), 32);
  const xPriv = hkdf(sha256, seed, EMPTY, utf8(HKDF_INFO_X), 32);
  return {
    keyVersion: KEY_VERSION,
    ed25519: {
      privateKey: toHex(edPriv),
      publicKey: toHex(ed25519.getPublicKey(edPriv)),
    },
    x25519: {
      privateKey: toHex(xPriv),
      publicKey: toHex(x25519.getPublicKey(xPriv)),
    },
  };
}

/** The public identity string shared via QR: `{"ed25519":"...","x25519":"..."}`. */
export function publicKeyString(keys: KeyPairHex): string {
  return canonicalKeyString(keys.ed25519.publicKey, keys.x25519.publicKey);
}

// --- Signing ---

export function signWithEd25519(message: string, ed25519PrivateKeyHex: string): string {
  const sig = ed25519.sign(utf8(message), hexToBytes(ed25519PrivateKeyHex));
  return toHex(sig);
}

// --- Encryption ---

/**
 * Encrypt `message` for `recipientPublicKey`. `nonce` must be a fresh 12-byte
 * value supplied by the caller (never reuse one with the same shared secret).
 */
export function encryptMessage(params: {
  message: string;
  senderKeys: KeyPairHex;
  senderPublicKey: string;
  recipientPublicKey: string;
  nonce: Uint8Array;
  now?: number;
}): { destination: string; message: string } {
  const { message, senderKeys, senderPublicKey, recipientPublicKey, nonce } = params;
  if (!(nonce instanceof Uint8Array) || nonce.length !== 12) {
    throw new Error('Nonce must be 12 bytes');
  }
  const recipient = parseKeyObject(recipientPublicKey);
  if (!recipient) throw new Error('Invalid recipient public key');

  const payload = {
    publicKey: senderPublicKey,
    message,
    timestamp: params.now ?? Date.now(),
  };

  const shared = x25519.getSharedSecret(
    hexToBytes(senderKeys.x25519.privateKey),
    hexToBytes(recipient.x25519)
  );
  const cipher = chacha20poly1305(shared, nonce);
  const encrypted = cipher.encrypt(utf8(JSON.stringify(payload)));
  const signature = ed25519.sign(encrypted, hexToBytes(senderKeys.ed25519.privateKey));

  const envelope: Envelope = {
    encrypted: toHex(encrypted),
    nonce: toHex(nonce),
    signature: toHex(signature),
  };
  return { destination: recipientPublicKey, message: JSON.stringify(envelope) };
}

// --- Decryption ---

/**
 * Verify and decrypt an incoming envelope.
 *
 * Returns null (never throws for a bad message) if:
 *  - the envelope is malformed,
 *  - the Ed25519 signature does not verify against the authenticated `origin` key,
 *  - AEAD decryption fails, or
 *  - the sender identity inside the plaintext does not match `origin`.
 */
export function decryptMessage(params: {
  origin: string;
  envelope: Envelope | { encrypted?: string; nonce?: string; signature?: string };
  recipientKeys: KeyPairHex;
}): DecryptedMessage | null {
  try {
    const { origin, envelope, recipientKeys } = params;
    const { encrypted, nonce, signature } = envelope || ({} as Envelope);
    if (!encrypted || !nonce || !signature) return null;

    const originKeys = parseKeyObject(origin);
    if (!originKeys) return null;

    const encryptedBytes = hexToBytes(encrypted);

    // (1) Authenticity: signature must verify against the sender's advertised key.
    const signatureValid = ed25519.verify(
      hexToBytes(signature),
      encryptedBytes,
      hexToBytes(originKeys.ed25519)
    );
    if (!signatureValid) return null;

    // (2) Confidentiality: AEAD decrypt with the ECDH shared secret.
    const shared = x25519.getSharedSecret(
      hexToBytes(recipientKeys.x25519.privateKey),
      hexToBytes(originKeys.x25519)
    );
    const cipher = chacha20poly1305(shared, hexToBytes(nonce));
    const plaintext = cipher.decrypt(encryptedBytes);
    const payload = JSON.parse(new TextDecoder().decode(plaintext));

    // (3) Binding: the identity claimed inside the plaintext must be the
    // authenticated origin. Prevents a valid message from being reattributed.
    if (!keyStringsEqual(payload.publicKey, origin)) return null;

    if (typeof payload.message !== 'string' || typeof payload.timestamp !== 'number') {
      return null;
    }

    return {
      senderPublicKey: canonicalKeyString(originKeys.ed25519, originKeys.x25519),
      message: payload.message,
      timestamp: payload.timestamp,
    };
  } catch {
    return null;
  }
}

// --- Conversation id ---

/** Deterministic conversation id: SHA-256 of the two Ed25519 keys, sorted. */
export function conversationId(publicKey1: string, publicKey2: string): string {
  const a = parseKeyObject(publicKey1);
  const b = parseKeyObject(publicKey2);
  if (!a || !b) throw new Error('Invalid public key');
  const [k1, k2] = [a.ed25519, b.ed25519].sort();
  return toHex(sha256(utf8(k1 + k2)));
}

// --- Internal ---

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function canonicalKeyString(ed25519Hex: string, x25519Hex: string): string {
  return JSON.stringify({ ed25519: ed25519Hex.toLowerCase(), x25519: x25519Hex.toLowerCase() });
}

/** Compare two key-object strings by value, tolerating field order / 0x / case. */
function keyStringsEqual(a: unknown, b: unknown): boolean {
  const ka = parseKeyObject(a);
  const kb = parseKeyObject(b);
  if (!ka || !kb) return false;
  return (
    ka.ed25519.toLowerCase() === kb.ed25519.toLowerCase() &&
    ka.x25519.toLowerCase() === kb.x25519.toLowerCase()
  );
}
