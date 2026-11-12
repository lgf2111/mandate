# Mandate: one screen, one decision

* **Author:** Jeff Lee
* **Date:** 2026-11-13
* **Status:** pre-review draft; no implementation before the Devpost deadline (13 Nov 2026, 04:00 +08)

## Overview

Mandate is a hackathon entry, not a business: its job is to convince a skimming judge in
under a minute that an AI shopping agent can propose a purchase and cannot authorise one.
The app is the evidence, so its workflow should put the decision first and the settings
second. Today it does the opposite — the left column is a seven-field settings form at the
same visual weight as the proposal, and the proof (outcome pill, the rule that fired, the
one button that moves money) sits in the right column competing with a ledger table.

This brief plans a simplification of the *workflow*, not a restyle. The goal is that a
stranger can complete and understand the whole loop — goal, proposal, refusal, approval,
settlement, second refusal — without reading a hint paragraph or hunting for the next
control. Visual language stays as it is: it is already coherent, dark, monospaced where it
matters, and the amber/red/green semantics read correctly against their panels
(recomputed: warn 8.46:1, bad 5.90:1, good 9.16:1 on their own surfaces).

**Constraint that shapes the plan:** the 0:40 submission film was recorded from this exact
UI at commit `608782f`. Any change to layout before the deadline invalidates the footage.
So every item below is staged after the entry is submitted, and each one is written so it
can ship in a single sitting.

## Evidence from the code

- `web/src/App.tsx:213` — `<main className="grid">` is two columns (`.grid`,
  `web/src/styles.css:62`, `0.9fr / 1.1fr`) holding a seven-field editor plus goal on the
  left, proposal and ledger on the right.
- `web/src/App.tsx:150` — `saveMandate()` posts to `/api/mandates`, and `src/server.ts:77`
  creates a **new** mandate every time: fresh `crypto.randomUUID()`, and `spentCents: 0`
  hard-coded. The client does show the new version (`App.tsx:169-170` appends it and selects
  it) — but the saved mandate starts at zero spend, and nothing in the UI can return to the
  older one (`setSelectedId` is called only at `:75`, `:170`, `:182`). Editing a rule after a
  settlement therefore re-arms the budget while the old version keeps the history.
- `web/src/App.tsx:301` — decision reasons render as prose bullets. `reason.code` exists in
  the payload and is used only as a React key, so the code a judge would remember
  (`over_budget`) never reaches the screen.
- `web/src/App.tsx:309` — deny and settle share one `.actions` container; deny substitutes a
  plain `div.blocked` (`:311`) for the button, and there is no statement of what would pass.
  The `.blocked` div is also outside the live region, so a screen reader is not told.
- `web/src/App.tsx:208` — `Reset demo data` is a ghost button in the masthead beside the
  status badges, unguarded, and it wipes every mandate and order (`/api/reset`).
- `web/src/App.tsx:235` and `:245` — the goal's initial value is `EXAMPLES[0]`, so the same
  sentence appears in the textarea and in the first chip until the first keystroke. Twice,
  not three times: the hint below is different copy.
- `src/server.ts:206` — `/api/ledger` returns `store.listOrders()` unfiltered, so the ledger is
  global while `spentCents` is per-mandate. After a save the editor reads "Spent $0.00 of
  $200.00" beside a ledger still listing the previous version's row.
- Accessibility that already holds: labelled inputs with `aria-describedby`, a live region on
  the decision (`role="status"`), `aria-busy` on `main`, visible `:focus-visible` rings, and
  every colour pair at or above 4.5:1 (lowest `--faint` on `--panel` = 5.14:1, recomputed).

## Goals vs. Non-Goals

**In scope**
1. One primary action per state: the next thing to click is the only filled button on screen.
2. The decision (outcome, total, the limit that fired) reads before any setting does.
3. Editing rules mid-flow cannot silently discard the edit or fork the spending budget.
4. The empty, denied and settled states each say what to do next, in one line.
5. Keyboard and screen-reader order follows the visual order; the flow is completable
   without a pointer.

**Out of scope**
- A visual redesign, new palette, new type scale, or motion. The look is not the problem.
- New product capability (sharing, live catalog, webhook verification). Judging does not
  reward it and the entry is frozen.
- Mobile-native layouts. The demo is a desktop projector; responsive behaviour only has to
  not break.
- Reworking the video, the deck or the copy. Those are submitted artefacts.

## Alternatives Weighed

1. **Restyle the app to look more "product".** Rejected: it invalidates the film for a
   change the video cannot show, and the current surface is coherent.
2. **Add a guided tour / onboarding overlay.** Rejected: a judge clicking a demo should not
   have to dismiss a tutorial; the flow itself should be self-evident.
3. **Split into a multi-page wizard (Goal → Proposal → Settle).** Held, not adopted: three
   routes hide the mandate's context, and the whole pitch is that rules and decision are
   visible at once.
4. **Reorder only: decision column first, settings second.** Adopted as stage 1 — the
   smallest change that fixes hierarchy, and it keeps one screen.
5. **Collapse the mandate editor to a summary line that expands.** Adopted as stage 2,
   after the reorder, because it needs the summary to be readable at a glance.

## Key Decisions & Staging

Ordered by what unblocks what. D0 is a gate, not a stage.

