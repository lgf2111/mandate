"""Capture the running app for the pitch video: scripted clicks, one frame at a time.

Needs the API on 8787 in demo mode and the dev web server on 5173. Run it inside
mcr.microsoft.com/playwright/python with --network host; PNG frames land in /out and
ffmpeg assembles them on the host, because the image ships no ffmpeg:

    python3 capture_app.py
    ffmpeg -framerate 30 -i /out/frames/f%05d.png -c:v libx264 -crf 16 mandate-clip.mp4

Nothing is cropped or zoomed here: framing is the film's job, so every frame is the
whole 1440x900 viewport at 100%, which is what a person actually sees.
"""

import json
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

APP = "http://127.0.0.1:5173"
API = "http://127.0.0.1:8787"
OUT = Path("/out")
FRAMES = OUT / "frames"
FPS = 30
W, H = 1440, 900


def api(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        API + path, data=data, method=method, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read() or b"{}")


def main():
    api("/api/reset", "POST", {})
    if FRAMES.exists():
        for old in FRAMES.glob("*.png"):
            old.unlink()
    FRAMES.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
        page.goto(APP + "/", wait_until="networkidle")
        page.wait_for_timeout(1200)
        shots = 0

        def grab(count):
            nonlocal shots
            for _ in range(count):
                # Clicking scrolls the page; every frame is shot from the top so the
                # header, the card headers and their stamps are all in view.
                page.evaluate("window.scrollTo(0, 0)")
                page.wait_for_timeout(34)
                page.screenshot(path=str(FRAMES / f"f{shots:05d}.png"))
                shots += 1

        def click(name, timeout=45_000):
            page.get_by_role("button", name=name, exact=False).first.click(timeout=timeout)

        def wait_text(text, timeout=60_000):
            page.get_by_text(text, exact=False).first.wait_for(timeout=timeout)

        # 1. At rest: one question, no proposal.
        grab(45)

        # 2. Type the goal; the app drafts the limits from it.
        page.fill("#goal-input", "")
        page.type("#goal-input", "trail running shoes under the cap", delay=18)
        grab(30)
        click("Draft the limits")
        wait_text("Use these limits")
        grab(75)

        # 3. One approval, then the agent's cart lands exactly on the threshold.
        click("Use these limits")
        page.wait_for_timeout(600)
        grab(30)
        click("Ask the agent")
        wait_text("APPROVAL REQUIRED")
        grab(105)

        # 4. Pay in demo mode; the ledger takes the row.
        click("Approve and pay")
        wait_text("Paid $")
        grab(85)
        grab(30)

        # 5. Same goal, second cart: the budget refuses it.
        click("Ask the agent")
        wait_text("Blocked by the mandate")
        grab(120)

        browser.close()

    print("frames:", shots)
    print(f"now run: ffmpeg -framerate {FPS} -i {FRAMES}/f%05d.png -c:v libx264 -crf 16 mandate-clip.mp4")


if __name__ == "__main__":
    main()
