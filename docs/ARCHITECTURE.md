# Architecture

The whole design is one sentence: **the model proposes, the policy engine disposes.**

Everything else follows from refusing to let a language model be the thing that decides whether money moves.

## Trust boundary

```
 user goal
     │
     ▼
┌─────────────┐   proposal (untrusted)   ┌──────────────────┐
│   agent     │ ───────────────────────▶ │  policy engine   │
│ (LLM or     │                          │  evaluate()      │
│  heuristic) │                          │  pure, no I/O    │
└─────────────┘                          └──────────────────┘
                                                  │
                            allow / require_approval / deny
                                                  │
                                    ┌─────────────┴──────────────┐
                                    ▼                            ▼
                              PayPal Orders v2            reasons[] shown
                              create → capture             to the user
                                    │
                                    ▼
                              ledger (spend recorded)
```

Anything upstream of `evaluate()` is untrusted input: the goal text, the model's chosen SKUs, its rationale,
product descriptions, even the merchant names. The engine re-reads the mandate from the store and re-derives
the total from the catalog by SKU — it never trusts a total supplied by the agent.

## Why the engine is pure

`src/policy.ts` has no imports beyond its own types. No clock, no network, no filesystem, no randomness.
That buys three things:

1. **Every rule is unit-testable** — 16 tests, including the boundaries (`total === cap` allows, `cap + 1` denies).
2. **Checkout can re-run it** without side effects, so the decision cannot be stale or forged.
3. **It is auditable by reading one file.** A judge can check the entire safety story in five minutes.

Time-dependent rules (expiry) take `now` as a parameter rather than calling `Date.now()`, so tests are
deterministic without fake timers.

## Data model

- **Mandate** — `budgetCents`, `spentCents`, `perTransactionCapCents`, `approvalThresholdCents`,
  `allowedMerchants`, `blockedMerchants`, `allowedCategories`, `expiresAt`, `currency`.
  All money is integer cents; there is no float in the money path.
- **Proposal** — `id`, `goal`, `items[]` (SKU references, not free-form products), `rationale`.
- **Order** — `id`, `merchant`, `totalCents`, `provider` (`paypal` | `demo`), `status`
  (`created` | `captured` | `failed`), `captureId`, `createdAt`.

Blocklist beats allowlist: a merchant in both is denied. That order is deliberate — the safer rule wins.

## Request flow

1. `POST /api/proposals {goal, mandateId}` → agent returns SKUs → engine evaluates → **decision returned with
   reasons, stored with the proposal**.
2. `POST /api/checkout {proposalId, mandateId, approved}` → engine **re-evaluates** the stored proposal against
   the current mandate (spend may have moved since step 1) → `deny` is 409, `require_approval` without
   `approved: true` is 409, otherwise a PayPal order is created.
3. Live mode returns an `approveUrl`; `POST /api/orders/:id/capture` captures it and calls
   `recordSettledSpend` so the budget actually decreases.
4. `GET /api/ledger` returns settled orders.

## Failure modes, stated plainly

| Failure | What happens | Why that is acceptable |
|---|---|---|
| LLM unreachable or returns junk | Deterministic planner produces the proposal; `engine` reports `heuristic` | The demo never depends on a model being up |
| Model proposes an unaffordable cart | `deny` with the reason; checkout is 409 | The guardrail is the point |
| Prompt injection in a product description | The engine only sees SKUs, prices, merchant, category from the catalog | Text cannot move money |
| Capture succeeds, process dies before spend is recorded | Spend is under-counted until reconciled | Known gap; webhook reconciliation is the fix |
| Webhook arrives unsigned | Accepted and logged | Deliberate scope cut, documented in the README |
| Two checkouts race on the same budget | Both may pass the re-evaluation | Known gap; needs an atomic reserve step |

The last two are the honest ones. A hackathon demo can have them; a product cannot.

## Demo mode

`src/paypal.ts` picks demo mode when `PAYPAL_CLIENT_ID`/`SECRET` are absent. Orders get `DEMO-` ids,
capture returns `DEMO-CAP-…`, and every ledger row is tagged `demo` in the UI. Nothing pretends to be a real
payment — the label is on screen, not just in the docs.
