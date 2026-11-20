#!/usr/bin/env python3
"""Lay out waterfront tenant plaques from the original illustration contact sheet."""
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
source = Image.open(sys.argv[1]).convert("RGB")
display = root / "public/fonts/belmondo-circuit-bold.ttf"
cream, black = "#fff0cc", "#171314"
campaigns = [(5, "SQUID SEAL"), (2, "COLD START"), (6, "MASS AWAY"), (0, "RING TRANSIT")]


def text(draw, label, x, y, available, start_size, path, color):
    for size in range(start_size, 7, -1):
        font = ImageFont.truetype(path, size)
        _, top, right, _ = font.getbbox(label)
        if right <= available:
            draw.text((x, y - top), label, font=font, fill=color)
            return
    raise ValueError(label)


# Small waterfront tenant plaques use their own square layouts, not squashed ads.
size = 256
tenants = Image.new("RGB", (size * 2, size * 2))
for i, (n, label) in enumerate(campaigns):
    x, y = n % 2, n // 2
    sw, sh = source.size
    crop = source.crop(
        (int((x + 0.33) * sw / 2), y * sh // 4 + 3, (x + 1) * sw // 2 - 3, (y + 1) * sh // 4 - 3)
    )
    plaque = Image.new("RGB", (size, size), cream)
    crop = crop.resize((size, 194), Image.Resampling.LANCZOS)
    plaque.paste(crop, (0, 0))
    text(ImageDraw.Draw(plaque), label, 13, 207, 230, 32, display, black)
    tenants.paste(plaque, ((i % 2) * size, (i // 2) * size))

tenants.save(root / "public/art/kaiseki-tenant-plaques.webp", quality=90, method=6)
