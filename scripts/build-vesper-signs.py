"""Lay out the Vesper municipal wayfinding system (Pillow, offline only)."""
from pathlib import Path
import hashlib
import json

from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
w = 384
cream, ink, red = "#fff0cc", "#191516", "#c9252b"
atlas = Image.new("RGB", (w * 2, w * 2))
labels = [("VESPER",), ("NIGHT", "MARKET"), ("ROOF", "TRANSIT"), ("EAST", "STACK")]

for i, lines in enumerate(labels):
    tile = Image.new("RGB", (w, w), cream)
    draw = ImageDraw.Draw(tile)
    area = draw.rectangle
    polygon = draw.polygon
    # Square lozenge and a single civic pictogram, distinct from race directions.
    area((20, 20, 148, 148), fill=red)
    if i == 0:  # City skyline.
        for x, y in [(38, 84), (62, 52), (86, 69), (110, 40)]:
            area((x, y, x + 18, 123), fill=cream)
    elif i == 1:  # Night market canopy.
        polygon(((36, 80), (57, 51), (111, 51), (132, 80)), fill=cream)
        area((45, 80, 53, 117), fill=cream)
        area((115, 80, 123, 117), fill=cream)
        area((40, 113, 128, 124), fill=cream)
    elif i == 2:  # Rooftop tram.
        draw.rounded_rectangle((47, 46, 120, 112), radius=15, fill=cream)
        area((57, 57, 110, 81), fill=red)
        polygon(((62, 112), (74, 112), (63, 126), (49, 126)), fill=cream)
        polygon(((93, 112), (105, 112), (118, 126), (104, 126)), fill=cream)
    else:  # Vertical building decks.
        for y in (45, 68, 91):
            polygon(((38, y + 14), (84, y), (130, y + 14), (84, y + 30)), fill=cream)
    draw.rectangle((352, 20, 363, 148), fill=ink)
    size = 97 if len(lines) == 1 else 86
    for k, line in enumerate(lines):
        font = ImageFont.truetype(root / "public/fonts/belmondo-circuit-bold.ttf", size)
        x, top, _, _ = font.getbbox(line)
        draw.text((20 - x, (240 if len(lines) == 1 else 178 + k * 88) - top), line, font=font, fill=ink)
    atlas.paste(tile, ((i % 2) * w, (i // 2) * w))

asset = root / "public/art/vesper/municipal-plates.webp"
atlas.save(asset, quality=94, method=6)
asset.with_suffix(".provenance.json").write_text(json.dumps({
    "title": "Vesper municipal plates",
    "source": "Original typography and wayfinding pictograms, scripts/build-vesper-signs.py",
    "labels": [" ".join(lines) for lines in labels],
    "sha256": hashlib.sha256(asset.read_bytes()).hexdigest(),
}, indent=2) + "\n")
