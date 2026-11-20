#!/usr/bin/env python3
"""Paint the eight course-local roadside campaigns in the 512 × 211 face format."""
from hashlib import sha256
import json
from math import cos, pi, sin
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/art/course-billboards'
FONTS = ROOT / 'public/fonts'
CREAM = '#fff0cc'
W, H = 512, 211
S = 3

# Each local sponsor gets three executions of the same visual identity. Keep the
# huge product words and pictograms dominant: these are seen through a race camera.
CAMPAIGNS = {
    'palm-breaker': ('float', 'MIRAGE  FM', ('COAST', 'POOL', 'AFTER'),
                     ('DRIVE', 'SIDE', 'HOURS'), ('#47174f', '#ffc273', '#f66989', '#71f7de')),
    'monsoon': ('stencil', 'RAINWORKS', ('RAIN', 'TIDE', 'LOCK'),
                ('BANK', 'SHIFT', 'STEP'), ('#092f38', '#a4f3ce', '#28adb6', '#e6f68a')),
    'whiteout': ('survey', 'AURORA  INSTRUMENTS', ('POLAR', 'ICE', 'WHITE'),
                 ('OPTICS', 'SCOPE', 'LIGHT'), ('#dbefff', '#112c52', '#83b6e4', '#f05236')),
    'solar-array': ('signal', 'DAYSTAR  GRID', ('SUN', 'BEAM', 'AFTER'),
                    ('TAP', 'BANK', 'SUN'), ('#f7ae37', '#381a24', '#cf4830', '#fff4a7')),
    'faultline': ('works', 'BENCH  WORKS', ('CUT', 'CORE', 'RE'),
                  ('LINE', 'DRILL', 'GRADE'), ('#372f28', '#f6dc91', '#bd742f', '#fbac34')),
    'cinderline': ('thermal', 'CALDERA  LAB', ('HEAT', 'ASH', 'MAGMA'),
                   ('SHIELD', 'CAST', 'SEAL'), ('#281522', '#ffdfb7', '#ec4536', '#ffa54a')),
    'noctilucent': ('manifest', 'NIGHT  FREIGHT', ('NIGHT', 'DARK', 'LAST'),
                    ('MAIL', 'CARGO', 'HAUL'), ('#101a38', '#f6d399', '#343f79', '#fa7b6c')),
    'vesper-circuit': ('tower', 'LUCENT  MEDIA', ('CITY', 'DREAM', 'SKY'),
                       ('SIGNAL', 'TAPE', 'LINE'), ('#271635', '#f9f08a', '#ca4f98', '#6bf2e4')),
}


def scaled(points):
    return [tuple(round(v * S) for v in point) for point in points]


def polygon(draw, points, color):
    draw.polygon(scaled(points), fill=color)


def line(draw, points, color, width=1):
    draw.line(scaled(points), fill=color, width=round(width * S), joint='curve')


def oval(draw, box, color, width=0):
    box = tuple(round(v * S) for v in box)
    if width:
        draw.ellipse(box, outline=color, width=round(width * S))
    else:
        draw.ellipse(box, fill=color)


def rect(draw, box, color):
    draw.rectangle(tuple(round(v * S) for v in box), fill=color)


def text(draw, label, x, y, space, size, color, display=True, right=False):
    font_path = FONTS / ('belmondo-circuit-bold.ttf' if display else 'chakra-petch-700.ttf')
    font = ImageFont.truetype(font_path, size * S)
    while font.getlength(label) > space * S:
        size -= 1
        font = ImageFont.truetype(font_path, size * S)
    draw.text((x * S, y * S), label, font=font, fill=color,
              anchor='rt' if right else 'lt')


