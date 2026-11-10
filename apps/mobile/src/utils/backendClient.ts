import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import {
  PROTOCOL_VERSION,
  buildRegisterMessage,
  buildSendMessage,
  buildContactsMessage,
} from './crypto-core';
import { signMessage, ensureKeys } from './keys';
import { DEFAULT_BACKEND_URL, STORAGE_KEYS } from '@/constants';

const HEADERS = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true',
  'User-Agent': 'WhispersApp',
  'x-whispers-protocol': PROTOCOL_VERSION,
} as const;

/** Error carrying the backend HTTP status so callers can branch on 401/403/404/... */
export class BackendError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'BackendError';
    this.status = status;
  }
}

async function getBackendUrl(): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(STORAGE_KEYS.BACKEND_URL)) || DEFAULT_BACKEND_URL;
  } catch {
    return DEFAULT_BACKEND_URL;
  }
}

async function post(path: string, body: unknown, timeout: number): Promise<void> {
  try {
    await axios.post(`${await getBackendUrl()}${path}`, body, { headers: HEADERS, timeout });
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw new BackendError(err.message, err.response?.status);
    }
    throw err;
  }
}

/** Register (or refresh) this device's push token. Signed by the identity key. */
export async function registerDevice(expoPushToken: string): Promise<void> {
  const { publicKey } = await ensureKeys();
  const timestamp = Date.now();
  const signature = await signMessage(buildRegisterMessage(timestamp, publicKey, expoPushToken));
  await post('/register', { recipientId: publicKey, expoPushToken, timestamp, signature }, 30000);
}

/** Relay an encrypted envelope to a recipient. Signed by the sender's identity key. */
export async function sendEncrypted(payload: {
  origin: string;
  destination: string;
  encryptedMessage: string;
}): Promise<void> {
  const timestamp = Date.now();
  const signature = await signMessage(
    buildSendMessage(timestamp, payload.destination, payload.encryptedMessage)
  );
  await post('/send', { ...payload, timestamp, signature }, 10000);
}

/** Add or remove a sender from this identity's server-side allow-list. */
export async function contactAction(
  action: 'add' | 'remove',
  contactEd25519: string
): Promise<void> {
  const { publicKey } = await ensureKeys();
  const timestamp = Date.now();
  const signature = await signMessage(buildContactsMessage(timestamp, action, contactEd25519));
  await post(
    '/contacts',
    { recipientId: publicKey, action, contactEd25519, timestamp, signature },
    15000
  );
}
