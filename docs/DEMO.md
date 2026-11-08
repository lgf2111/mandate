# Demo runbook — Mandate

For judges and reviewers. Clone to a denied cart in about two minutes, with no credentials and no PayPal account.

Mandate is spending guardrails for AI shopping agents. The agent proposes a cart; a deterministic policy
engine returns `allow`, `require_approval`, or `deny` with written reasons; only an allowed or approved cart
can be paid, through PayPal Orders v2.

---

## 0. The short version

```bash
git clone <repo-url> mandate && cd mandate
npm install
npm run dev
```

Open **http://localhost:5173**. The goal is prefilled. Click **Ask the agent** → **Approve and pay** →
**Ask the agent** again. You will see a $115 cart require approval, settle, and then a $94 cart be denied
with $85 left in the budget.

That is the whole product. The rest of this document explains what to expect at each step, how to run it
against the PayPal sandbox, how to plug in a model, and what to do when a port or a build script fights you.

---

## 1. Requirements

| Requirement | Detail |
|---|---|
| Node.js | `^20.19.0` or `>=22.12.0` (Vite 7's engine requirement). Check with `node -v`. |
| npm | Any recent npm. |
| Ports | `8787` (API) and `5173` (UI) free. |
| Credentials | None. Demo mode is the default. |

Verified on macOS with Node 26.13.0 and npm 11.20.0.

---

## 2. Start it

```bash
npm install
npm run dev
```

`npm run dev` runs two processes under `concurrently`:

- **API** — Express on `http://localhost:8787` (`tsx watch src/server.ts`)
- **UI** — Vite on `http://localhost:5173`, proxying `/api` to `8787` (`web/vite.config.ts`)

Expected terminal lines:

```
[api] Mandate API on http://localhost:8787 · paypal=demo · agent=heuristic
[web] VITE v7.x  ready in ... ms
[web] ➜  Local:   http://localhost:5173/
```

If the API line is missing, the UI will load but every action will fail. See troubleshooting.

---

## 3. What a healthy first screen looks like

| Where | Expected |
|---|---|
| Header, first badge | `PayPal: demo` |
| Header, second badge | `agent: heuristic` |
| Left card | `Mandate`, name `Weekend running gear` |
| Budget / cap / threshold | `200` / `150` / `100` (USD) |
| Merchants | Allowed `RunCo, TrailSupply`; blocked `SketchySports` |
| Categories | `running, apparel` |
| Mandate footer | `Spent $0.00 of $200.00` |
| Ledger | `0 orders` and `No settlements yet.` |

The mandate is seeded on first run with these values:

| Field | Value | Meaning |
|---|---|---|
| Budget | $200.00 | Hard ceiling for all settled spend under this mandate |
| Per-transaction cap | $150.00 | No single cart above this |
| Approval threshold | $100.00 | Above this, a human must confirm |
| Allowed merchants | RunCo, TrailSupply | Anything else is denied |
| Blocked merchants | SketchySports | Always wins over the allow list |
| Allowed categories | running, apparel | Everything else is denied |
| Expiry | now + 7 days | After this, every proposal is denied |

Two things worth saying out loud to a judge: these are rows in a JSON store, not sentences in a system
prompt; and the model is never asked whether payment is allowed.

---

## 4. The demo path

### Step 1 — Ask the agent

The Goal box is prefilled with **`trail running shoes under the cap`**. Click **Ask the agent**.

Expected, in the Proposal card:

| Element | Value |
|---|---|
| Line items | `Trail Runner 2` — RunCo · running — **$94.00**<br>`Merino Sock 3-pack` — RunCo · apparel — **$21.00** |
| Total | **$115.00** |
| Budget remaining after this order | **$85.00** |
| Outcome pill | **APPROVAL REQUIRED** (amber) |
| Reason | `$115.00 is above the $100.00 auto-approve threshold.` |
| Primary button | **Approve and pay** |

Why two items: the deterministic planner takes the best match, then adds a same-merchant accessory priced
at no more than half the primary item while budget remains. The rationale line states the same thing in
words: total, the limits it stayed inside, and the $85.00 left.

Nothing has been charged at this point. A proposal is not an order.

### Step 2 — Approve and pay

Click **Approve and pay**.

Expected:

- Notice under the Goal card: `Paid $115.00 to RunCo.`
- Ledger gains one row: **RunCo**, **$115.00**, status pill **`captured · demo mode`**
- Mandate footer changes to `Spent $115.00 of $200.00`

What happened, in order: the UI sent `approved: true`; the server reloaded the proposal and mandate and
**re-evaluated** them; demo `createOrder` returned a `DEMO-…` id; demo `captureOrder` returned a capture id;
only then did `recordSettledSpend` charge the mandate. The budget moves on capture, not on approval. In live
mode that last part is a separate request after the buyer approves in PayPal.

### Step 3 — Ask again, and watch the budget hold

Click **Ask the agent** again with the same goal.

Expected:

| Element | Value |
|---|---|
| Line items | `Trail Runner 2` only — **$94.00** |
| Outcome pill | **DENY** (red) |
| Reason | `Cart is $94.00 but only $85.00 remains.` |
| Button | None. A red panel reads `Blocked by the mandate. No payment can be made for this cart.` |
| Ledger | Still one order |

Why the cart changed: the planner dropped the socks because they no longer fit, then proposed the shoes
alone. The engine still denied them, because $94.00 is more than the $85.00 left. The agent and the policy
engine reached the same answer for different reasons — that is the design, not a coincidence.

### Optional extra rules

Both of these create a fresh mandate at `$0.00` spent, so they do not disturb the sequence above. Run them
after step 3.

**Show an `allow`.** Set **Approval threshold** to `150`, click **Save as new version**, then **Ask the
agent**. Expected: pill **ALLOW** (green), reason `$115.00 fits the mandate; $85.00 would remain.`

**Show a cap denial.** Set **Per-transaction cap** to `100`, click **Save as new version**, then **Ask the
agent**. Expected: pill **DENY**, reason `Cart is $115.00, above the $100.00 per-transaction cap.`

Note: "Save as new version" posts a new mandate and selects it. The previous mandate is still in storage,
but the UI has no switcher — **Reset demo data** is the way back to the seeded one.

### What you will not see in the UI, and why

The planner pre-filters products that break the merchant, category, or per-transaction-cap rules, so it
never proposes them. That means the two outcomes you can trigger from the UI are a **threshold approval**
and a **budget denial** — plus the optional cap denial above, after you lower the cap.
The policy engine still checks every rule on every proposal, and `/api/checkout` re-runs the full evaluation
before touching PayPal — a denied or unapproved cart returns **409** even if a client bypasses the UI.
Merchant, category, expiry, split-merchant, and boundary cases are covered by the test suite
(`src/policy.test.ts`).

---

## 5. Check it without clicking

```bash
curl -s localhost:8787/api/health
# {"ok":true,"paypal":"demo","agent":"heuristic"}

MID=$(curl -s localhost:8787/api/mandates | python3 -c 'import json,sys; print(json.load(sys.stdin)["mandates"][0]["id"])')
curl -s -X POST localhost:8787/api/proposals \
  -H 'content-type: application/json' \
  -d "{\"goal\":\"trail running shoes under the cap\",\"mandateId\":\"$MID\"}"
```

Expected in the response on a freshly reset demo: `"outcome":"require_approval"`, `"totalCents":11500`, and
one reason with code `approval_required` and message
`$115.00 is above the $100.00 auto-approve threshold.`

Other useful commands:

```bash
npm test          # policy, catalog, and API tests
npm run typecheck # tsc --noEmit
npm run build     # typecheck + build the UI into web/dist
```

End-to-end check against a running server:

```bash
npm run smoke
```

It resets the demo, then drives health → proposal → checkout without approval (409) → capture → budget
decrement → second-request denial, printing a check per step. It leaves the demo at $115.00 spent, so click
**Reset demo data** afterwards.

`npm run build && npm start` serves the built UI and the API together on `http://localhost:8787` — one
process, no Vite. For deployment, the included `Dockerfile` compiles the same sources and runs the built
server; `render.yaml` deploys that image with `/api/health` as its health check.

---

## 6. Switch to the PayPal sandbox

Demo mode is the default and is what the video uses. Live mode exercises the real Orders v2 API against
PayPal's sandbox host.

1. Open the [PayPal developer dashboard](https://developer.paypal.com/dashboard/applications/sandbox) →
   **Apps & Credentials** → **Sandbox** → **Create App**. Copy the **Client ID** and **Secret**.
2. Copy the env template and fill it in:

   ```bash
   cp .env.example .env
   ```

   ```dotenv
   PAYPAL_CLIENT_ID=your-sandbox-client-id
   PAYPAL_CLIENT_SECRET=your-sandbox-secret
   PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
   ```

3. Restart `npm run dev` — environment variables are read at startup.
4. Confirm the header badge now reads **`PayPal: live`**. `GET /api/health` should return `"paypal":"live"`.
5. Ask the agent. The same $115.00 cart should require approval. Click **Approve and pay**.
6. Expected instead of an instant settlement: notice `Order created. Approve it in PayPal, then capture the payment.`
   with two new controls, **Open PayPal approval** and **Capture payment**. The ledger row appears with status `created`.
7. Open PayPal, sign in with a **sandbox personal (buyer) account** — create or view one under
   **Testing Tools → Sandbox Accounts** — and approve the payment.
8. Close the PayPal tab, return to the app, and click **Capture payment**. The server calls
   `POST /v2/checkout/orders/{id}/capture`. On success the notice reads `Payment captured.`, the ledger row becomes
   `captured`, and only now is the $115.00 recorded against the mandate.

Caveats worth knowing before you demo this live:

- The order is created **without a return URL**, so PayPal will not bounce you back to the app automatically.
  Capture from the app tab; the capture call only needs the order id.
- Capture before the buyer approves fails. Approve first, then capture.
- If authentication fails, the server logs `PayPal auth failed: 401` in the API terminal and the checkout
  request may never return a response — that path has no error handler. Fix the credentials and restart.
- Sandbox money is not real money. Never point `PAYPAL_BASE_URL` at the production host during a demo.

---

## 7. Enable the LLM agent

The deterministic planner is the default so the demo never depends on a model. To use a model instead, set
any OpenAI-compatible chat-completions endpoint:

```dotenv
MANDATE_LLM_BASE_URL=https://openrouter.ai/api/v1
MANDATE_LLM_API_KEY=sk-...
MANDATE_LLM_MODEL=deepseek-v4.1-flash
```

Restart the server. The header badge flips to **`agent: llm`**, and `/api/health` reports `"agent":"llm"`.

What the model is allowed to do:

- Choose SKUs from a candidate list already filtered by merchant, category, and per-transaction cap.
- Write the rationale.

What it cannot do:

- Invent a SKU. Returned SKUs are validated against the candidate list, and name, merchant, category, and
  price are re-read from the catalog.
- Change the price or the limits.
- Authorize payment. That is `evaluate()` and the checkout handler.

Operational notes:

- `MANDATE_LLM_BASE_URL` is the API root; the client appends `/chat/completions`. Use `https://openrouter.ai/api/v1`,
  or `http://localhost:11434/v1` for a local Ollama.
- The request sets `response_format: {"type":"json_object"}`, `temperature: 0`, and a 20-second timeout.
  Endpoints that reject `response_format` will fail the call.
- Failure is silent by design: on a missing key, non-200, timeout, or invalid SKUs, the deterministic planner
  answers instead. The badge reflects configuration, not success. If the rationale reads like a template
  (`… best matches "…", with … added from the same store. Total $… stays inside …`), you are seeing the
  fallback.

---

## 8. Demo vs live mode

| | Demo (default) | Live (sandbox credentials) |
|---|---|---|
| Trigger | `PAYPAL_CLIENT_ID` / `SECRET` unset | Both set |
| Order id | `DEMO-<uuid>` | PayPal order id |
| Network | None | PayPal Orders v2, sandbox host |
| Capture | Immediate, simulated | After buyer approval, via **Capture payment** |
| Ledger pill | `captured · demo mode` | `captured` |
| Spend recorded | On capture | On capture |
| Real money | No | No — sandbox balances only |

The mode is chosen once, at module load, from the presence of both credentials. There is no runtime toggle;
restart after editing `.env`.

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Error: listen EADDRINUSE: address already in use :::8787` | Another API instance is running | `lsof -nP -iTCP:8787 -sTCP:LISTEN`, then `kill <pid>`. Do not just change `PORT`: the Vite proxy hardcodes `8787` in `web/vite.config.ts`. If you move the API, change both. |
| `Port 5173 is in use` / Vite starts on `5174` | Another dev server | Use the URL Vite prints. The proxy still points at `8787`. |
| Install warned `Ignored build scripts: esbuild`, or startup fails with `Cannot find module @esbuild/darwin-arm64` / "You installed esbuild for another platform" | esbuild's postinstall was skipped (`--ignore-scripts`, pnpm's blocked builds, or a corporate npm config) | `npm rebuild esbuild`. If that fails: `rm -rf node_modules package-lock.json && npm install`. On pnpm: `pnpm approve-builds`. |
| Vite exits with an engine warning about Node | Node older than 20.19 / 22.12 | `node -v`, then upgrade (nvm, fnm, or the official installer). |
| A fresh judge run already shows money spent, or the first cart is denied for budget | State persists in `data/state.json` between runs | Click **Reset demo data** (calls `POST /api/reset`) or `rm data/state.json` and restart. |
| I edited the budget and nothing changed | The editor only applies changes on **Save as new version** | Click **Save as new version**; note the new mandate starts at `$0.00` spent. |
| UI loads but every action fails, or the console shows `Failed to fetch` | API is not running on `8787` | `curl localhost:8787/api/health`. Check the `[api]` pane for a startup error. |
| `PayPal auth failed: 401` | Wrong credentials, or sandbox credentials against the wrong host | Re-copy both values; keep `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`. |
| Capture does nothing or the UI sits on "Working…" | Buyer has not approved, or PayPal rejected the capture | Approve in PayPal first; check the server terminal for the `PayPal capture failed: …` line. |
| Badge says `agent: llm` but the rationale looks templated | The model call failed and the app fell back silently | Check the base URL (must end at the API root, not `/chat/completions`), the key, the model id, and whether the endpoint accepts `response_format`. |
| Ledger says `captured · demo mode` | No PayPal credentials | Expected. Add sandbox credentials for live mode. |

---

## 10. Reset and repeat

- **Reset demo data** in the header calls `POST /api/reset`: it clears mandates, proposals, and orders, then
  re-seeds the `Weekend running gear` mandate at `$0.00` spent.
- Or delete the state file: `rm data/state.json` (path is relative to the working directory).
- Or run an isolated instance without touching your main state:

  ```bash
  MANDATE_STATE_PATH=/tmp/mandate-state.json npm run dev
  ```

- Full production run: `npm run build && npm start` → `http://localhost:8787`.

---

## 11. Where the guarantees live

| File | Role |
|---|---|
| `src/policy.ts` | `evaluate(proposal, mandate, now)` — pure; no I/O, no network, no hidden clock. Every rule and reason code lives here. |
| `src/server.ts` | `/api/proposals` evaluates; `/api/checkout` reloads and **re-evaluates** before PayPal, so a direct call cannot skip policy. |
| `src/agent.ts` | Proposes only. Candidates pre-filtered, SKUs validated, deterministic fallback. |
| `src/paypal.ts` | Orders v2 create/capture; demo mode is one explicit branch at this boundary. |
| `src/store.ts` | Persists mandates, proposals, orders; records spend only after a successful capture. |
| `src/policy.test.ts`, `src/server.test.ts` | Rule boundaries, multi-reason denials, and the API path including the 409s. |

For the system design, see [`ARCHITECTURE.md`](./ARCHITECTURE.md); for judge Q&A, see [`FAQ.md`](./FAQ.md);
for the submission narrative, see [`DEVPOST.md`](./DEVPOST.md).
