"""One-time conversion: woff2 -> ttf via fontTools. Run once; cached ttf files are committed."""
from pathlib import Path
from fontTools.ttLib import TTFont

RAW = Path(__file__).parent / "raw"
OUT = Path(__file__).parent

for woff2_path in sorted(RAW.glob("*.woff2")):
    ttf_path = OUT / (woff2_path.stem + ".ttf")
    font = TTFont(woff2_path)
    font.flavor = None
    font.save(ttf_path)
    print(f"{woff2_path.name} -> {ttf_path.name} ({ttf_path.stat().st_size} bytes)")
