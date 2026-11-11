"""Bake the hero craft's UV atlas. Requires Pillow and generate-belmondo-mark.py output."""
from pathlib import Path
from random import Random
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
rng = Random(29)
atlas = Image.new("RGB", (1024, 512), "#e2e5df")
font = ImageFont.truetype("/usr/share/fonts/liberation/LiberationSans-Regular.ttf", 13)
small = ImageFont.truetype("/usr/share/fonts/liberation/LiberationSans-Regular.ttf", 9)

for index in range(8):
    tile = Image.new("RGB", (256, 256))
    pixels = tile.load()
    base = [(222, 226, 219), (222, 226, 219), (65, 76, 84), (23, 34, 43),
            (15, 35, 48), (113, 125, 131), (220, 226, 217), (40, 51, 61)][index]
    for y in range(256):
        for x in range(256):
            edge = min(x, 255-x)
            shade = -int(max(0, 24-edge)*0.65) + rng.choice([-1, 0, 0, 0, 1])
            pixels[x, y] = tuple(max(0, min(255, c+shade)) for c in base)
    d = ImageDraw.Draw(tile)
    if index in (0, 1, 6):
        # Bevel-edge ink and long, intentionally placed access panels.
        for x in (14, 241):
            d.line((x, 0, x, 256), fill="#73818a", width=1)
            d.line((x+2, 0, x+2, 256), fill="#f8faf1", width=1)
        for y in (58, 170, 230):
            d.line((14, y, 241, y), fill="#8d9899", width=1)
            d.line((15, y+1, 240, y+1), fill="#faf9ee", width=1)
        for x in (22, 232):
            for y in (64, 164, 224):
                d.rectangle((x, y, x+2, y+2), fill="#4c5d66")
        if index == 0:
            # Same self-hosted typographic identity as the start screen.
            mark = Image.open(ROOT / "belmondo-mark.png").convert("RGB")
            mark.thumbnail((196, 26), Image.Resampling.LANCZOS)
            d.rectangle((25, 185, 231, 222), fill="#111b25")
            tile.paste(mark, ((256-mark.width)//2, 191))
            d.text((93, 232), "B / 07", fill="#35434b", font=small)
            d.polygon([(115, 8), (141, 8), (141, 86), (128, 99), (115, 86)], fill="#f04a35")
        elif index == 1:
            d.polygon([(90, 0), (180, 0), (156, 256), (66, 256)], fill="#fafaf0")
            d.polygon([(90, 0), (98, 0), (74, 256), (66, 256)], fill="#293842")
            d.text((102, 170), "07", fill="#172730", font=font)
            for y in range(207, 231, 5):
                d.rectangle((179, y, 226, y+2), fill="#3c4a51")
        else:
            d.text((57, 117), "BELMONDO", fill="#293e48", font=font)
            for y in range(174, 230, 7):
                d.rectangle((45, y, 211, y+3), fill="#283a44")
    elif index in (2, 3, 7):
        for y in range(10, 252, 17):
            d.line((12, y, 244, y), fill="#0e1b25", width=3)
            d.line((12, y+3, 244, y+3), fill="#607078", width=1)
        for x in (10, 245):
            d.line((x, 0, x, 256), fill="#879a9e", width=2)
    elif index == 4:
        for y in range(256):
            c = int(18+34*(1-y/256))
            d.line((0, y, 256, y), fill=(c//2, c+14, c+26))
        d.polygon([(22, 0), (37, 0), (208, 256), (194, 256)], fill="#4c7589")
        d.polygon([(44, 0), (49, 0), (220, 256), (215, 256)], fill="#8db8c4")
        d.rectangle((0, 0, 255, 255), outline="#0b1a25", width=8)
    else:
        for y in range(20, 246, 23):
            d.line((0, y, 256, y), fill="#354550", width=2)
            d.line((0, y+2, 256, y+2), fill="#b4bec0", width=1)
    # Sparse edge chips, not procedural camouflage.
    for _ in range(28):
        x = rng.choice([rng.randrange(12, 19), rng.randrange(237, 244)])
        y = rng.randrange(256)
        d.line((x, y, x+rng.randrange(1, 4), y), fill="#68787e", width=1)
    atlas.paste(tile, ((index % 4)*256, (index//4)*256))

atlas.save(ROOT / "craft-livery.png", optimize=True)
exhaust = Image.new("RGBA", (64, 128))
for y in range(128):
    for x in range(64):
        width = 1-y/128
        across = abs((x-31.5)/31.5)
        alpha = max(0, 1-across/max(0.02, width)) * (1-y/128)**0.6
        exhaust.putpixel((x, y), (100+int(155*alpha), 232+int(23*alpha), 255, int(alpha*220)))
exhaust.save(ROOT / "craft-exhaust.png", optimize=True)
print("Wrote craft-livery.png and craft-exhaust.png")
