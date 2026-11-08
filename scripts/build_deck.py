"""Build the Mandate pitch deck (16:9, dark) with python-pptx.

Design tokens mirror web/src/styles.css so the deck, the app and the video match.
Narration lives in the speaker notes so the deck is self-describing.
"""
from __future__ import annotations

import os
import sys

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt
from pptx.oxml.ns import qn

BG = RGBColor(0x0A, 0x0C, 0x10)
PANEL = RGBColor(0x12, 0x15, 0x1B)
PANEL2 = RGBColor(0x17, 0x1B, 0x22)
LINE = RGBColor(0x2A, 0x33, 0x40)
TEXT = RGBColor(0xE8, 0xED, 0xF5)
DIM = RGBColor(0x9A, 0xA6, 0xB4)
ACCENT = RGBColor(0x6E, 0xA8, 0xFE)
GOOD = RGBColor(0x3E, 0xCF, 0x8E)
WARN = RGBColor(0xF5, 0xA5, 0x24)
BAD = RGBColor(0xF3, 0x6C, 0x6C)

SANS = os.environ.get("DECK_SANS", "Helvetica Neue")
MONO = os.environ.get("DECK_MONO", "Menlo")

W, H = 13.333, 7.5
M = 0.9


def rgb(hexish: str) -> RGBColor:
    h = hexish.lstrip("#")
    return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def deck() -> Presentation:
    prs = Presentation()
    prs.slide_width = Inches(W)
    prs.slide_height = Inches(H)
    return prs


def blank(prs: Presentation):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    bg = slide.background.fill
    bg.solid()
    bg.fore_color.rgb = BG
    return slide


def text(
    slide,
    x: float,
    y: float,
    w: float,
    h: float,
    body: str,
    *,
    size: float = 18,
    color: RGBColor = TEXT,
    bold: bool = False,
    font: str = SANS,
    align=PP_ALIGN.LEFT,
    anchor=MSO_ANCHOR.TOP,
    spacing: float = 1.0,
    tracking: float | None = None,
) -> None:
    """Always a fresh textbox at absolute coordinates.

    Never write into a shape's own text frame: every call would append a paragraph
    to the same frame, which is how the first cut of this deck ended up with item
    names and prices stacked in one overflowing run.
    """
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    lines = body.split("\n")
    for index, line in enumerate(lines):
        para = tf.paragraphs[0] if index == 0 else tf.add_paragraph()
        para.alignment = align
        para.line_spacing = spacing
        run = para.add_run()
        run.text = line
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.name = font
        run.font.color.rgb = color
        if tracking is not None:
            run.font._rPr.set("spc", str(int(tracking * 100)))


def rect(
    slide,
    x: float,
    y: float,
    w: float,
    h: float,
    *,
    fill: RGBColor | None = PANEL,
    line: RGBColor | None = LINE,
    radius: float = 0.06,
    shape=MSO_SHAPE.ROUNDED_RECTANGLE,
):
    shp = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        try:
            shp.adjustments[0] = radius
        except (IndexError, ValueError):
            pass
    if fill is None:
        shp.fill.background()
    else:
        shp.fill.solid()
        shp.fill.fore_color.rgb = fill
    if line is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = line
        shp.line.width = Pt(0.75)
    shp.shadow.inherit = False
    return shp


def label(slide, text_value: str, *, color: RGBColor = ACCENT) -> None:
    text(slide, M, 0.62, 8.0, 0.3, text_value.upper(), size=10.5, color=color, font=MONO, tracking=2.2)


def notes(slide, body: str) -> None:
    slide.notes_slide.notes_text_frame.text = body


