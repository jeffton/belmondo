"""Render the Pierre Belmondo founder campaign (Pillow, offline only)."""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SCALE = 2
W, H = 1024, 422
CREAM, INK, RED = "#fff0cc", "#191516", "#cf2929"
image = Image.new("RGB", (W * SCALE, H * SCALE), CREAM)
draw = ImageDraw.Draw(image)


def line(points, color, width):
    draw.line([(x * SCALE, y * SCALE) for x, y in points], fill=color, width=width * SCALE)


def ellipse(bounds, color, width):
    draw.ellipse(tuple(v * SCALE for v in bounds), outline=color, width=width * SCALE)


def text(position, value, size, color, face="belmondo-circuit-bold.ttf"):
    font = ImageFont.truetype(ROOT / "public/fonts" / face, size * SCALE)
    _, top, _, _ = font.getbbox(value)
    x, y = position
    draw.text((x * SCALE, y * SCALE - top), value, font=font, fill=color)


# An oversized, red orbital slash stays legible even when the globe's
# meridians have collapsed to a handful of pixels.
ellipse((668, 66, 948, 346), INK, 12)
ellipse((736, 66, 880, 346), INK, 7)
line([(808, 69), (808, 343)], INK, 6)
line([(671, 206), (945, 206)], INK, 7)
line([(696, 137), (918, 137)], INK, 6)
line([(696, 275), (918, 275)], INK, 6)
line([(636, 326), (982, 99)], CREAM, 47)
line([(636, 326), (982, 99)], RED, 31)
text((48, 67), "PIERRE", 118, INK)
text((48, 182), "BELMONDO", 107, INK)
line([(51, 310), (118, 310)], RED, 8)
text((48, 333), "ORBITAL RACING DIVISION", 36, INK, "chakra-petch-700.ttf")

output = ROOT / "public/art/pierre-belmondo-billboard.png"
image.resize((W, H), Image.Resampling.LANCZOS).save(output)
provenance = {
    "title": "Pierre Belmondo / Orbital Racing Division",
    "method": "Original geometric and typographic campaign, scripts/build-pierre-billboard.py",
    "fonts": ["Belmondo Circuit Bold", "Chakra Petch Bold"],
    "width": W,
    "height": H,
    "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
}
output.with_suffix(".provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
