# Whispers Backend

Relay service for Expo push notifications with per-request ed25519 authentication.
It never sees plaintext: the client encrypts end-to-end and the backend only routes
the ciphertext to the right device as a push notification.

## What it does

1. A client **registers** a mapping from its public identity (`recipientId`) to an
   Expo push token. The request is signed by the identity's ed25519 key.
2. A recipient maintains an **allow-list** of senders via `/contacts`. Only listed
   senders can cause a push.
3. A sender **sends** an encrypted envelope to a destination. The backend verifies
   the sender's signature, checks the allow-list, looks up the destination's push
   token, and forwards the envelope through Expo.

## Security model

| Layer | Mechanism |
|-------|-----------|
| Transport | Operator terminates TLS at a reverse proxy (see Deployment). |
| Authentication | ed25519 signature on every `/register`, `/contacts`, `/send`. Verified against the key embedded in the request. |
| Replay protection | Each accepted signature is recorded once (`seen_requests`); a repeat is rejected. Timestamps must be recent and not far in the future. |
| Authorization | `/send` is refused (403) unless the destination has added the sender to its allow-list. |
| Abuse limits | Per-IP limit (10 / 15 min) on `/register`, `/contacts`, `/cleanup`; per-sender-key limit (30 / 15 min) on `/send`. `/health` is unlimited. |
| Payload limits | 10 kB JSON body cap. |
| Input validation | Strict format checks on keys, tokens, timestamps, signatures, envelopes. |
| Headers | `helmet` defaults; `x-powered-by` removed. |
| Boot safety | Refuses to start in production with a placeholder `CLEANUP_KEY` or an unset `TRUST_PROXY_HOPS`. |

The backend still learns metadata: which identities talk to which, and when. Each
recipient's allow-list is stored at rest. This is inherent to a push relay.

## Protocol version

Authenticated endpoints require the header:

```
x-whispers-protocol: 2
```

Requests without it get `400`. Bump this when the signed-message format changes.

## API

### `GET /health`

No auth. `{ "status": "ok", "protocol": "2", "timestamp": "..." }`

### `POST /register`

Signed by `recipientId`'s ed25519 key.

```json
{
  "recipientId": "{\"ed25519\":\"<64 hex>\",\"x25519\":\"<64 hex>\"}",
  "expoPushToken": "ExponentPushToken[...]",
  "timestamp": 1730000000000,
  "signature": "<128 hex>"
}
```

Signed message: `` `${timestamp}${recipientId}${expoPushToken}` ``

- `200` `{ "success": true, "recipient": "<recipientId>" }`
- `400` missing/invalid fields or missing protocol header
- `401` bad signature, stale/future timestamp, or replayed request

### `POST /contacts`

Manage the caller's allow-list. Signed by `recipientId`'s ed25519 key.

```json
{
  "recipientId": "{...}",
  "action": "add",
  "contactEd25519": "<64 hex>",
  "timestamp": 1730000000000,
  "signature": "<128 hex>"
}
```

Signed message: `` `${timestamp}${action}${contactEd25519}` `` (`action` is `add` or `remove`)

- `200` `{ "success": true }`
- `400` invalid fields / header
- `401` bad signature, stale/future timestamp, or replay

### `POST /send`

Signed by `origin`'s ed25519 key.

```json
{
  "encryptedMessage": "{\"encrypted\":\"<hex>\",\"nonce\":\"<hex>\",\"signature\":\"<hex>\"}",
  "destination": "{\"ed25519\":\"<64 hex>\",\"x25519\":\"<64 hex>\"}",
  "origin": "{\"ed25519\":\"<64 hex>\",\"x25519\":\"<64 hex>\"}",
  "timestamp": 1730000000000,
  "signature": "<128 hex>",
  "sound": "default",
  "badge": 1,
  "channelId": "messages"
}
```

Signed message: `` `${timestamp}${destination}${encryptedMessage}` ``

- `200` `{ "success": true, "ticket": { ... } }`
- `400` invalid fields / header
- `401` bad signature, stale/future timestamp, or replay
- `403` sender not on the destination's allow-list (returned before the recipient
  lookup, so it does not reveal whether the destination exists)
- `404` destination allow-listed the sender but has no registration
- `502` Expo delivery failed

### `POST /cleanup`

```json
{ "key": "<CLEANUP_KEY>" }
```

Deletes registrations not updated in 24 h and expired replay records. Key compared
in constant time. `401` on mismatch or if `CLEANUP_KEY` is empty.

## Configuration

See `.env.example`. Key points:

- **`CLEANUP_KEY`** — in production the server exits if this is empty, a known
  placeholder, or under 16 chars.
- **`TRUST_PROXY_HOPS`** — number of proxies in front of the service. Required in
  production. Too high = spoofable client IP = rate-limit bypass.
- **`PUSH_DRY_RUN=true`** — accept and validate `/send` without contacting Expo.
  Used by the smoke test.

## Running

```bash
npm install
cp .env.example .env      # then edit
npm run dev               # or: npm start
```

## Testing

```bash
npm test         # unit + in-process integration tests (node:test)
npm run smoke    # boots the real server on a temp DB and runs a full signed flow
```

`npm run smoke` needs no network and no real Expo project — operators can run it to
verify an install.

## Deployment

Put the service behind a TLS-terminating reverse proxy and set `TRUST_PROXY_HOPS`
to match. Example (one nginx in front, so `TRUST_PROXY_HOPS=1`):

```nginx
server {
    listen 443 ssl http2;
    server_name api.whispers.example.com;
    ssl_certificate     /path/cert.pem;
    ssl_certificate_key /path/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }
}
```

The rate-limit store is in-memory: it resets on restart and is per-process. For
multiple instances, put a shared store (e.g. Redis) behind `express-rate-limit`.

## Files

```
src/
  server.js   process wiring: config, boot checks, listen, shutdown
  app.js      Express app factory (all routes) - testable without a port
  auth.js     pure crypto/validation helpers
  db.js       SQLite schema + prepared-statement helpers
scripts/
  smoke.js    end-to-end smoke test
test/
  auth.test.js   unit tests for auth.js
  app.test.js    integration tests for the routes
```

## License

Apache 2.0 — see [`LICENSE`](LICENSE).
