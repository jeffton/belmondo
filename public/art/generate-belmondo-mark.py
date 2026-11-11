"""Render the BELMONDO livery wordmark and favicon from the self-hosted font."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
FONT = ROOT.parent / "fonts" / "font-1.ttf"


def lettering(text, size, padding, background, foreground):
    font = ImageFont.truetype(str(FONT), size)
    left, top, right, bottom = font.getbbox(text)
    image = Image.new("RGB", (right - left + padding * 2, bottom - top + padding * 2), background)
    draw = ImageDraw.Draw(image)
    draw.text((padding - left, padding - top), text, font=font, fill=foreground)
    return image


mark = lettering("BELMONDO", 88, 12, "#111b25", "#e8ebe1")
ImageDraw.Draw(mark).rectangle((12, mark.height - 5, mark.width - 12, mark.height - 3), fill="#ff6a20")
mark.save(ROOT / "belmondo-mark.png", optimize=True)
icon = Image.new("RGB", (64, 64), "#111b25")
letter = lettering("B", 52, 0, "#111b25", "#e8ebe1")
icon.paste(letter, ((64 - letter.width) // 2 - 3, (64 - letter.height) // 2 - 2))
ImageDraw.Draw(icon).rectangle((12, 54, 52, 57), fill="#ff6a20")
icon.save(ROOT / "belmondo-icon.png", optimize=True)
print("Wrote belmondo-mark.png and belmondo-icon.png")
