import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { ed25519 } from '@noble/curves/ed25519.js';
import {
  KEY_VERSION,
  deriveKeys,
  publicKeyString,
  signWithEd25519,
  encryptMessage as coreEncrypt,
  decryptMessage as coreDecrypt,
  conversationId as coreConversationId,
  type StoredKeys,
  type KeyPairHex,
  type Envelope,
  type DecryptedMessage,
} from './crypto-core';

// Polyfill crypto.getRandomValues for React Native (used by @noble internals).
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {} as any;
}
if (typeof globalThis.crypto.getRandomValues === 'undefined') {
  globalThis.crypto.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
    const typedArray = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    typedArray.set(Crypto.getRandomBytes(typedArray.length));
    return array;
  };
}

const PUBLIC_KEY = 'user_public_key';
const PRIVATE_KEY = 'user_private_key';
/** Set when keys were force-regenerated because the stored blob was stale. */
const STALE_KEY_FLAG = 'keys_regenerated_notice';

export type Keys = { publicKey: string; privateKey: string };

/** Thrown by getKeys() when the stored private key predates KEY_VERSION. */
export class StaleKeyError extends Error {
  constructor() {
    super('Stored keys are from an unsupported version');
    this.name = 'StaleKeyError';
  }
}

/** Thrown by getKeys() when secure storage cannot be read/parsed. */
export class KeyAccessError extends Error {
  constructor(cause?: unknown) {
    super('Unable to read keys from secure storage');
    this.name = 'KeyAccessError';
    (this as any).cause = cause;
  }
}

function parseStored(privateKey: string): StoredKeys {
  const parsed = JSON.parse(privateKey);
  if (!parsed || parsed.keyVersion !== KEY_VERSION) {
    throw new StaleKeyError();
  }
  return parsed as StoredKeys;
}

async function createAndStoreKeys(): Promise<Keys> {
  const seed = ed25519.utils.randomSecretKey();
  const keys = deriveKeys(seed);
  const privateKey = JSON.stringify(keys);
  const publicKey = publicKeyString(keys);
  await SecureStore.setItemAsync(PUBLIC_KEY, publicKey);
  await SecureStore.setItemAsync(PRIVATE_KEY, privateKey);
  return { publicKey, privateKey };
}

/**
 * Read the stored key pair.
 *
 * Throws StaleKeyError if the stored blob is from an older format, and
 * KeyAccessError on any storage failure. Callers that want the app to recover
 * automatically should go through ensureKeys() at startup instead of catching
 * here.
 */
export async function getKeys(): Promise<Keys> {
  let publicKey: string | null;
  let privateKey: string | null;
  try {
    publicKey = await SecureStore.getItemAsync(PUBLIC_KEY);
    privateKey = await SecureStore.getItemAsync(PRIVATE_KEY);
  } catch (error) {
    throw new KeyAccessError(error);
  }

  if (!publicKey || !privateKey) {
    throw new StaleKeyError();
  }
  parseStored(privateKey); // validates keyVersion, throws StaleKeyError otherwise
  return { publicKey, privateKey };
}

/**
 * Ensure a usable, current key pair exists. Call once at app startup.
 *
 * - No keys yet, or stale-format keys  -> generate a fresh v2 pair and raise the
 *   "keys regenerated" notice flag (the old identity is discarded; contacts must
 *   be re-exchanged).
 * - Storage error -> rethrow (do not silently mint a throwaway identity).
 */
export async function ensureKeys(): Promise<Keys> {
  try {
    return await getKeys();
  } catch (error) {
    if (error instanceof StaleKeyError) {
      await clearKeys();
      const keys = await createAndStoreKeys();
      try {
        await SecureStore.setItemAsync(STALE_KEY_FLAG, '1');
      } catch {
        /* non-fatal: the notice is a nicety */
      }
      return keys;
    }
    throw error;
  }
}

/** Read and clear the one-time "keys were regenerated" notice. */
export async function consumeKeyRegeneratedNotice(): Promise<boolean> {
  try {
    const flag = await SecureStore.getItemAsync(STALE_KEY_FLAG);
    if (flag) {
      await SecureStore.deleteItemAsync(STALE_KEY_FLAG);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Regenerate and persist a new key pair (used by the Profile screen). */
export async function regenerateKeys(): Promise<Keys> {
  return createAndStoreKeys();
}

/** Remove all key material from secure storage (emergency wipe / regeneration). */
export async function clearKeys(): Promise<void> {
  await SecureStore.deleteItemAsync(PUBLIC_KEY);
  await SecureStore.deleteItemAsync(PRIVATE_KEY);
  await SecureStore.deleteItemAsync(STALE_KEY_FLAG);
}

function keyPair(privateKey: string): KeyPairHex {
  return parseStored(privateKey);
}

/** Deterministic conversation id shared by both parties. */
export async function generateConversationId(
  publicKey1: string,
  publicKey2: string
): Promise<string> {
  return coreConversationId(publicKey1, publicKey2);
}

/** Sign a backend-auth message with the Ed25519 identity key. */
export async function signMessage(message: string): Promise<string> {
  const { privateKey } = await getKeys();
  return signWithEd25519(message, keyPair(privateKey).ed25519.privateKey);
}

/** Encrypt a chat message for a recipient's public key. */
export async function encryptMessage(
  message: string,
  recipientPublicKey: string
): Promise<{ destination: string; message: string }> {
  const { privateKey, publicKey } = await getKeys();
  const nonce = Crypto.getRandomBytes(12);
  return coreEncrypt({
    message,
    senderKeys: keyPair(privateKey),
    senderPublicKey: publicKey,
    recipientPublicKey,
    nonce,
  });
}

/** Verify and decrypt an incoming message. Returns null if anything fails. */
export async function decryptMessage(encryptedPayload: {
  origin: string;
  destination: string;
  encryptedMessage: Envelope | { encrypted?: string; nonce?: string; signature?: string };
}): Promise<DecryptedMessage | null> {
  const { privateKey } = await getKeys();
  return coreDecrypt({
    origin: encryptedPayload.origin,
    envelope: encryptedPayload.encryptedMessage,
    recipientKeys: keyPair(privateKey),
  });
}
