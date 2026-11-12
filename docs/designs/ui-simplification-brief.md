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

- `web/src/App.tsx:213` — `<main className="grid">` is two equal columns: mandate editor +
  goal on the left, proposal + ledger on the right.
- `web/src/App.tsx:150` — `saveMandate()` posts to `/api/mandates`, which **creates a new
  mandate** (verified: `POST /api/mandates` returns 201 with a new id and `spentCents: 0`)
  while `refresh()` keeps `selectedId` on the old one (`App.tsx:72`). The edit therefore
  vanishes from the form, the new version is never shown, and any spending history stays
  with the old mandate. The button says "Save as new version"; the visible effect is nothing.
- `web/src/App.tsx:255` — the decision reasons are rendered as prose bullets
  (`ul.reasons`), so a judge reads sentences to work out which limit fired.
- `web/src/App.tsx:305` — `deny` replaces the pay button with a red banner; there is no
  statement of what would make the cart pass.
- `web/src/App.tsx:203` — `Reset demo data` is a ghost button in the masthead beside the
  status badges, with no confirmation, and it deletes every mandate and order.
- `web/src/App.tsx:245` — the goal textarea's value duplicates the first example chip and
  the hint that follows it: the same sentence appears three times within 120 px.
- Accessibility that already holds: labelled inputs with `aria-describedby`, a live region
  for the decision (`role="status"`), `aria-busy` on `main`, visible `:focus-visible` rings,
  and every ratio above 4.5:1 (lowest 5.14:1 for `--faint` on `--panel`).

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

- **D0 (now):** ship the entry. No UI change until the Devpost form is submitted; the film
  matches `608782f`.
- **D1:** decision-first layout. Swap the columns' contents so the proposal/decision card is
  the first thing read; make the money button the only filled button; demote "Ask the agent"
  to the goal card's inline action. Acceptance: at 1440x900 the outcome pill, total and the
  fired reason are all above the fold without scrolling; exactly one filled button per state.
- **D2:** the mandate as a summary. Headline it `$200 budget · $150 cap · approval above
  $100`, with the seven fields behind one "Edit rules" disclosure. Acceptance: the collapsed
  summary is ≤ 2 lines and states the three numbers the demo depends on.
- **D3:** fix the save path. PATCH the existing mandate instead of creating a new one, or
  explicitly create a version and select it. Acceptance: editing a field and saving keeps
  the same mandate id and its `spentCents`, and the form shows the saved values.
- **D4:** state-specific next step. Deny → name the single most relevant limit and the
  smallest change that would pass; settled → the ledger row is the confirmation, not a
  toast; empty → the goal field is focused.
- **D5:** move `Reset demo data` behind a "Demo" menu with a confirm step. Acceptance:
  nothing destructive sits in the masthead, and the reset is two deliberate clicks.

## Analysis

*(Filled from the Goldfish review; any claim the reviewers get wrong is corrected here
rather than repeated.)*