def build() -> Presentation:
    prs = deck()

    # 1 — title
    s = blank(prs)
    rect(s, M, 0.62, 4.35, 0.36, fill=PANEL, line=LINE, radius=0.5)
    text(s, M + 0.22, 0.72, 4.0, 0.22, "PAYPAL AI HACKATHON · AGENTIC COMMERCE", size=9.5, color=DIM, font=MONO, tracking=1.2)
    text(s, M, 2.15, 10, 1.5, "Mandate", size=92, bold=True)
    text(
        s, M + 0.04, 3.55, 9.6, 1.2,
        "Spending guardrails for AI shopping agents,\nsettled with PayPal.",
        size=24, color=DIM, spacing=1.25,
    )
    rect(s, M + 0.04, 5.05, 1.6, 0.03, fill=ACCENT, line=None, shape=MSO_SHAPE.RECTANGLE)
    text(s, M, 6.55, 11, 0.3, "github.com/lgf2111/mandate", size=12, color=DIM, font=MONO)
    notes(
        s,
        "Every shopping agent needs a spending limit it cannot argue with. "
        "This is Mandate: guardrails for AI shopping agents, settled with PayPal.",
    )

    # 2 — the gap
    s = blank(prs)
    label(s, "The gap")
    text(s, M, 1.85, 11.5, 0.9, "Agents can shop.", size=58, bold=True)
    text(s, M, 2.85, 11.5, 0.9, "They can also spend.", size=58, bold=True)
    text(s, M, 3.85, 11.5, 0.9, "Nothing in between.", size=58, bold=True, color=ACCENT)
    text(s, M, 5.5, 11.5, 0.4, "Today the choice is to hand over the card, or not use the agent.", size=17, color=DIM)
    notes(
        s,
        "An agent can now shop end to end. It can also spend end to end. "
        "Today the choice is to hand over the card, or not use the agent at all. "
        "Mandate is the missing middle.",
    )

    # 3 — what a mandate is
    s = blank(prs)
    label(s, "A mandate")
    text(s, M, 1.05, 6.4, 0.9, "Rules in a database,\nnot a sentence in a prompt.", size=30, bold=True, spacing=1.05)
    bullets = [
        "The agent can read these rules.",
        "It cannot rewrite them.",
        "They are checked in code at checkout.",
        "A human approves, not the model.",
    ]
    y = 2.75
    for item in bullets:
        rect(s, M, y + 0.09, 0.09, 0.09, fill=ACCENT, line=None, shape=MSO_SHAPE.OVAL)
        text(s, M + 0.28, y, 5.6, 0.4, item, size=15.5, color=DIM)
        y += 0.55

    card = rect(s, 7.15, 1.05, 5.25, 5.35, fill=PANEL, line=LINE, radius=0.05)
    text(s, 7.45, 1.3, 4.6, 0.3, "MANDATE · WEEKEND RUNNING GEAR", size=9.5, color=DIM, font=MONO, tracking=1.4)
    rows = [
        ("Budget", "$200.00"),
        ("Per transaction", "$150.00"),
        ("Approval above", "$100.00"),
        ("Allowed merchants", "RunCo, TrailSupply"),
        ("Blocked merchants", "SketchySports"),
        ("Categories", "running, apparel"),
        ("Expires", "in 7 days"),
    ]
    y = 1.78
    for name, value in rows:
        text(s, 7.45, y, 2.0, 0.3, name, size=12.5, color=DIM, font=MONO)
        text(s, 9.55, y, 2.6, 0.3, value, size=13, color=TEXT, font=MONO)
        rect(s, 7.45, y + 0.42, 4.65, 0.008, fill=LINE, line=None, shape=MSO_SHAPE.RECTANGLE)
        y += 0.6
    notes(
        s,
        "A mandate is a row in a database, not a sentence in a prompt. Two hundred dollars total. "
        "A hundred and fifty per transaction. Anything above a hundred needs a human. "
        "Two merchants allowed, one blocked, two categories, and an expiry. "
        "The agent can read these rules. It cannot rewrite them.",
    )

    # 4 — flow
    s = blank(prs)
    label(s, "The flow")
    text(s, M, 1.05, 11, 0.6, "The model proposes. The code decides.", size=32, bold=True)
    steps = ["Goal", "Agent", "Policy engine", "PayPal order", "Capture", "Ledger"]
    colors = [DIM, DIM, ACCENT, DIM, DIM, GOOD]
    x = M
    box_w, gap = 1.72, 0.2
    for index, (name, color) in enumerate(zip(steps, colors)):
        box = rect(s, x, 2.55, box_w, 1.0, fill=PANEL2, line=LINE, radius=0.08)
        text(s, x + 0.12, 2.88, box_w - 0.24, 0.35, name, size=12.5, color=color, font=MONO, align=PP_ALIGN.CENTER, bold=(index == 2))
        if index < len(steps) - 1:
            text(s, x + box_w + 0.02, 2.75, gap, 0.5, "›", size=20, color=DIM, align=PP_ALIGN.CENTER)
        x += box_w + gap

    outcomes = rect(s, M, 4.0, 11.5, 0.62, fill=PANEL, line=LINE, radius=0.1)
    text(s, M + 0.3, 4.19, 11.0, 0.3, "allow    ·    require approval    ·    deny        — with written reasons", size=13, color=DIM, font=MONO)
    text(s, M, 4.85, 11.5, 0.4, "Only an allowed cart reaches PayPal. Denials never create an order.", size=15, color=DIM)
    text(s, M, 5.55, 11.5, 0.4, "evaluate() runs again at checkout, so a decision cannot be stale or forged.", size=15, color=ACCENT, font=MONO)
    notes(
        s,
        "Here is the whole system. The agent proposes a cart. A pure policy engine evaluates it and returns "
        "allow, require approval, or deny, with written reasons. Only an allowed cart reaches PayPal Orders, "
        "capture, and the ledger. The model never decides whether to pay.",
    )

    # 5 — approval
    s = blank(prs)
    label(s, "Live example")
    text(s, M, 1.05, 11, 0.6, "Trail shoes, plus socks: $115.00", size=30, bold=True)

    cart = rect(s, M, 1.95, 6.1, 3.15, fill=PANEL, line=LINE, radius=0.05)
    text(s, 1.22, 2.23, 5.0, 0.3, "PROPOSAL", size=9.5, color=DIM, font=MONO, tracking=1.4)
    items = [("Trail Runner 2 · RunCo", "$94.00", 2.73), ("Merino Sock 3-pack · RunCo", "$21.00", 3.28)]
    for name, price, row_y in items:
        text(s, 1.22, row_y, 4.2, 0.3, name, size=13.5, color=TEXT)
        text(s, 5.43, row_y, 1.25, 0.3, price, size=13.5, color=TEXT, font=MONO, align=PP_ALIGN.RIGHT)
    rect(s, 1.22, 3.9, 5.45, 0.008, fill=LINE, line=None, shape=MSO_SHAPE.RECTANGLE)
    text(s, 1.22, 4.1, 3.0, 0.3, "Total", size=14, color=DIM)
    text(s, 4.6, 4.05, 2.08, 0.4, "$115.00", size=18, color=TEXT, font=MONO, bold=True, align=PP_ALIGN.RIGHT)

    decision = rect(s, 7.1, 1.95, 5.3, 3.15, fill=PANEL2, line=WARN, radius=0.05)
    rect(s, 7.4, 2.23, 2.55, 0.34, fill=RGBColor(0x2A, 0x20, 0x0C), line=WARN, radius=0.5)
    text(s, 7.52, 2.3, 2.3, 0.22, "APPROVAL REQUIRED", size=9.5, color=WARN, font=MONO, tracking=1.2)
    text(s, 7.4, 2.85, 4.7, 0.3, "Above the $100.00 auto-approve threshold", size=13.5, color=TEXT)
    text(s, 7.4, 3.3, 4.7, 0.3, "Budget remaining after: $85.00", size=13.5, color=DIM)
    rect(s, 7.4, 4.05, 2.55, 0.6, fill=ACCENT, line=None, radius=0.18)
    text(s, 7.4, 4.21, 2.55, 0.3, "Approve and pay", size=12.5, color=RGBColor(0x06, 0x0C, 0x18), bold=True, align=PP_ALIGN.CENTER)

    rect(s, M, 5.35, 11.5, 0.85, fill=PANEL, line=GOOD, radius=0.08)
    text(s, M + 0.35, 5.6, 10.8, 0.35, "captured · DEMO-CAP-11985ed7 · budget now $115.00 of $200.00", size=13.5, color=GOOD, font=MONO)
    notes(
        s,
        "Trail shoes at ninety four dollars. Socks added, a hundred and fifteen total. "
        "That is above the hundred dollar threshold, so the decision is approval required, with the reason on screen. "
        "A human approves, PayPal captures, and the budget drops to eighty five.",
    )

    # 6 — denial
    s = blank(prs)
    label(s, "Same cart, ask again")
    text(s, M, 1.05, 11, 0.6, "Denied — because the numbers moved.", size=30, bold=True, color=BAD)

    cart = rect(s, M, 1.95, 6.1, 2.6, fill=PANEL, line=LINE, radius=0.05)
    text(s, 1.22, 2.23, 5.0, 0.3, "PROPOSAL", size=9.5, color=DIM, font=MONO, tracking=1.4)
    text(s, 1.22, 2.73, 4.2, 0.3, "Trail Runner 2 · RunCo", size=13.5, color=TEXT)
    text(s, 5.43, 2.73, 1.25, 0.3, "$94.00", size=13.5, color=TEXT, font=MONO, align=PP_ALIGN.RIGHT)
    text(s, 1.22, 3.23, 4.2, 0.3, "Merino Sock 3-pack · RunCo", size=13.5, color=TEXT)
    text(s, 5.43, 3.23, 1.25, 0.3, "$21.00", size=13.5, color=TEXT, font=MONO, align=PP_ALIGN.RIGHT)
    rect(s, 1.22, 3.75, 5.45, 0.008, fill=LINE, line=None, shape=MSO_SHAPE.RECTANGLE)
    text(s, 1.22, 3.93, 3.0, 0.3, "Total", size=14, color=DIM)
    text(s, 4.6, 3.88, 2.08, 0.4, "$115.00", size=18, color=BAD, font=MONO, bold=True, align=PP_ALIGN.RIGHT)

    decision = rect(s, 7.1, 1.95, 5.3, 2.6, fill=RGBColor(0x1A, 0x10, 0x12), line=BAD, radius=0.05)
    rect(s, 7.4, 2.23, 1.3, 0.34, fill=RGBColor(0x2A, 0x12, 0x14), line=BAD, radius=0.5)
    text(s, 7.52, 2.3, 1.1, 0.22, "DENY", size=9.5, color=BAD, font=MONO, tracking=1.2)
    text(s, 7.4, 2.85, 4.7, 0.6, "$115.00 exceeds the\n$85.00 remaining", size=13.5, color=TEXT, spacing=1.2)
    text(s, 7.4, 3.8, 4.7, 0.3, "no_payment_is_possible", size=12, color=BAD, font=MONO)

    text(s, M, 5.0, 11.5, 0.5, "Same model. Same request. Different outcome, because the budget is state.", size=16, color=DIM)
    text(s, M, 5.6, 11.5, 0.5, "A prompt cannot enforce that. A function can.", size=16, color=ACCENT, font=MONO)
    notes(
        s,
        "Ask again, and the same cart is denied. A hundred and fifteen exceeds the eighty five that is left. "
        "The checkout button is gone. No payment is possible. Same model, same request, different outcome, "
        "because the numbers moved.",
    )

    # 7 — trust boundary
    s = blank(prs)
    label(s, "Trust boundary")
    text(s, M, 1.05, 11, 0.6, "One function decides. Nothing else does.", size=30, bold=True)

    left = rect(s, M, 2.0, 5.55, 3.6, fill=PANEL, line=LINE, radius=0.05)
    text(s, M + 0.32, 2.28, 4.9, 0.3, "AGENT · UNTRUSTED", size=10, color=WARN, font=MONO, tracking=1.4)
    text(s, M + 0.32, 2.8, 4.9, 2.6, "Proposes SKUs from a fixed catalog\n\nWrites its own rationale\n\nCan be wrong, or manipulated", size=13.5, color=DIM, spacing=1.15)

    right = rect(s, 6.95, 2.0, 5.45, 3.6, fill=PANEL, line=ACCENT, radius=0.05)
    text(s, 7.27, 2.28, 4.9, 0.3, "evaluate() · TRUSTED", size=10, color=ACCENT, font=MONO, tracking=1.4)
    text(s, 7.27, 2.8, 4.9, 2.7, "Pure: no clock, no network, no randomness\n\n16 unit tests, cent-exact boundaries\n\nRe-runs at checkout, reads spend from the store", size=13.5, color=TEXT, spacing=1.15)

    text(s, M, 5.95, 11.5, 0.6, "The model proposes. The code disposes.", size=22, bold=True, color=ACCENT)
    notes(
        s,
        "The trust boundary is one function. Evaluate takes no clock, no network, no randomness, so all sixteen "
        "rules are unit tested, including the boundary cases. It re-runs at checkout, so a decision cannot be "
        "stale or forged. The model proposes. The code disposes.",
    )

    # 8 — proof
    s = blank(prs)
    label(s, "Proof")
    text(s, M, 1.05, 11, 0.6, "It runs, and it is checked.", size=32, bold=True)

    tiles = [
        ("48", "tests", "policy, API, agent, PayPal", GOOD),
        ("9/9", "smoke checks", "against a running server", GOOD),
        ("1", "container", "builds, runs, serves", ACCENT),
        ("CI", "green", "typecheck · test · build", ACCENT),
    ]
    x = M
    for big, small, note, color in tiles:
        rect(s, x, 2.15, 2.72, 2.15, fill=PANEL, line=LINE, radius=0.06)
        text(s, x + 0.3, 2.45, 2.1, 0.8, big, size=40, bold=True, color=color)
        text(s, x + 0.3, 3.35, 2.1, 0.3, small, size=12.5, color=DIM, font=MONO)
        text(s, x + 0.3, 3.72, 2.2, 0.4, note, size=10.5, color=DIM, spacing=1.1)
        x += 2.92

    text(s, M, 4.75, 11.5, 0.4, "No credentials? The whole demo runs in demo mode — and says so on every ledger row.", size=15, color=DIM)
    text(s, M, 5.35, 11.5, 0.4, "npm run dev → propose → evaluate → approve → PayPal capture → ledger", size=13, color=ACCENT, font=MONO)
    text(s, M, 6.1, 11.5, 0.4, "Known limits, written down: no auth, unsigned webhooks, no atomic budget reservation.", size=12.5, color=DIM)
    notes(
        s,
        "Forty eight tests. A smoke script that drives the real flow. A container that builds and runs. Green CI. "
        "And with no credentials at all, the entire demo runs in demo mode, labelled as such on every row.",
    )

    # 9 — close
    s = blank(prs)
    label(s, "Mandate")
    text(s, M, 2.2, 11.6, 1.6, "The model proposes.\nThe code disposes.", size=54, bold=True, spacing=1.1)
    rect(s, M, 4.55, 1.6, 0.03, fill=ACCENT, line=None, shape=MSO_SHAPE.RECTANGLE)
    text(s, M, 4.95, 11, 0.4, "github.com/lgf2111/mandate · MIT · runs in 30 seconds, no credentials", size=15, color=DIM, font=MONO)
    text(s, M, 6.55, 11, 0.3, "PayPal AI Hackathon 2026 · Agentic Commerce", size=11, color=DIM, font=MONO)
    notes(
        s,
        "Mandate. Spending guardrails for AI shopping agents. The repo is public, MIT licensed, and runs in "
        "thirty seconds. The model proposes. The code disposes.",
    )

    return prs


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "docs/media/mandate-deck.pptx"
    presentation = build()
    presentation.save(out)
    print(f"wrote {out} ({len(presentation.slides)} slides)")