def float_art(d, n, bg, fg, mid, hot):
    # Florida postcard: striped setting sun behind broadcast/surf waves.
    polygon(d, [(251, 0), (512, 0), (512, 211), (211, 211)], mid)
    oval(d, (320 - 14*n, 21, 472 - 14*n, 173), fg)
    for y in (113, 127, 144, 162):
        rect(d, (282, y, 488, y + 5), mid)
    for i in range(5):
        y = 130 + 15 * i
        line(d, [(x, y + 14*sin(x / 32 + n / 2)) for x in range(238, 520, 4)], hot, 4)
    x = 432 + 14*n
    line(d, [(x, 199), (x-21, 131), (x-28, 76)], bg, 8)
    for direction in (-1, 1):
        for height in (0, 17, 33):
            cx, cy = x-28, 76
            polygon(d, [(cx, cy), (cx+direction*26, cy-29+height),
                        (cx+direction*65, cy-14+height),
                        (cx+direction*27, cy-17+height)], bg)


def stencil_art(d, n, bg, fg, mid, hot):
    # Hydraulic flow diagrams on an enameled pump-house plate.
    polygon(d, [(293, 0), (512, 0), (512, 211), (345, 211)], mid)
    for i in range(3):
        x = 322 + i * 53
        y = 46 + ((i + n) % 3) * 22
        line(d, [(x, 211), (x, y + 37), (x + 46, y), (520, y)], bg, 19)
        line(d, [(x, 211), (x, y + 37), (x + 46, y), (520, y)], hot, 4)
        oval(d, (x - 14, y + 23, x + 14, y + 51), fg, 3)


def survey_art(d, n, bg, fg, mid, hot):
    # Research station optical target, on bright frost-proof enamel.
    rect(d, (0, 0, 242, 211), fg)
    x, y = 117 + (n - 1)*13, 99
    for r in (31, 59, 83):
        oval(d, (x-r, y-r, x+r, y+r), mid, 2)
    polygon(d, [(20, 168), (81, 116), (107, 139), (160, 78), (221, 168)], bg)
    line(d, [(10, y), (227, y)], hot, 3)
    line(d, [(x, 13), (x, 188)], hot, 3)
    oval(d, (x-8, y-8, x+8, y+8), hot)


def signal_art(d, n, bg, fg, mid, hot):
    # Bold deployment diagrams inspired by printed solar collector manuals.
    rect(d, (272, 0, 512, 211), mid)
    x, y = 395, 107
    for i in range(12):
        a = (i + n / 3) * pi / 6
        line(d, [(x+62*cos(a), y+62*sin(a)), (x+99*cos(a), y+99*sin(a))], hot, 5)
    oval(d, (x-51, y-51, x+51, y+51), hot)
    polygon(d, [(x-7, y-38), (x+23, y-38), (x+4, y-4), (x+28, y-4),
                (x-26, y+42), (x-12, y+7), (x-31, y+7)], fg)


def works_art(d, n, bg, fg, mid, hot):
    # Quarry benches, drill target and heavy equipment stripes.
    rect(d, (0, 0, 227, 211), fg)
    for i in range(4):
        x, y = 208-i*25, 62+i*25
        line(d, [(x, -1), (x, y), (x-26, y), (x-26, y+28), (0, y+28)], mid, 7)
    x = 72 + n*28
    line(d, [(x, 0), (x, 91), (x+40, 129), (x+40, 177)], bg, 13)
    polygon(d, [(x+22, 166), (x+57, 166), (x+40, 191)], bg)
    for i in range(7):
        a = i*32
        polygon(d, [(a, 194), (a+15, 194), (a+4, 211), (a-11, 211)], hot)


def thermal_art(d, n, bg, fg, mid, hot):
    # Heat-map isotherms wrap a shifting volcanic vent in safety-orange ink.
    polygon(d, [(292, 0), (512, 0), (512, 211), (235, 211)], mid)
    angles = [i * 2*pi / 72 for i in range(73)]
    for r in range(17, 122, 13):
        ring = []
        for a in angles:
            wave = 0.83 + 0.14*sin(3*a + n) + 0.09*cos(5*a)
            ring.append((391 + r*wave*cos(a), 106 + r*wave*sin(a)))
        line(d, ring, hot if r < 75 else bg, 3)
    oval(d, (379, 94, 403, 118), fg)


