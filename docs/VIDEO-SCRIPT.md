# Video script — Mandate

**Runtime target: 2:52. Hard limit: 3:00.** Narration is 423 words, read at roughly 150–160 words per
minute (about 164 seconds of speech). If a line runs long, cut words — do not speed up.

The video has one job: show that a model can propose a purchase and cannot authorize one.

---

## Before you record

- [ ] Click **Reset demo data**. Confirm: `PayPal: demo`, `agent: heuristic`, `Spent $0.00 of $200.00`, `0 orders`.
- [ ] Record in **demo mode with the heuristic planner**. It responds in milliseconds, so the timing below
      holds. The LLM path uses the same UI but adds model latency.
- [ ] Browser at 1440×900, zoom 110%, bookmarks bar hidden, one tab. 1920×1080, 30 fps, cursor visible.
- [ ] Terminal in the repo root, large font, ready for the `npm test` shot at 2:05.
- [ ] Do a dry run of the three clicks: **Ask the agent** → **Approve and pay** → **Ask the agent**.
- [ ] Record narration separately and lay it over the capture. Mute system audio.

---

## Shot list

### 0:00 – 0:19 · Cold open — the gap

**On screen:** Near-black frame. Three lines appear, one every four seconds, centred:

```
Agents can shop.
They can also spend.
Nothing in between.
```

At 0:14, cut to a dimmed, slowly pushing-in shot of the empty proposal panel.

**Action:** No cursor. Text only.

**Highlight:** The words **"Nothing in between."**

**Say:**
> An agent can shop for you end to end. It can also spend your money end to end. Today the choice is to hand over the card, or not use the agent. Mandate is the missing middle: a spending limit the agent cannot argue with, checked before a cent moves.

---

### 0:20 – 0:44 · The mandate

**On screen:** The app at `localhost:5173`. Slow push-in on the left column.

**Action:** Move the cursor down the fields as each is named, top to bottom. Pause briefly on the blocked
merchants field at "SketchySports". Cut to a tighter crop of the three money fields for the first three
numbers, then back out.

**Highlight:** **Budget 200**, **Per-transaction cap 150**, **Approval threshold 100**; then **SketchySports**
in the blocked field.

**Say:**
> This is the mandate. Two hundred dollars in total. A hundred and fifty per transaction. Anything above a hundred needs a human. RunCo and TrailSupply are allowed; SketchySports is blocked. Only running and apparel. It expires in seven days. These are database rows, not instructions in a prompt. The agent can read them; it cannot rewrite them. That is the point.

---

### 0:45 – 1:04 · The agent proposes

**On screen:** The Goal card and the empty Proposal card.

**Action:** Click the prefilled goal chip **`trail running shoes under the cap`** (it is already the value —
the click shows where the goal comes from), then click **Ask the agent**. Let the result land.

**Highlight:** The two line items and the **$115.00** total. Flick to the rationale quote for one second,
then back to the items.

**Say:**
> The goal is prefilled: trail running shoes under the cap. Ask the agent. It picks the Trail Runner 2 at ninety-four dollars, and adds merino socks at twenty-one, same store. A hundred and fifteen total, with a written rationale. Nothing has been charged yet. That is the agent's whole job: propose, and explain.

---

### 1:05 – 1:34 · The policy engine rules

**On screen:** The Proposal card, tight crop.

**Action:** Hold on the outcome pill. As each number is spoken, tap the corresponding row: Total, Budget
remaining after, then the reason line. At 1:31, move to the button.

**Highlight:** The **APPROVAL REQUIRED** pill, then the reason
`$115.00 is above the $100.00 auto-approve threshold.`, then the **Budget remaining after this order** row showing **$85.00**.

**Say:**
> Now the part that matters. The engine reads the cart, not the rationale. A hundred and fifteen is under the transaction cap and inside the budget, but above the hundred-dollar approval threshold. So the outcome is approval required, and the reason is in plain text. Every reason carries a code, not just a sentence. Policy is code, so the answer is the same every time. No approval, no payment. Approve and pay.

**Cut:** Click **Approve and pay** at 1:33 so the settlement lands exactly on the next beat.

---

### 1:35 – 1:50 · PayPal payment and the ledger

**On screen:** The notice line, then a pan down to the Ledger table.

**Action:** Hold on `Paid $115.00 to RunCo.` for two seconds. Pan to the new ledger row. Then cut to the
Mandate footer: `Spent $115.00 of $200.00`.

**Highlight:** The **`captured · demo mode`** pill, then the spent line.

**Say:**
> Demo mode settles immediately: RunCo, a hundred and fifteen dollars, captured, labelled demo. In live mode the same call creates a PayPal sandbox order, captured after buyer approval. The mandate now reads a hundred and fifteen spent of two hundred.

