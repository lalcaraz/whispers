# Backend security probe

Black-box + code-informed security testing of the relay (`apps/backend`).

## Running it

Start the server on a fresh process (rate-limit buckets are in-memory, so a
restart gives a clean run), then:

```bash
make sec-probe                              # against http://localhost:3000
make sec-probe TARGET=https://api.example.com
# or directly:
npm run sec-probe -w @whispers/backend -- http://localhost:3000
```

Script: [`apps/backend/scripts/sec-probe.js`](../apps/backend/scripts/sec-probe.js).
Exit code 0 = no failures, 1 = at least one FAIL, 2 = server unreachable.

It is **not** part of `make ci` — it needs a running server and it spends the
per-IP rate-limit bucket (section 12 deliberately, plus section 11). Most checks
go through `/send`, which limits per sender key, so fresh identities give plenty
of headroom.

### What it checks

| # | Area |
|---|---|
| 1 | Response headers / information disclosure (no `X-Powered-By`, `nosniff`, no framework banner, HSTS) |
| 2 | Protocol-version header gate (`400` on missing / wrong version) |
| 3 | Authentication — missing / forged / cross-key / payload-bound signatures all rejected |
| 4 | Replay protection — a replayed signed request is `401` (nonce burned before the allow-list check) |
| 5 | Timestamp window — stale / future / zero / negative / non-numeric rejected |
| 6 | Input validation — malformed keys, SQL metacharacters, bad envelopes, `__proto__`, arrays → `400`, never `500`; no prototype pollution |
| 7 | Payload size limit (`413` / `400` on a ~300 kB body) |
| 8 | HTTP methods / CORS (no `GET`/`PUT`/… handlers, no permissive `Access-Control-Allow-Origin`) |
| 9 | Error handling — malformed JSON → `400`, no stack traces in responses |
| 10 | `/send` rate limiting per sender key (`429` + `Retry-After`) |
| 11 | `/cleanup` key rejects empty / placeholder; `/register` rejects a cross-key signature (no identity takeover) |
| 12 | `X-Forwarded-For` cannot reset the per-IP rate-limit bucket (trust-proxy config) |

---

## 2026-09-07 — first run

Target: `http://localhost:3000` (SDK-57 branch, `NODE_ENV=development`).
**40 checks pass, 0 fail.** Verdict: not highly vulnerable — the core model
(mandatory Ed25519 auth, replay protection, recipient allow-list, strict input
validation, parameterised SQL, no info leaks) holds up under black-box testing.

### Findings

**1 — LOW · `X-Forwarded-For` rate-limit bypass in non-production config · FIXED**

`apps/backend/src/server.js` defaulted `trust proxy` to `1` when
`TRUST_PROXY_HOPS` was unset. In development (or any non-`production` run) that
made Express trust a client-supplied `X-Forwarded-For`, so rotating the header
gave a fresh per-IP rate-limit bucket on `/register`, `/contacts` and `/cleanup`.
Production was already protected (the boot check refuses to start without
`TRUST_PROXY_HOPS`, and the correct value makes Express use only the
proxy-appended IP).

Fix: default the fallback to `0` (trust nobody, use the socket IP). The probe's
section 12 now guards against regressions.

**2 — MODERATE (transitive) · `qs` DoS / array-limit advisories · FIXED**

`express@4` → `body-parser` → `qs@6.15.3` (GHSA-x5fp-wj9c-mxmx,
GHSA-4mjr-xmp4-gh2g). Not exploitable here — the app parses only JSON bodies, no
query strings or urlencoded forms — but pinned out anyway via a root
`overrides: { "qs": "6.16.0" }`. `npm audit --omit=dev -w @whispers/backend` is
now clean.

### Accepted / inherent (not bugs)

- The relay sees metadata: which identities talk to which, and when.
- Allow-lists are stored **plaintext at rest** in SQLite server-side.
- The rate-limit store is in-memory: per-process, resets on restart. Fine for a
  single self-hosted instance; a multi-instance deploy needs a shared store.
- Connection-level DoS (slowloris, floods) is the reverse proxy's job — deploy
  behind a TLS-terminating proxy as the backend README says.
- `apps/mobile` still has ~18 moderate `npm audit` findings, all dev/build-time
  transitive deps of `@expo/*` / `@react-navigation` (e.g. `xcode`, `uuid`,
  `decode-uri-component`). None are in the backend. Revisit as those packages
  release fixes.
