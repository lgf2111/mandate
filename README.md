# Mandate

**Spending guardrails for AI shopping agents, settled with PayPal.**

An agent can shop for you; it should not be able to spend without limits. Mandate gives every agent a
machine-enforced budget: allowed merchants, allowed categories, a per-transaction cap, an expiry, and a
threshold above which a human must approve. The agent proposes a cart, the policy engine rules on it with
written reasons, and only an allowed cart can be paid — through PayPal Orders v2.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com) — *Best Use of Agentic Commerce*.

## Why

Agentic checkout is arriving faster than the controls around it. Today the choice is "let the agent spend"
or "don't use the agent". Mandate is the missing middle: a mandate object the model cannot talk its way past,
because the enforcement is ordinary deterministic code, not another prompt.

## Quickstart (30 seconds, no credentials)

```bash
git clone https://github.com/lgf2111/mandate && cd mandate
npm install
npm run dev
```

Open http://localhost:5173. With no `PAYPAL_CLIENT_ID`/`SECRET` the app runs in **demo mode**: orders are
simulated and every ledger row is labelled `demo`. The full flow — propose → evaluate → approve → settle —
works end to end.

Use a real PayPal sandbox by copying `.env.example` to `.env` and filling the credentials from the
[developer dashboard](https://developer.paypal.com/dashboard/applications/sandbox). Live mode creates a real
Orders v2 order and returns an approve link; capture happens on return.

## How it works

```
goal ──▶ agent ──▶ proposal ──▶ policy engine ──▶ allow / require_approval / deny
                                     │                        │
                                     │                        └─▶ PayPal Orders v2 ──▶ capture ──▶ ledger
                                     └── reasons (budget, cap, merchant, category, expiry, threshold)
```

- **`src/policy.ts`** — pure evaluation function. No I/O, no clock, no network: every rule is unit-tested.
- **`src/agent.ts`** — LLM planning against a seeded catalog, with a deterministic fallback so the demo never
  depends on a model being up. The agent is *not* trusted; it only produces a proposal.
- **`src/paypal.ts`** — Orders v2 client (create, capture) with an explicit demo mode.
- **`src/server.ts`** — Express API + static hosting for the built UI.
- **`web/`** — Vite + React UI: mandate editor, agent goal, decision reasons, ledger.

The important design choice: **the model never decides whether to pay.** It proposes; `evaluate()` disposes.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | PayPal mode + agent engine |
| GET | `/api/mandates` | List mandates |
| POST | `/api/mandates` | Create a mandate |
| POST | `/api/proposals` | `{goal, mandateId}` → proposal + decision |
| POST | `/api/checkout` | `{proposalId, mandateId, approved}` → order |
| POST | `/api/orders/:id/capture` | Capture a live PayPal order |
| GET | `/api/ledger` | Settled orders |
| POST | `/api/webhooks/paypal` | Webhook sink |

## Tests

```bash
npm test        # policy engine, 15 cases incl. boundaries and multi-reason denials
npm run typecheck
```

## Deploy

`render.yaml` and a `Dockerfile` are included; the app is a single container serving both API and UI.
`npm run build` emits `web/dist`, which the server hosts automatically.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | — | Sandbox app credentials; unset → demo mode |
| `PAYPAL_BASE_URL` | `https://api-m.sandbox.paypal.com` | API host |
| `MANDATE_LLM_BASE_URL` / `MANDATE_LLM_API_KEY` | — | Any OpenAI-compatible endpoint; unset → heuristic planner |
| `MANDATE_LLM_MODEL` | `deepseek-v4.1-flash` | Model id |
| `PORT` | `8787` | API port |

## Slides and video

- **`docs/media/deck.html`** — the deck, 9 slides, 1920×1080. Open in a browser; arrow keys, space or click advance.
- **`docs/media/mandate-deck.pdf`** — same deck as PDF, printed from that HTML.
- **`docs/media/mandate-deck.pptx`** — PowerPoint version, same content, speaker notes carry the narration.
- **`docs/media/mandate-pitch.mp4`** — 2:23 narrated walkthrough, under the 3-minute limit.
- Regenerate: `scripts/build_deck.py` (pptx), `scripts/render_slides.py` (PDF → PNG), `scripts/build_video.sh` (frames + narration → MP4).

## Limits (honest ones)

- The catalog is seeded, not a live product search. Swapping in a real catalog is one function (`searchCatalog`).
- Demo mode simulates capture; live mode needs sandbox buyer approval to complete a capture.
- Webhooks are logged, not signature-verified — that is deliberate scope, not an oversight.
- The policy engine is the trust boundary; if you replace it with another LLM call you have rebuilt the problem.

## License

MIT — see [LICENSE](./LICENSE).
