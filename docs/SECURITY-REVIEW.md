# Security Review — Mandate

Reviewed `88b1041` plus uncommitted changes (line numbers as of that tree): `src/*.ts`, `web/src/App.tsx`, `README.md`, deploy files. Probes against the repo's `express`/`zod` confirmed Express 4's async-rejection behaviour and zod's key stripping. I changed no other file.

## Verdict

The policy engine is sound: the model proposes, `evaluate()` disposes, checkout re-runs it. The perimeter is not: no auth, an all-interface bind, a client-supplied approval flag, and a process any PayPal error kills. `docs/FAQ.md` admits the auth gap, approval flag, checkout race and unverified webhooks; new here are the crash DoS, fail-open corruption, duplicate ledger rows and unbounded arrays.

## 1. Trust boundary

Holds. `evaluate()` re-runs at checkout against the stored pair (`src/server.ts:118`); the proposal-time decision (`:93`) is never reused. The model cannot invent money either: SKUs are filtered against candidates (`src/agent.ts:140`) and rebuilt from `CATALOG` (`:165-168`), so merchant, category and price are seed data and `qty` is fixed at 1 (`:19-27`). A crafted `goal` (≤400 chars, `src/server.ts:80`) only steers choice among permissible items and can poison `rationale`, rendered as text by the UI.

- **High — approval is self-asserted.** `approved` is a client boolean (`src/server.ts:102`, `:123-126`); the UI sends it automatically. No approver identity, no record.
- **Medium — proposals are not bound to mandates.** `/api/checkout` accepts any `proposalId` with any `mandateId` (`src/server.ts:110-112`); policy still applies to the target: audit confusion, not a cap bypass.

## 2. Money integrity

Cents are integers; totals sum `priceCents * qty` (`src/policy.ts:64-66`); division by 100 only for display and the PayPal amount (`src/paypal.ts:72`). No float paths; drift is in the ledger.

- **High — budget TOCTOU.** `evaluate()` (`src/server.ts:118`) reads `spentCents`, then the handler awaits `createOrder`/`captureOrder` (`:131`, `:175`) before `recordSettledSpend` (`:156`, `:182`). Nothing reserves the delta: two concurrent 15,000-cent checkouts both pass a 20,000-cent budget — seconds-wide live, narrow in demo.
- **Medium — settlement is neither atomic nor idempotent.** `addOrder` and `recordSettledSpend` persist separately (`src/store.ts:82-94`), so a crash after capture moves money while `spentCents` never changes. `addOrder` appends (`src/store.ts:83`), so `src/server.ts:181` leaves a duplicate row for the same `id`; the `"captured"` guard (`src/server.ts:171`) is check-then-act with no lock. Nothing reconciles from `providerOrderId`.
- **Medium — persistence fails open.** `writeFileSync` truncates before writing (`src/store.ts:45-48`); `load()` swallows parse errors into empty state (`:30-40`), then `seedIfEmpty` mints a fresh 20,000-cent mandate (`src/server.ts:27-42`). A crash mid-write resets the budget.

## 3. AuthN/AuthZ

None. Every route (`src/server.ts:51-199`) is anonymous, including `/api/reset` (`:195`), `/api/ledger` (`:186`) and the money endpoints. An attacker can read all data, mint a 10,000,000-cent mandate, spend against the deployment's PayPal credentials, and wipe state. `cors()` with no origin (`:46`) lets any page drive it from a victim's browser; `listen(PORT)` (`:214`) binds `0.0.0.0` — on shared Wi-Fi, a LAN-wide open wallet. Fix: bearer middleware on `/api`, CORS allowlist, `127.0.0.1` bind — 1–2 days.

## 4. Input handling

zod covers every state-touching body and strips unknown keys, so `spentCents` and `id` cannot be injected via `POST /api/mandates` (`src/server.ts:63-74`). Verified: a `__proto__` key is dropped by zod and stays an own property — no prototype pollution, no mass assignment.

- **Medium — unbounded arrays.** The three string arrays have no max (`src/server.ts:21-23`); 20,000 entries (169 KB) parse in 6 ms and fit the 256 KB body cap (`:47`). Every save rewrites the state file synchronously, costing O(N × 169 KB) per request.
- **Medium — unauthenticated LLM spend.** Each `/api/proposals` call is a paid outbound request, 20 s timeout, unthrottled (`src/agent.ts:118-131`).
- No ReDoS: the only pattern is `/[^a-z0-9]+/`, unnested and never user-supplied (`src/catalog.ts:35`).

## 5. PayPal

- **High — the webhook accepts unsigned payloads, plainly.** `src/server.ts:190-193` reads `req.body` and returns 200 without checking `paypal-transmission-sig`, cert chain or webhook id. Today it only logs, so impact is forged audit noise and log injection (`:191`); once it touches state, every settlement is forgeable. Verify or delete it.
- **High — any provider error kills the process.** Handlers are `async`, provider failures are uncaught `throw`s (`src/paypal.ts:44`, `:79`, `:101`) with no error middleware (`src/server.ts:131-136`, `:175-179`). Express 4 does not catch rejected handlers — verified: exit code 1, no response. Reachable via any PayPal 5xx/429, a revoked credential, or capturing an already-captured order.
- **Low — token handling.** The 30 s refresh is right (`src/paypal.ts:35`) but lacks single-flight and 401 invalidation; provider `debug_id` reaches error stacks; `approveUrl` is unvalidated in the anchor.

## 6. Secrets

`.env` is gitignored and untracked, `.env.example` ships blank credentials, `render.yaml` marks both secrets `sync: false`, the runtime image copies only build output (`Dockerfile:13-17`). Demo mode keys off credential presence (`src/paypal.ts:13`) and is labelled in the ledger, but a typo'd env var silently degrades to "everything succeeds, nothing is charged". Credentials load at import (`src/paypal.ts:10-13`, `src/agent.ts:15-17`), so rotation needs a restart. No secret is logged; startup prints mode only (`src/server.ts:215`).

## 7. Fix list

1. Auth middleware, CORS allowlist, localhost bind — 1–2 d.
2. Signed approval receipt: proposal hash, amount, approver, expiry; drop the boolean — 1 d.
3. Async error boundary, generic 502s — 2–4 h.
4. Budget reservation around the provider call — 4–6 h.
5. Settlement upsert by `providerOrderId`, one persist per transition, boot reconciliation — 4–8 h.
6. Atomic writes (tmp + rename); refuse to start on corrupt state — 2–3 h.
7. Verify webhook signatures or remove the endpoint — 3–4 h.
8. Schema bounds, rate limits on proposals/checkout — 2–3 h.

Until 1 and 2 land, this is a local demo — never expose it with live credentials.
