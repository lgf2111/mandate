# Mandate

### Spending guardrails for AI shopping agents, settled with PayPal

## Inspiration

An AI shopping agent is easy to demo and hard to trust. Give a model a catalog and a payment method and it buys things; what stops it buying the wrong thing? Today the choice is binary: let the agent spend, or don't use it. Agentic checkout is arriving faster than the controls around it, and "it usually picks cheap items" is not a control. Mandate is the middle: a budget envelope enforced by deterministic code the model cannot argue with, because it never gets a vote.

## What it does

A user edits a mandate — $200 budget, $150 per-transaction cap, approval above $100, categories `running`/`apparel`, merchants RunCo/TrailSupply, SketchySports blocked, seven-day expiry — then types a goal ("trail running shoes under the cap") and presses **Ask the agent**.

The agent returns a cart and a rationale. Before payment can happen, the policy engine rules:

- **allow** — every rule fits. **Pay with PayPal** creates an Orders v2 order, then captures (immediately in demo) and writes a ledger row.
- **require_approval** — legal but above the threshold. The button becomes **Approve & pay**, and the server returns `409 approval_required` unless the request carries `approved: true`; the gate is server-side, not a disabled button.
- **deny** — no payment path. The UI shows "Blocked by the mandate" and every reason, not just the first: a $990 jewellery cart from SketchySports returns `over_budget`, `over_transaction_cap`, `merchant_blocked` and `category_not_allowed` at once.

Multi-merchant carts are denied (`split_merchant`): one order, one merchant, one ledger row.

## How we built it

The agent proposes; `evaluate()` disposes.

- **`src/policy.ts`** — `evaluate(proposal, mandate, now)` is pure: no I/O, no network, no wall-clock read on the decision — `now` is passed in (it defaults to `new Date()` only so the server can call it without one). It returns an outcome, totals, remaining budget, and reasons with codes and severities.
- **`src/agent.ts`** — proposes only. Candidates are pre-filtered to mandate-permissible items; the model returns SKUs, validated against that list before becoming line items. Any failure (no credentials, non-200, timeout, invalid SKUs) falls back to a deterministic keyword planner, so the demo never needs a model.
- **`src/server.ts`** — Express. `/api/proposals` evaluates; `/api/checkout` reloads proposal and mandate and re-evaluates before touching PayPal, so calling checkout directly cannot skip policy.
- **`src/paypal.ts`** — OAuth2 token cached until expiry; Orders v2 create with `intent: CAPTURE` and integer-cent amounts; capture on return. Demo mode lives at this boundary: simulated order IDs, immediate capture, ledger rows marked `provider: "demo"`.

`web/` is Vite + React; the server hosts the built `web/dist`, so production is one container.

## Challenges

**Placing the trust boundary.** Our first cut evaluated the cart in the handler that rendered it: one new endpoint away from a bug, because any other order-creating path can forget the call. We moved enforcement onto the money path and made `evaluate` pure. We were also tempted to let the model return prices; a model-chosen price is unvalidated input, so prices stay in the catalog.

**Sandbox capture approval.** Orders v2 returns an approve link, and capture only returns `COMPLETED` after a buyer approves in PayPal. Correct behaviour, but it makes a headless demo impossible: you cannot script a human clicking approve.

**Runnable without credentials.** Demo mode had to be one branch, not conditionals scattered through the server, or the paths drift.

## Accomplishments

52 tests pass — 16 on the policy engine, 13 on the HTTP API, 12 on the agent (the model path, its session header and its fallbacks), 6 on catalog search, 5 on the PayPal client — covering cent-exact boundaries, the block list beating the allow list, unparseable expiry treated as expired, multi-reason denials, and checkout refusing unapproved or denied carts. The full path runs end to end: propose → evaluate → approve → order → capture → ledger, with the budget decrementing between decisions. It runs with zero credentials, and simulated settlements are labelled demo. `npm run typecheck`, `npm test` and `npm run build` run in GitHub Actions.

## What we learned

The model must not decide whether to pay.

1. **You cannot unit-test a judgment.** `evaluate()` has 16 tests with cent-exact boundaries. An LLM call has a distribution; the best you can assert is that it usually complies.
2. **Persuasion is just input.** A listing that says "ignore the budget" is tokens like any other. No wording makes `totalCents > remainingBeforeCents` false.
3. **Audit needs a code, not a paragraph.** `over_budget` is reproducible, greppable and storable with the order. "The model thought it was fine" is none of those.

The split that worked: the model handles judgment (which products satisfy an ambiguous goal); code handles certainty (whether money may move).

## What's next

- **Real product catalog.** `searchCatalog` is the seam; swap it for a product-search API and policy, checkout and ledger are unchanged.
- **Mandate sharing.** Hand a scoped, revocable mandate to someone else's agent, with spend attributed to its owner.
- **Webhook verification.** `/api/webhooks/paypal` logs and returns 200 today; next is verifying PayPal's signature and treating the event as capture truth.

## Built with

TypeScript, Node.js, Express, React, Vite, Zod, Vitest, PayPal Orders v2 API, PayPal OAuth 2.0, OpenAI-compatible LLMs, Docker, Render, GitHub Actions.

## Try it

```bash
git clone <this repo> mandate && cd mandate
npm install
npm run dev
```

Open http://localhost:5173 — no credentials required; orders are simulated and labelled `demo`. For sandbox orders, copy `.env.example` to `.env` and add `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`; `npm test` runs the 52 tests.
