# FAQ — judge Q&A prep

## 1. Why not just put the guardrails in the system prompt?

A system prompt is input, not enforcement: any text the model reads can argue with it, and "usually complies" is not testable. `evaluate()` (`src/policy.ts`) is pure — no I/O, no clock — with cent-exact boundaries unit-tested in `src/policy.test.ts`. `/api/checkout` re-runs it before PayPal (`src/server.ts:118`), so a direct POST cannot skip the rules.

## 2. What stops the agent from proposing something it cannot afford?

Nothing, deliberately. The heuristic planner checks remaining budget only for the optional accessory (`src/agent.ts:47`), so it can propose an over-budget cart; the engine denies with `over_budget` (`src/policy.ts:96`) and checkout returns 409 before PayPal. `permissible()` pre-filters merchant, category and cap, but budget is enforced at the decision, not in search.

## 3. What happens if the LLM is down or returns garbage?

`llmDraft` returns null on missing credentials or candidates; a non-200 or the 20-second abort throws, and `JSON.parse` errors are caught in `proposeItems` (`src/agent.ts:153`), so every path falls back to the keyword planner. Hallucinated SKUs are filtered against the candidates (`src/agent.ts:140`) and re-hydrated from `CATALOG`. Caveat: the response's `engine` field reports configuration, not which planner ran.

## 4. Is the money movement real in the demo?

Not in the shipped demo: `paypalMode` is `"live"` only with both credentials (`src/paypal.ts:13`); otherwise orders get `DEMO-` ids, make no network call, and land in the ledger as `provider: "demo"`. With sandbox credentials it is real Orders v2 against the sandbox host: create returns an approve link, capture completes after buyer approval. Production would move real money; that path is untested.

## 5. What is a "mandate" exactly, and who creates it?

The `Mandate` interface in `src/policy.ts:10`: budget ceiling, settled spend, per-transaction cap, approval threshold, allowed categories, allowed and blocked merchants, expiry, currency. A human creates it via zod-validated `POST /api/mandates` (`src/server.ts:16`). No authentication — anyone reaching the API can mint one — and the UI always POSTs a new mandate instead of editing in place.

## 6. Why PayPal specifically — what would break with a different PSP?

Orders v2 is create → approve → capture, with the amount fixed server-side at create (`src/paypal.ts:61`) — that matches "decide, then pay" — and the mandate id travels as `reference_id`. Another PSP changes the auth flow, approve handshake, capture semantics (some authorize and capture in one call, or allow an amount override) and webhook signatures. `Currency` is also literally `"USD"` (`src/policy.ts:8`). `evaluate()` knows nothing about PayPal, so the adapter is small — but not free.

## 7. How would this work for subscriptions or recurring mandates?

It doesn't yet. `expiresAt` already bounds the mandate's life, and `recordSettledSpend` accumulates every capture against one budget (`src/store.ts:89`). Missing: period accounting (reset monthly versus lifetime), an interval and scheduler, idempotent merchant-initiated charges, and a revocation path. PayPal Subscriptions is a different API from the Orders v2 client here — new code, not a flag.

## 8. What is not built yet, honestly?

No authentication; the approver is an unauthenticated client flag, `approved: true` (`src/server.ts:102`). No idempotency key or lock, so two concurrent checkouts can both pass `evaluate()` before either records spend. Persistence is one JSON file (`src/store.ts:24`): single process, no migrations. The catalog is seeded, there are no refunds, voids or partial captures, no multi-currency, and webhooks are logged but not signature-verified (`src/server.ts:190`).

## 9. How do you stop a prompt-injected product description from hijacking the cart?

No product text reaches a field that decides payment. The model sees only catalog fields for candidates already filtered by `permissible()`, and returns SKUs; those are validated against the candidates (`src/agent.ts:140`), then re-hydrated from `CATALOG` (`src/agent.ts:165`). Injected text can change which permissible item is chosen, never whether it is payable, and `evaluate()` re-checks at checkout. A real catalog would still need to re-read price at order creation.

## 10. What would you build in the next week?

First a real approval: a signed token bound to proposal hash, amount and approver identity, replacing the client boolean. Second an idempotency key plus transactional budget reservation, so two checkouts cannot spend the same remaining budget. Then Postgres, webhook signature verification with reconciliation, and a real catalog adapter with a price re-check.
