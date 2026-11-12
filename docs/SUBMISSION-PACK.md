# Submission pack — what goes into the Devpost form

Everything below is ready to paste. The only field left blank is the video URL, because
the video is recorded and uploaded by hand.

## Basics

- **Project name:** Mandate
- **Elevator pitch (200 chars):** Spending guardrails for AI shopping agents: the model proposes a cart, deterministic policy decides, PayPal settles — and every refusal carries a reason code.
- **Links**
  - Code: https://github.com/lgf2111/mandate
  - Hosted demo: https://jeffs-macbook-pro.tail895d47.ts.net
  - Video: `<< paste the YouTube URL here >>`
- **Prize categories:** Best Use of Agentic Commerce · Best Use of PayPal + AI

## Tools (the required field)

> **deepseek-v4.1-flash**, through an OpenAI-compatible gateway (`MANDATE_LLM_*`).
> The model receives the shopping goal, the mandate's limits, and a candidate list already
> filtered by merchant, category and cap. It returns the SKU it recommends plus the
> rationale a shopper reads. Its output is input to be validated, never an authorisation:
> alphanumeric SKUs are checked against the catalogue, prices come from the catalogue and
> never from the model, and the decision to spend is made by `src/policy.ts` — a pure
> function with no I/O. `/api/proposals` reports which engine actually answered
> (`llm` or `heuristic`), so a silent fallback cannot masquerade as a model answer.
>
> **PayPal Orders v2 + OAuth 2.0** (sandbox): token minted and cached, order created with
> `intent: CAPTURE` in integer cents, capture after buyer approval, ledger row per
> settlement. A premature capture is refused by PayPal itself with `ORDER_NOT_APPROVED`,
> which is the proof the integration is live rather than simulated.

## Text description

The full submission text is `docs/DEVPOST.md`, section by section:
Inspiration · What it does · How we built it · Challenges · Accomplishments ·
What we learned · What's next · Built with · Try it.

Paste the sections in order; the headings already match the form's long-description field.

## Functional demo — how a judge runs it

**Hosted:** https://jeffs-macbook-pro.tail895d47.ts.net — open, press *Ask the agent*, then
*Approve and pay*. Reset with *Reset demo data*.

**Locally, no credentials:**

```bash
git clone https://github.com/lgf2111/mandate && cd mandate
npm install
npm run dev
# http://localhost:5173
```

Verified from a clean clone: `npm ci` → `npm run typecheck` → `npm test` (54 passing) →
`npm run build`, all green on macOS with Node 22.

## Requirement checklist

| Requirement | Where it is met |
|---|---|
| Built with PayPal + AI | Orders v2 sandbox capture recorded (`5KT45525KN917902M`); model answers with `engine: "llm"`, verified against the live gateway |
| Text description | `docs/DEVPOST.md` |
| Functional demo, runnable | Hosted URL above, plus a quickstart that needs no credentials; demo mode is a branch at the PayPal boundary, not a mock of the app |
| Not a static prototype | Real HTTP API: `POST /api/proposals` → `409 approval_required` / `409 denied_by_policy`; enforcement re-runs at checkout |
| Tools field | Above |
| Public repo, all source | 44 files tracked, MIT, `.env` and `data/` ignored |
| License visible in About | GitHub reports `MIT License` for the repo |
| Video under 3 minutes, public on YouTube | Recorded by hand from `docs/media/pitch-script.md`; 1:27 as scripted |
| No third-party trademarks or music | Screens only; narration is a synthetic voice, no music |

## Numbers to keep consistent

- Tests: **54** (policy 16, API 15, agent 12, catalog 6, PayPal 5).
- Cart: **$115.00** = Trail Runner 2 $94.00 + Merino Sock 3-pack $21.00, above the $100.00
  auto-approve line, under the $150.00 cap and the $200.00 budget.
- After settlement **$85.00** remains, so a $94.00 cart is refused with
  `Cart is $94.00 but only $85.00 remains.`
- Reason codes: `over_budget`, `over_transaction_cap`, `merchant_blocked`,
  `merchant_not_allowed`, `category_not_allowed`, `split_merchant`, `mandate_expired`,
  `empty_proposal`. Above the threshold the outcome is `require_approval`, not a deny.
- Sandbox: order `57874901BY376944J`, capture `5KT45525KN917902M`.
