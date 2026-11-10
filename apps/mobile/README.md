# Whispers (mobile client)

React Native / Expo client for the Whispers encrypted messenger. Messages are
end-to-end encrypted on the device; the backend only relays ciphertext as a push
notification.

## Cryptography

| Purpose | Primitive |
|---|---|
| Identity / signatures | Ed25519 |
| Key agreement | X25519 ECDH |
| Message encryption | ChaCha20-Poly1305 (AEAD) |
| Key derivation | HKDF-SHA256 (independent Ed25519 + X25519 secrets from one seed) |

- Private keys live in `expo-secure-store` (OS keystore). The stored blob is
  versioned (`keyVersion`); an older-format blob is discarded and a fresh key
  pair is generated, with a one-time in-app notice.
- `src/utils/crypto-core.ts` is pure and has no Expo imports - it is unit-tested
  under Node. `src/utils/keys.ts` is the thin secure-store layer over it.
- On receive, a message is dropped unless its Ed25519 signature verifies against
  the authenticated sender (`origin`) **and** the identity embedded in the
  decrypted payload matches `origin`.

## Local storage

- SQLite via `expo-sqlite`, encrypted at rest with **SQLCipher** on both iOS and
  Android. The 32-byte database key is generated once and kept in
  `expo-secure-store`.
- `src/utils/db.ts` owns the single connection. Everything else goes through
  `openDatabase()` (async, at startup) and `getDb()` (sync).
- There is no plaintext-to-encrypted migration: a database that cannot be opened
  with the current key is deleted and recreated.

## Backend protocol

All authenticated requests send the header `x-whispers-protocol: 2` and an
Ed25519 signature. The protocol version and signed-message formats come from the
shared [`@whispers/protocol`](../../packages/protocol) package (re-exported from
`crypto-core.ts`), so the client and `apps/backend` cannot drift.

| Call | Signed over |
|---|---|
| `POST /register` | `timestamp + recipientId + expoPushToken` |
| `POST /contacts` | `timestamp + action + contactEd25519` |
| `POST /send` | `timestamp + destination + encryptedMessage` |

`src/utils/backendClient.ts` builds and signs these; `src/utils/contacts.ts`
keeps the server-side allow-list in sync as conversations are created/deleted.

## Security features

- **Allow-list**: a sender can only push to you after you have added them (by
  scanning their QR). `/send` from a non-contact returns 403.
- **Screen-capture prevention**: `usePreventScreenCapture()` (FLAG_SECURE on
  Android; iOS cannot fully block screenshots).
- **Emergency wipe**: shake 10x within 3s -> countdown -> `emergencyWipe()`
  deletes the database files, the database key, all key material, and every
  secure-store entry, then restarts the app.

## Setup

This is a workspace in the [Whispers monorepo](../../README.md). Run every
command below **from this directory** (`apps/mobile/`) — `expo` / `eas` /
`pod install` scaffold stray `ios/`, `android/`, `.expo/` and `app.json` and
pollute the root `package.json` if run from the repo root. `npm install` can be
run from anywhere (workspaces).

```bash
cd apps/mobile
npm install                   # (or from the root — installs all workspaces)
cp .env.example .env          # fill in EAS_PROJECT_ID and PACKAGE_NAME
npm run typecheck
npm test                      # crypto-core + protocol unit tests
npx expo run:android          # or: npx expo run:ios   (dev client build)
```

`npx expo prebuild --clean` regenerates the gitignored `ios/` and `android/`
projects (needed after an SDK bump or an `app.json` native change).

### Firebase / push

`google-services.json` and `GoogleService-Info.plist` are **gitignored** - each
operator supplies their own from their Firebase project. Restrict the Firebase
API key in the Google Cloud console (Android package + SHA-1, iOS bundle id) so
it cannot be reused by another app.

### Backend URL

`DEFAULT_BACKEND_URL` in `src/constants.ts` is the compiled-in default. Users can
override it at runtime in **Profile > Backend URL** (stored in secure storage).
Use HTTPS.

## Project layout

```
src/
  utils/
    crypto-core.ts   pure crypto (unit-tested)
    keys.ts          secure-store key management
    db.ts            encrypted SQLite connection owner
    database.ts      schema + queries
    backendClient.ts signed HTTP calls
    contacts.ts      allow-list sync
    wipe.ts          emergency wipe
  hooks/             useBackend, useConversations, useMessages, ...
  components/        UI (qrScanner, textPrompt, conversationsList, ...)
  views/             screens (conversations, messages, profile)
  locales/           en, es, de, it, pt
test/                *.test.mts  (node --test)
```

## Tests

```bash
npm test        # node:test via --experimental-strip-types
npm run typecheck
```

Device-only checks (SQLCipher at rest, emergency wipe, 2-device send/receive,
403 path) are not covered by `npm test`.