def manifest_art(d, n, bg, fg, mid, hot):
    # Intermodal box trailers and precise cargo-label chevrons, not neon wash.
    rect(d, (286, 0, 512, 211), mid)
    for i in range(3):
        x, y = 308 + i*47, 43 + i*25 - n*5
        polygon(d, [(x, y+21), (x+32, y), (x+72, y+24), (x+72, y+74),
                    (x+41, y+95), (x, y+69)], fg if i == n else hot)
        line(d, [(x, y+21), (x+41, y+46), (x+72, y+24)], bg, 5)
        line(d, [(x+41, y+46), (x+41, y+95)], bg, 5)
    for i in range(11):
        x = 323 + 14*i
        rect(d, (x, 185, x+3+(i % 3), 195), fg)


def tower_art(d, n, bg, fg, mid, hot):
    # Staggered vertical media towers and CRT signal bands.
    rect(d, (0, 0, 230, 211), hot)
    for i in range(5):
        x = 18 + i*40
        y = 32 + ((i+2*n) % 5)*19
        polygon(d, [(x, 211), (x, y+14), (x+35, y), (x+35, 211)], bg)
        for j in range(4):
            rect(d, (x+5, y+31+j*17, x+29, y+34+j*17), mid if j % 2 else fg)
    line(d, [(8, 74), (54, 74), (75, 43), (113, 115), (144, 58), (205, 58)], fg, 5)


ART = {'float': float_art, 'stencil': stencil_art, 'survey': survey_art,
       'signal': signal_art, 'works': works_art, 'thermal': thermal_art,
       'manifest': manifest_art, 'tower': tower_art}


# Secondary print runs use contrasting stock while keeping the same sponsor.
ALTERNATE = {
    'float': (1, ('#28666a', '#fff0cc', '#71e9d2', '#f97191')),
    'stencil': (2, ('#d5ecab', '#163842', '#4ea396', '#142e44')),
    'survey': (1, ('#142b51', '#dbefff', '#729bc6', '#ff886c')),
    'signal': (2, ('#ffdc76', '#451d2b', '#809f59', '#fff4a7')),
    'works': (1, ('#db9a53', '#2c271f', '#f7daa0', '#4a372c')),
    'thermal': (2, ('#fcad65', '#30132b', '#c63445', '#ffd59d')),
    'manifest': (1, ('#33305c', '#fff2c5', '#201a38', '#ff9284')),
    'tower': (1, ('#711957', '#fff1a8', '#ca4f98', '#f183c4')),
}


def face(style, sponsor, first, second, palette, variant):
    bg, fg, mid, hot = palette
    image = Image.new('RGB', (W*S, H*S), bg)
    d = ImageDraw.Draw(image)
    ART[style](d, variant, bg, fg, mid, hot)
    right = style in ('survey', 'works', 'tower')
    x = 489 if right else 23
    if style == 'signal':
        rect(d, (0, 0, 271, 31), fg)
        text(d, sponsor, x, 8, 222, 16, bg, False)
    else:
        text(d, sponsor, x, 20, 224, 16, fg, False, right)
    text(d, first, x, 52, 226, 69, fg, right=right)
    text(d, second, x, 115, 226, 69, fg, right=right)
    # An inset serial band makes the art read as printed stock even from the side.
    start = (x - 47) if right else x
    rect(d, (start, 186, start + 47, 191), hot if style != 'signal' else mid)
    return image.resize((W, H), Image.Resampling.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    outputs = {}
    for slug, (style, sponsor, first, second, palette) in CAMPAIGNS.items():
        atlas = Image.new('RGB', (W, H * 3))
        for n in range(3):
            alternate_index, alternate = ALTERNATE[style]
            colors = alternate if n == alternate_index else palette
            atlas.paste(face(style, sponsor, first[n], second[n], colors, n), (0, H * n))
        path = OUT / f'{slug}.webp'
        atlas.save(path, quality=92, method=6)
        outputs[path.name] = sha256(path.read_bytes()).hexdigest()
    manifest = {'source': 'scripts/build-course-billboards.py', 'outputs': outputs}
    (OUT / 'provenance.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