- **D0 — ship first.** Submission confirmed before any pixel moves, and the deployed app
  pinned to the commit the film was made from. Exit condition: the Devpost URL exists.
- **D1 — stop forking the budget.** Add `PATCH /api/mandates/:id` (a merge into the existing
  mandate; `store.saveMandate` already upserts by id) and point `saveMandate()` at it. This is
  a server change, not a UI tweak: new route, its own schema (do not reuse
  `mandateSchema.partial()`, whose `.default()`s would null the cap and empty the lists), and
  404 `mandate_not_found`. No pixels change, so the film stays valid.
  *Acceptance:* create a mandate, settle $115, PATCH `{name}`, then `GET /api/mandates` —
  same id, `spentCents` still 11 500, one mandate in the list.
- **D2 — mandate as a summary line.** Collapse the seven fields to a headline plus one
  "Edit rules" disclosure, but the headline must carry the rules the demo turns on, not just
  money: `$200 budget · $150 cap · approval above $100 · RunCo,TrailSupply · running,apparel`.
  Hiding merchants and categories hides the cause of a `merchant_blocked` denial, which is
  half the pitch. *Acceptance:* a unit test on `summarize(mandate)` for the string above plus
  the null branches ("no cap", "no approval required").
- **D3 — the decision gets the first read.** Move the proposal/decision column ahead of the
  editor in the JSX (not CSS `order`, which would break focus order) and rebalance the grid
  to `1.1fr / 0.9fr`. *Acceptance:* in the DOM, the decision card precedes the mandate card,
  and the outcome label plus `Total` are the first two texts inside the first card.
- **D4 — the verdict is the loudest thing.** The outcome chip is `11.5px` mono
  (`styles.css:125`) while the model's rationale is a bordered panel at 13.5px — the quote gets
  the decoration, the verdict gets the smallest type. Invert that: verdict large, the reason
  code (`over_budget`) rendered beside it, the rationale demoted to muted text.
  *Acceptance:* the chip's computed font-size is the largest in the card, and the reason code
  string is present in the DOM.
- **D5 — one filled button per state; next step in the same card.** Demote "Save as new
  version" to ghost (it is the same gradient as the brand mark today, so the action colour
  signals chrome rather than money), and move the checkout notice out of the Goal card
  (`App.tsx:251`, ~600px from the controls it describes) into the decision card. Deny keeps a
  full reason list — the Devpost copy promises "every reason, not just the first" — and gains
  one computed line above it naming the limit that fired and the smallest change that passes.
  *Acceptance:* `document.querySelectorAll("button.primary").length === 1` in each state, and
  the reason list still shows every code the API returned.
- **D6 — reset gets a confirm.** One `confirm()` guard, not a menu: the store reseeds itself
  anyway, and a popover costs more than the risk it removes.
- **Cut: the "Demo" menu** from the earlier draft (focus management, Escape, outside-click) —
  heavier than D2 for no judge-facing value.

## Analysis

Seven lenses ran against this brief. The first draft was wrong in its headline claim, so the
brief is corrected rather than annotated with a retraction.

**Rejected: the original D3 premise.** The draft said the saved edit "vanishes from the form".
It does not — `App.tsx:169-170` appends the response and selects the new id, and the editor
re-syncs from it. Three lenses caught this independently. The defect underneath is narrower
and worse: `server.ts:77-90` mints a fresh id with `spentCents: 0`, so saving after a settlement
silently re-arms the budget while the old version keeps the history, and no control can reach
the old version again. A plan built on the cosmetic reading would have "fixed" a line that
already worked.

**Rejected: collapsing the mandate to three money numbers.** A judge watching the second
refusal is watching `merchant_blocked` — the blocked-merchant list. A summary that prints only
budget, cap and threshold hides the rule that produced the moment. The summary keeps the
merchant and category lists; the reasons stay complete and "the limit that fired" is added
above them, never instead of them. That also keeps the Devpost claim ("every reason, not just
the first") true.

**Kept, against the draft's ordering:** the budget-fork fix comes before any visual work. It
changes no pixels, so it cannot invalidate the film, and it is what makes the summary line
truthful — before it, a "Spent $X of $Y" headline can print a number the save path has already
abandoned.

**Measured, not assumed:** every colour pair in `styles.css` clears 4.5:1 (minimum 5.14:1 for
`--faint` on `--panel`), so no contrast finding survives review. The hierarchy defect is the
three identical gradient buttons (Ask, Save, Pay), not the palette. There is no UI test
harness — `npm test` renders nothing — so each acceptance above is written to be checkable
without a browser except D3's, which needs one look at 1440x900.

**The transform proposed and not adopted.** One horizontal money line where the cart is a strip
of ruled cells, each rule a hairline marker, and the verdict a stamp at the cart's edge: rule,
cart and outcome as one object instead of two columns. It resolves the real tension rather than
trading one side for the other. Not adopted now because it rewrites the screen with no visual
spec, and its failure mode is exact: 1200px of horizontal fill reads as a progress bar, and a
gauge measures rather than forbids, which is the opposite of the product's claim. Worth a
sketch after D1-D6, not instead of them.

**Open:** the model call takes ~35 s against the configured gateway and the UI offers only
"Working…". Until that is shortened or explained on screen, a judge who clicks "Ask the agent"
waits half a minute with no progress signal.
