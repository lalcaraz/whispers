/**
 * Whispers wire protocol — the contract shared by the client (`apps/mobile`) and
 * the relay (`apps/backend`). Pure: no crypto library, no node built-ins, no
 * ambient state. Everything here must stay byte-for-byte identical on both sides,
 * which is exactly why it lives in one package instead of two copies.
 */

/**
 * Protocol version. Clients send it in the `x-whispers-protocol` header on every
 * authenticated endpoint; the server rejects a mismatch. Bump when any
 * signed-message format below changes.
 */
export const PROTOCOL_VERSION = '2';

/** Header carrying {@link PROTOCOL_VERSION} on authenticated requests. */
export const PROTOCOL_HEADER = 'x-whispers-protocol';

/**
 * Reject timestamps more than this far in the future (clock-skew allowance).
 * Both sides agree on it so a client's "recent" is the server's "acceptable".
 */
export const FORWARD_SKEW_MS = 30 * 1000;

// --- Canonical signed-message builders --------------------------------------
// No separators between fields. The client signs these strings; the server
// reconstructs and verifies them. Any drift here breaks every authenticated
// call, so both apps import these rather than re-implementing them.

/** Signed body of `POST /register`: `timestamp + recipientId + expoPushToken`. */
export function buildRegisterMessage(
  timestamp: number,
  recipientId: string,
  expoPushToken: string,
): string {
  return `${timestamp}${recipientId}${expoPushToken}`;
}

/** Signed body of `POST /send`: `timestamp + destination + encryptedMessage`. */
export function buildSendMessage(
  timestamp: number,
  destination: string,
  encryptedMessage: string,
): string {
  return `${timestamp}${destination}${encryptedMessage}`;
}

/** Signed body of `POST /contacts`: `timestamp + action + contactEd25519`. */
export function buildContactsMessage(
  timestamp: number,
  action: 'add' | 'remove',
  contactEd25519: string,
): string {
  return `${timestamp}${action}${contactEd25519}`;
}

// --- Key-object parsing -----------------------------------------------------
// A public identity travels as a JSON string: {"ed25519":"<64 hex>","x25519":"<64 hex>"}.
// Each key tolerates an optional `0x` prefix.

/**
 * Parse a stringified key object into its two bare (no `0x`) hex keys, or return
 * `null` unless BOTH keys are present and well-formed. Case is preserved — use
 * {@link ed25519FromKeyString} when you need a normalized ed25519 value.
 * (This is the client's original `parseKeyObject`.)
 */
export function parseKeyObject(
  raw: unknown,
): { ed25519: string; x25519: string } | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as { ed25519?: unknown; x25519?: unknown };
    const ed = String(parsed.ed25519 || '').replace(/^0x/i, '');
    const x = String(parsed.x25519 || '').replace(/^0x/i, '');
    if (!/^[0-9a-f]{64}$/i.test(ed) || !/^[0-9a-f]{64}$/i.test(x)) return null;
    return { ed25519: ed, x25519: x };
  } catch {
    return null;
  }
}

/**
 * Extract the bare, lowercase ed25519 hex from a key-object string, or `null`.
 * Only the `ed25519` field matters here — this is the server's original
 * `parseEd25519`, kept lenient on `x25519` so it behaves identically (it is used
 * in a rate-limit key generator on unvalidated input).
 */
export function ed25519FromKeyString(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as { ed25519?: unknown };
    const hex = String(parsed.ed25519 || '').replace(/^0x/i, '');
    return /^[0-9a-f]{64}$/i.test(hex) ? hex.toLowerCase() : null;
  } catch {
    return null;
  }
}
