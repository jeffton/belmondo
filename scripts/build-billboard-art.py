#!/usr/bin/env python3
"""Lay out the BELMONDO sponsor atlas from its original Image contact sheet."""
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
source = Image.open(sys.argv[1]).convert("RGB")
fonts = root / "public/fonts"
display = fonts / "belmondo-circuit-bold.ttf"
caption = fonts / "chakra-petch-700.ttf"
w, h = 512, 211
cream, black, red = "#fff0cc", "#171314", "#c91f25"
campaigns = [
    ("RING", "TRANSIT", "THE LONG WAY ROUND", black, red, 0.43),
    ("DAY", "RENTAL", "SUN BY THE HOUR", cream, "#ffbc31", 0.47),
    ("COLD", "START", "CRYOGENIC SOFT SERVE", "#00236b", "#00236b", 0.50),
    ("ODD", "COVER", "INSURE YOUR SKY", "#231050", "#4826a0", 0.49),
    ("DREAM", "TAPE", "WAKE UP ON REPLAY", cream, "#ffa6d8", 0.34),
    ("SQUID", "SEAL", "PATCH DEEP", cream, cream, 0.42),
    ("MASS", "AWAY", "WE SHIP WEIGHTLESS", black, red, 0.36),
    ("MOON", "CAST", "THE FAR SIDE IS LIVE", black, black, 0.37),
]


def text(draw, label, x, y, available, start_size, path, color):
    for size in range(start_size, 7, -1):
        font = ImageFont.truetype(path, size)
        _, top, right, _ = font.getbbox(label)
        if right <= available:
            draw.text((x, y - top), label, font=font, fill=color)
            return
    raise ValueError(label)


atlas = Image.new("RGB", (w * 2, h * 4))
for n, (first, second, slogan, ink, accent, area) in enumerate(campaigns):
    x, y = n % 2, n // 2
    sw, sh = source.size
    crop = source.crop(
        (x * sw // 2 + 3, y * sh // 4 + 3, (x + 1) * sw // 2 - 3, (y + 1) * sh // 4 - 3)
    ).resize((w, h), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(crop)
    start, end = 20, int(w * area)
    text(draw, first, start, 33, end - start, 57, display, ink)
    text(draw, second, start, 91, end - start, 57, display, ink)
    draw.rectangle((start, 154, start + 37, 158), fill=accent)
    text(draw, slogan, start, 168, end - start, 18, caption, ink)
    atlas.paste(crop, (x * w, y * h))

atlas.save(root / "public/art/roadside-campaigns.webp", quality=91, method=6)

# Small waterfront tenant plaques use their own square layouts, not squashed ads.
size = 256
tenants = Image.new("RGB", (size * 2, size * 2))
for i, n in enumerate([5, 2, 6, 0]):
    x, y = n % 2, n // 2
    sw, sh = source.size
    crop = source.crop(
        (int((x + 0.33) * sw / 2), y * sh // 4 + 3, (x + 1) * sw // 2 - 3, (y + 1) * sh // 4 - 3)
    )
    first, second, *_ = campaigns[n]
    plaque = Image.new("RGB", (size, size), cream)
    crop = crop.resize((size, 194), Image.Resampling.LANCZOS)
    plaque.paste(crop, (0, 0))
    text(ImageDraw.Draw(plaque), first + " " + second, 13, 207, 230, 32, display, black)
    tenants.paste(plaque, ((i % 2) * size, (i // 2) * size))

tenants.save(root / "public/art/kaiseki-tenant-plaques.webp", quality=90, method=6)