**Optional insert (3s):** If sandbox credentials are configured, cut to the **Open PayPal approval** / **Capture payment**
controls and the sandbox approval screen. Keep the beat the same length; drop the ledger hold to one second.

---

### 1:50 – 2:05 · The budget holds

**On screen:** Back to the Goal card, then the Proposal card.

**Action:** Click **Ask the agent** again. Do not change the goal. Let the red result land.

**Highlight:** The **DENY** pill, the reason `Cart is $94.00 but only $85.00 remains.`, then the red panel
`Blocked by the mandate. No payment can be made for this cart.` Let the empty button area sit for a beat.

**Say:**
> Ask again, same goal. The agent drops the socks, because they no longer fit, and proposes the shoes alone at ninety-four. Eighty-five remains. Denied: the cart is ninety-four, only eighty-five remains. No payment path exists for this cart.

---

### 2:05 – 2:34 · Architecture — the model proposes, code disposes

**On screen:** Cut to a simple flow diagram on a clean background:

```
Goal ──▶ Agent ──▶ Proposal
                      │
                ──────┼──────  trust boundary
                      ▼
                  evaluate() ──▶ allow / require_approval / deny
                      │
                      ▼
              PayPal Orders v2 ──▶ Ledger
```

Label the horizontal line after **Proposal**: *trust boundary — model output ends here*.

**Action:** At 2:15, cut to `src/policy.ts` with `evaluate()` visible, then to the terminal running
`npm test`. Let the real summary line show.

**Highlight:** The **trust boundary** line; then the `evaluate(proposal, mandate, now)` signature; then the
passing test summary.

**Say:**
> Two layers. The model proposes: it picks from a pre-filtered catalog and writes the rationale. Code disposes: policy dot T S is a pure function. No network, no clock, no model. Budget, cap, merchant, category, expiry, threshold. Every rule has tests, and they pass. The decision returns codes, severities, and totals. Checkout re-runs the same evaluation server-side, so skipping the UI does not skip policy. The model is never trusted with the decision.

---

### 2:35 – 2:52 · Close

**On screen:** End card over the full app at `Spent $115.00 of $200.00`:

```
Mandate
Spending guardrails for AI shopping agents, settled with PayPal.

<repo-url>
npm install && npm run dev   ·   demo mode, no credentials
```

**Action:** No cursor movement. Hold the card for the full beat.

**Highlight:** The **repo URL**.

**Say:**
> Mandate. Spending guardrails for AI shopping agents, settled with PayPal. The model proposes; code disposes. It runs in demo mode with no credentials. Everything you just saw is in the repository, with a runbook. Link below.

---

## Timing check

| Beat | In | Out | Words | At 155 wpm |
|---|---|---|---|---|
| Cold open | 0:00 | 0:19 | 50 | 19.4s |
| The mandate | 0:20 | 0:44 | 61 | 23.6s |
| Agent proposes | 0:45 | 1:04 | 53 | 20.5s |
| Policy rules | 1:05 | 1:34 | 72 | 27.9s |
| Payment + ledger | 1:35 | 1:50 | 40 | 15.5s |
| Budget holds | 1:50 | 2:05 | 38 | 14.7s |
| Architecture | 2:05 | 2:34 | 73 | 28.3s |
| Close | 2:35 | 2:52 | 36 | 13.9s |
| **Total** | | **2:52** | **423** | **163.7s** |

Timings are targets; ±1 second per beat is normal. The total is what matters.

If you need to reclaim time, cut the rationale flicker at 0:45 and the optional live insert at 1:35. Do not
cut the denial at 1:50 — it is the proof that the budget is enforced across requests.

---

## If the demo breaks

**One line, said calmly, while cutting to the terminal:**
> "The policy engine is a pure function, so I can show you the same decision from the test suite — same rules, no UI."

Then run `npm test` and show the real passing output. Do not improvise a different explanation, and do not
describe results you cannot show.

---

## Accuracy guardrails

- Say **demo** when the ledger says demo. Never imply real money moved in the default run.
- Do not claim production readiness, scale, adoption, or time saved. There are no such numbers here.
- Do not read a test count unless it is visible on screen; let the terminal supply the real one.
- Do not say the AI approves or pays. The model proposes; code disposes; a human approves above the threshold.
- When you click **Approve and pay**, you are playing the approver. Say or imply that, so it does not read as
  the agent approving itself.

---

## Edit checklist

- [ ] Final runtime ≤ 2:52; hard stop before 3:00.
- [ ] Narration 423 words, 150–160 wpm; no line rushed.
- [ ] Captions match the narration. Check "Orders v2", "approval required", and dollar amounts.
- [ ] Every click is visible on screen; cursor is not parked over text being read.
- [ ] No wait longer than one second; results are not sped up.
- [ ] End card holds for at least five seconds with the repo URL readable.
- [ ] One audio track; no music with lyrics under narration.
