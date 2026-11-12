# Mandate — recording script

Read this out loud, once per slide. It is the narration of `mandate-pitch-v3.mp4`,
timed to the slides in `deck-v2.pdf`. Times are what the words took when spoken at a
calm 180 words a minute; they are not a cage.

## Part one — the deck (0:00–1:13)

| Page | In | Line |
|---|---|---|
| 01 | 0:00 | Mandate: spending guardrails for AI shopping agents, settled with PayPal. |
| 02 | 0:05 | Today an agent with a card can spend anywhere the card clears. The controls live at the bank. |
| 03 | 0:11 | This is for someone delegating a bounded purchase: the week's groceries, school supplies, a replacement part. |
| 04 | 0:18 | Say the goal once. Approve the limits the app drafted. Then let it buy. |
| 05 | 0:22 | PayPal is the money path: OAuth, Orders two, and a capture that only happens after approval. |
| 06 | 0:29 | The model picks the item and writes the rationale. It cannot set a price, invent a SKU, or authorise anything. |
| 07 | 0:36 | One pure function decides, and checkout runs it again, so calling the endpoint directly cannot skip a rule. |
| 08 | 0:42 | Here the cart is a hundred and fifteen dollars, above the hundred dollar approval line. Nothing moves. |
| 09 | 0:48 | Approve, and PayPal settles it. The ledger keeps the row, and the budget drops to eighty five. |
| 10 | 0:54 | Fifty four tests, CI green, and a real sandbox capture recorded with its capture id. |
| 11 | 1:01 | A capped card cannot say the cart is ninety four dollars but only eighty five remains. A per cart policy can. |
| 12 | 1:07 | Run it in thirty seconds, with no credentials. The model proposes. The code disposes. |

Then: **"Let me show you."** — and switch scene.

## Part two — the demo (1:13–1:30), over the live app

Do not narrate every click. Four lines, one per beat, and let the screen land:

1. **Before you start the scene:** the app is open, freshly reset, and nothing has been typed.
   → *"The goal: trail running shoes under the cap."* (type it, then click **Draft the limits from this goal**)
2. Limits appear. → *"The limits are drafted from the catalogue. I approve them."*
   (click **Use these limits**)
3. Click **Ask the agent**, wait for the cart. → *"The agent proposes two items: a hundred and fifteen dollars. Approval required."*
   (let it sit on screen for two seconds — this is the money shot)
4. Click **Approve and pay**. → *"I approve. PayPal settles, and the ledger takes the row."*
   (let the ledger row sit; stop the recording there)

## Rules while recording

- Say the number out loud, not "over budget": *a hundred and fifteen, above the hundred dollar line*.
- Never say "unlisted" or "demo video" — it is the demo.
- If you stumble, stop, breathe, and restart the sentence. Do not restart the take.
- Total target: 1:30. Anything under 2:00 is fine; over 3:00 is disqualified.
