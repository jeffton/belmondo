"""Render the original Pierre Belmondo sponsor campaign (Pillow, offline only)."""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SCALE = 2
image = Image.new("RGB", (1024 * SCALE, 384 * SCALE), "#071325")
draw = ImageDraw.Draw(image)


def line(points, color, width):
    draw.line([(x * SCALE, y * SCALE) for x, y in points], fill=color, width=width * SCALE)


def polygon(points, color):
    draw.polygon([(x * SCALE, y * SCALE) for x, y in points], fill=color)


def ellipse(bounds, color, width):
    draw.ellipse(tuple(v * SCALE for v in bounds), outline=color, width=width * SCALE)


def text(position, value, size, color):
    font = ImageFont.truetype("/usr/share/fonts/liberation/LiberationSans-BoldItalic.ttf", size * SCALE)
    draw.text(tuple(v * SCALE for v in position), value, font=font, fill=color, stroke_width=0)


# Broad diagonal fields remain legible in the original game's low-res output.
polygon([(0, 0), (342, 0), (228, 384), (0, 384)], "#0b3357")
polygon([(298, 0), (343, 0), (229, 384), (184, 384)], "#ed087d")
line([(330, 34), (990, 34)], "#24edee", 7)
line([(270, 345), (940, 345), (1003, 280)], "#ed087d", 10)
for x in [923, 953, 983]:
    polygon([(x, 49), (x + 20, 49), (x - 5, 83), (x - 25, 83)], "#24edee")

# Orbital emblem echoes the founder identity without stretching the old strip.
ellipse((49, 96, 233, 280), "#ffedb0", 7)
ellipse((97, 96, 185, 280), "#ffedb0", 4)
line([(51, 188), (232, 188)], "#ffedb0", 4)
line([(64, 141), (218, 141)], "#ffedb0", 4)
line([(64, 235), (218, 235)], "#ffedb0", 4)
line([(141, 99), (141, 278)], "#ffedb0", 4)
# Tilted orbital slash, readable as a strong graphic even several hundred metres away.
line([(25, 260), (253, 124)], "#ed087d", 22)
line([(30, 251), (249, 120)], "#24edee", 5)
text((342, 85), "PIERRE", 91, "#ffedb0")
text((294, 171), "BELMONDO", 101, "#ffedb0")
text((326, 292), "ORBITAL / RACING DIVISION", 25, "#24edee")

output = ROOT / "public/art/pierre-belmondo-billboard.png"
image.resize((1024, 384), Image.Resampling.LANCZOS).save(output)
provenance = {
    "title": "Pierre Belmondo / Orbital Racing Division",
    "method": "Original geometric and typographic campaign, scripts/build-pierre-billboard.py",
    "font": "Liberation Sans Bold Italic (SIL Open Font License)",
    "width": 1024,
    "height": 384,
    "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
}
output.with_suffix(".provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
