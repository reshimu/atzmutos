import subprocess
import sys
from pathlib import Path

SOURCE_DIR = Path(__file__).resolve().parent.parent / "source uploads"

for f in sorted(SOURCE_DIR.glob("*.pdf")):
    r = subprocess.run(["pdftotext", "-enc", "UTF-8", str(f), "-"], capture_output=True)
    text = r.stdout.decode("utf-8", "replace")
    pages = text.split("\f")
    heb_total = sum(1 for c in text if 'א' <= c <= 'ת')
    eng_total = sum(1 for c in text if c.isascii() and c.isalpha())
    print(f"=== {f.name} === pages={len(pages)} heb_letters={heb_total} eng_letters={eng_total} ratio={heb_total/(eng_total+1):.2f}")
    for i, p in enumerate(pages, 1):
        heb = sum(1 for c in p if 'א' <= c <= 'ת')
        eng = sum(1 for c in p if c.isascii() and c.isalpha())
        marker = "  <-- HEB-HEAVY" if heb > eng else ""
        print(f"  p{i:>3}: heb={heb:>5} eng={eng:>5}{marker}")
