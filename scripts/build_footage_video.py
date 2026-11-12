"""Build the ~40 s footage cut of Mandate from the real app capture.

Frame one is the refusal. Every frame is the running app captured by
`mandate_clip.py`; nothing here is a mock-up.

    say ... && python3 mandate_film.py
"""

import math
import subprocess
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "media" / "build"
SOURCE = OUT / "mandate-clip.mp4"
FPS = 30
NARRATION = OUT / "narration.aiff"

# (start in source, length in output, zoom from, zoom to)
# Source beats: 0-1.5 static, 1.5-2.5 cart lands, 2.5-5.5 push in,
# 5.5-7.5 hold, 7.5-10.5 pull out, 10.5-12.5 paid, 12.5+ deny.
PLAN = [
    # (source start, length, zoom from, zoom to). The source is the dev-mode 1920x1080
    # capture with its own header, so 1.00 shows the whole app and the pushes are mild.
    (0.6, 3.2, 1.00, 1.00),   # 0:00 the mandate, header, empty proposal
    (1.7, 2.6, 1.02, 1.10),   # 0:03.2 the goal and Ask the agent
    (2.2, 3.2, 1.06, 1.16),   # 0:05.8 the cart lands
    (4.6, 4.6, 1.14, 1.34),   # 0:09.0 APPROVAL REQUIRED and its reason
    (9.4, 3.0, 1.26, 1.00),   # 0:13.6 release to the whole app
    (10.6, 4.6, 1.00, 1.12),  # 0:16.6 paid, the ledger row
    (1.4, 3.0, 1.10, 1.00),   # 0:21.2 the mandate rows again
    (13.2, 4.6, 1.08, 1.26),  # 0:24.2 DENY
    (15.4, 2.4, 1.22, 1.26),  # 0:28.8 held on Blocked by the mandate
    (8.8, 3.4, 1.36, 1.02),   # 0:31.2 back to the threshold and the app
    (2.4, 3.0, 1.00, 1.04),   # 0:34.6 the mandate
    (12.8, 3.2, 1.04, 1.22),  # 0:37.6 deny again
    (10.8, 3.0, 1.00, 1.06),  # 0:40.8 paid, one ledger row
]

TEXT = (
    "A shopping agent can find the right shoes. It should not be able to decide what "
    "it is allowed to spend. The agent proposes a cart. Code decides, and it refuses: "
    "a hundred and fifteen dollars is above the hundred dollar approval threshold, so "
    "nothing is charged until a human says yes. Budget, cap, merchants, categories, "
    "expiry, threshold: every rule is enforced server side, and the model never gets "
    "the decision. After approval, ask again. Ninety four dollars, with eighty five "
    "left. Denied. No payment path exists for that cart. Mandate: spending guardrails "
    "for AI shopping agents, settled with PayPal."
)


def make_narration():
    subprocess.run(
        ["say", "-v", "Samantha", "-r", "180", "-o", str(NARRATION), TEXT],
        check=True,
    )


def build():
    filters = []
    for index, (src_start, length, zoom_from, zoom_to) in enumerate(PLAN):
        ratio = zoom_to / zoom_from
        filters.append(
            f"[0:v]trim=start={src_start}:duration={length},setpts=PTS-STARTPTS,"
            f"scale=w='iw*{zoom_from:.4f}*(1+t/{length:.4f}*({ratio:.4f}-1))':h=-1:eval=frame,"
            f"crop=1920:1080,setsar=1[v{index}]"
        )
    concat_inputs = "".join(f"[v{i}]" for i in range(len(PLAN)))
    graph = ";".join(filters) + f";{concat_inputs}concat=n={len(PLAN)}:v=1:a=0[v]"
    total = sum(seg[1] for seg in PLAN)

    script = OUT / "film.filter"
    script.write_text(graph)

    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", str(SOURCE), "-i", str(NARRATION),
            "-filter_complex", script.read_text(),
            "-map", "[v]", "-map", "1:a",
            "-af", f"adelay=1200|1200,apad,atrim=0:{total},afade=t=out:st={total - 1.0}:d=1.0",
            "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k",
            "-shortest",
            str(OUT / "mandate-film.mp4"),
        ],
        check=True,
    )
    print("total", total, "wrote", OUT / "mandate-film.mp4")


if __name__ == "__main__":
    make_narration()
    build()
