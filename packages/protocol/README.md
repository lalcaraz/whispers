# @whispers/protocol

The Whispers wire contract, shared by `apps/mobile` (client) and `apps/backend`
(relay). Pure TypeScript — no crypto library, no node built-ins, no state.

Exports:

| Symbol | Purpose |
|---|---|
| `PROTOCOL_VERSION` | `'2'` — sent in the `x-whispers-protocol` header |
| `PROTOCOL_HEADER` | `'x-whispers-protocol'` |
| `FORWARD_SKEW_MS` | future-timestamp tolerance, agreed by both sides |
| `buildRegisterMessage` / `buildSendMessage` / `buildContactsMessage` | canonical signed-message strings (no separators) |
| `parseKeyObject` | `{"ed25519","x25519"}` JSON string → bare hex pair, or `null` |
| `ed25519FromKeyString` | bare lowercase ed25519 hex from a key-object string, or `null` |

## Consumption

- **Node** (`apps/backend`, `node --test`): `main` → `dist/index.js` (CJS).
  Run `npm run build` in this package first; the monorepo's turbo pipeline does
  this via `dependsOn: ["^build"]`.
- **Metro / EAS** (`apps/mobile`): the `react-native` field points at
  `src/index.ts`, so the bundler compiles the source directly — no build step.

## Changing the protocol

Any change to a signed-message format or `PROTOCOL_VERSION` is a breaking wire
change: bump `PROTOCOL_VERSION`, update both apps, ship matching releases.
