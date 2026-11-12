"""Capture the running app for the pitch video: 1920x1080, scripted clicks.

Needs a server (PORT=8787, demo mode) and the dev web server on 5173. Run it inside
mcr.microsoft.com/playwright/python with --network host; the PNG frames land in /out
and ffmpeg makes the clip.

Standard library + ffmpeg only: the Playwright container must stay untouched. The
page is stepped through a scripted list of scroll positions and zoom levels, and a
frame is screenshotted after every step; ffmpeg assembles the PNGs into an MP4.

    python3 mandate_clip.py                 # writes /out/mandate-clip.mp4
"""

import json
import math
import subprocess
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

APP = "http://127.0.0.1:5173"
API = "http://127.0.0.1:8787"
OUT = Path("/out")
FRAMES = OUT / "frames"
FPS = 30
W, H = 1920, 1080


def api(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        API + path, data=data, method=method, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read() or b"{}")


def ease(t):
    return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, t)))


def zoom_transform(page, level):
    """Scale the whole document about the top-left, keeping the layout width."""
    page.evaluate(
        """(z) => {
            const b = document.body;
            b.style.transformOrigin = '0 0';
            b.style.transform = `scale(${z})`;
            b.style.width = (100 / z) + '%';
        }""",
        level,
    )


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

        def grab(count, dx=0.0):
            nonlocal shots
            for _ in range(count):
                page.screenshot(path=str(FRAMES / f"f{shots:05d}.png"))
                shots += 1
                if dx:
                    page.mouse.wheel(0, dx)

        # 1. The app at rest: the mandate on the left, nothing proposed yet.
        grab(45)

        # 2. Ask the agent; the $115 cart lands in approval-required.
        page.get_by_role("button", name="Ask the agent").click()
        page.get_by_text("Approve and pay", exact=False).first.wait_for(timeout=30_000)
        grab(30)

        # 3. Push in on the decision card and hold.
        for step in range(60):
            zoom_transform(page, 1.0 + 0.55 * ease(step / 59))
            page.wait_for_timeout(16)
            grab(1)
        grab(60)

        # 4. Pull back out, then approve and pay.
        for step in range(30):
            zoom_transform(page, 1.55 - 0.55 * ease(step / 29))
            page.wait_for_timeout(16)
            grab(1)
        grab(15)

        page.get_by_role("button", name="Approve and pay").click()
        page.get_by_text("Paid $115.00", exact=False).first.wait_for(timeout=30_000)
        grab(60)

        # 5. Same goal again: the budget refuses the second cart.
        page.get_by_role("button", name="Ask the agent").click()
        page.get_by_text("Blocked by the mandate", exact=False).first.wait_for(timeout=30_000)
        grab(45)
        for step in range(45):
            zoom_transform(page, 1.0 + 0.45 * ease(step / 44))
            page.wait_for_timeout(16)
            grab(1)
        grab(75)

        browser.close()

    print("frames:", shots)
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-framerate", str(FPS),
            "-i", str(FRAMES / "f%05d.png"),
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-pix_fmt", "yuv420p", "-r", str(FPS),
            "-vf", "scale=1920:1080",
            str(OUT / "mandate-clip.mp4"),
        ],
        check=True,
    )
    print("wrote", OUT / "mandate-clip.mp4")


if __name__ == "__main__":
    main()
