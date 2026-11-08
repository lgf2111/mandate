import sys
from pathlib import Path

import pypdfium2 as pdfium

pdf_path = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/media/render.pdf")
out_dir = Path(sys.argv[2] if len(sys.argv) > 2 else "docs/media/slides")
out_dir.mkdir(parents=True, exist_ok=True)

pdf = pdfium.PdfDocument(str(pdf_path))
for index, page in enumerate(pdf, start=1):
    image = page.render(scale=2.0).to_pil()  # 13.333in * 2 = ~1920px wide
    target = out_dir / f"slide-{index:02d}.png"
    image.save(target)
    print(target, image.size)
