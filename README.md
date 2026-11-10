# Whispers - An E2E encrypted chat application that moves messages over push notifications.

https://github.com/user-attachments/assets/57fd3849-ad71-440e-80dd-5ae928881e0f

## IMPORTANT
This project is just a PoC, could not be ready for production BUT i am using it as my personal chat app for my family and friends.
This repository contains the backend, the mobile client, and the shared protocol package for the Whispers application.

## Who am I?
My name is Luis Alcaraz. I have been a Software Engineer, Network Administrator and others in between since 2005. You can find more about me at https://lalcaraz.com

## Why does Whispers exist?
Even that I write software from 9 to 5, I ocassionally do some personal projects on weekends to spice up my skills. Not all of them are "exciting enough" to be made public, this one is different given the current political events happening around the globe in 2026. While I'm not thinking on putting this into the AppStore or Play Store I wanted to make it public because someone might find it useful. That said, I TAKE NO RESPONSABILITY OVER THE SECURITY OF THIS APP. I made it as secure as I could given that was a weekend project. 

Would I update this code base? Maybe, but it's not guaranteed.

---

## Overview

Self-hosted end-to-end encrypted messenger. A monorepo of three workspaces:

| Path | Package | What |
|---|---|---|
| [`apps/backend/`](apps/backend/) | `@whispers/backend` | Node.js / Express push-notification relay. Authenticates every request with an Ed25519 signature, enforces a per-recipient sender allow-list, and forwards ciphertext through Expo. Never sees plaintext. |
| [`apps/mobile/`](apps/mobile/) | `@whispers/mobile` | React Native / Expo client. Ed25519 / X25519 / ChaCha20-Poly1305 crypto, QR contact exchange, SQLCipher-encrypted local storage, shake-to-wipe. |
| [`packages/protocol/`](packages/protocol/) | `@whispers/protocol` | Pure, zero-dependency wire contract shared by the client and the relay: protocol version, header, signed-message formats, key parsing. |

## Model

This is **not a hosted service**. An operator clones a tagged release and runs
their own backend + builds their own client. Multiple independent backends can
coexist; identities are public keys, so a client can move between them.

```
client  --(encrypt E2E)-->  [ backend relay ]  --(push)-->  recipient device
                             verifies signature
                             checks allow-list
                             never decrypts
```

## Monorepo

npm workspaces + [Turborepo](https://turborepo.dev). Node 22 (see `.nvmrc`).

The [`Makefile`](Makefile) is the single source of truth for the pipeline — `make ci`
runs install, build, typecheck, test and smoke in one go.

```bash
make install     # npm ci for every workspace
make build       # @whispers/protocol -> dist/
make typecheck   # mobile + protocol
make test        # all workspaces (node:test)
make smoke       # backend end-to-end signed flow, no network
make ci          # the whole pipeline
make help        # list targets
```

Turbo tasks depend on `^build`, so `@whispers/protocol` compiles before the
backend and the mobile test run consume it. Metro / EAS bundle the protocol
package's TypeScript source directly (its `react-native` field) and need no
build step.

Run one workspace directly with
`npm run <script> --workspace @whispers/<name>` (build the protocol package
first if it is a Node consumer).

**Run Expo / native tooling from `apps/mobile/`, never the repo root.**
`npx expo start`, `expo prebuild`, `expo run:ios`, `eas build`, `pod install`,
etc. assume they are inside the app: run from the root they scaffold a stray
`ios/`, `android/`, `.expo/` and `app.json` at the top level and add
`expo` / `react` / `react-native` to the root `package.json`. The root
`.gitignore` blocks those paths as a backstop, but delete them and
`git checkout package.json package-lock.json` if it happens. Use
`cd apps/mobile && npx expo …` or `npm run <script> -w @whispers/mobile`.

## Getting started

Each app has its own README with full instructions:

- Backend: [`apps/backend/README.md`](apps/backend/README.md) — configure `.env`,
  `make smoke` (or `npm run smoke -w @whispers/backend`) to verify.
- Client: [`apps/mobile/README.md`](apps/mobile/README.md) — configure `.env`,
  then `cd apps/mobile && npx expo run:android` / `run:ios`.

The client and backend share a wire protocol version (`x-whispers-protocol`) via
`@whispers/protocol`; deploy matching versions of both.

## Secrets

Never committed. `.env` files, `google-services.json`, and
`GoogleService-Info.plist` are gitignored — each operator provides their own. The
backend refuses to start in production with a placeholder `CLEANUP_KEY` or an
unset `TRUST_PROXY_HOPS`.

## Documentation

- [`docs/security-probe.md`](docs/security-probe.md) — black-box security probe for the relay and its findings.

## Contributing

Fork the repo and submit pull requests; if it's of interest, I will merge it.
Open issues for bugs or feature requests but don't expect a quick response. This
was a weekend PoC, but I will help as much as I can.

## License

Apache 2.0 — see [`LICENSE`](LICENSE).
