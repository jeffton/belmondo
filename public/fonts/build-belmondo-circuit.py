#!/usr/bin/env python3
"""Build BELMONDO Circuit: original route-stroke display lettering.

Licensed under SIL OFL 1.1; see belmondo-circuit-OFL.txt.
Requires FontTools. No source font or third-party glyph outlines are used.
Coordinates are original, authored on a 600 x 700 cap grid. Thick route
segments meet at chamfered junctions; a fixed forward rake belongs to the
outlines, not a CSS italic simulation. Edit GLYPHS to change the design.
"""

from math import cos, hypot, pi, sin
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = Path(__file__).resolve().parent
STROKE = 146
RAKE = 0.075
CONDENSE = 0.78

# Each entry is (advance before condensation, route polylines).
GLYPHS = {
    "A": (
        650,
        [
            [(75, 0), (75, 510), (220, 700), (390, 700), (525, 510), (525, 0)],
            [(75, 280), (525, 280)],
        ],
    ),
    "B": (
        650,
        [
            [
                (75, 0),
                (75, 700),
                (410, 700),
                (525, 600),
                (525, 445),
                (410, 355),
                (75, 355),
            ],
            [(410, 355), (535, 260), (535, 100), (420, 0), (75, 0)],
        ],
    ),
    "C": (
        630,
        [
            [
                (520, 590),
                (420, 700),
                (180, 700),
                (75, 590),
                (75, 110),
                (180, 0),
                (430, 0),
                (520, 100),
            ]
        ],
    ),
    "D": (
        650,
        [[(75, 0), (75, 700), (390, 700), (530, 550), (530, 150), (390, 0), (75, 0)]],
    ),
    "E": (600, [[(505, 700), (75, 700), (75, 0), (505, 0)], [(75, 355), (405, 355)]]),
    "F": (590, [[(75, 0), (75, 700), (505, 700)], [(75, 355), (405, 355)]]),
    "G": (
        650,
        [
            [
                (520, 590),
                (420, 700),
                (180, 700),
                (75, 590),
                (75, 110),
                (180, 0),
                (525, 0),
                (525, 325),
                (335, 325),
            ]
        ],
    ),
    "H": (650, [[(75, 0), (75, 700)], [(525, 0), (525, 700)], [(75, 355), (525, 355)]]),
    "I": (300, [[(125, 0), (125, 700)]]),
    "J": (570, [[(465, 700), (465, 120), (355, 0), (165, 0), (75, 100), (75, 205)]]),
    "K": (650, [[(75, 0), (75, 700)], [(520, 700), (75, 300)], [(255, 465), (530, 0)]]),
    "L": (580, [[(75, 700), (75, 0), (495, 0)]]),
    "M": (750, [[(75, 0), (75, 700), (325, 350), (640, 700), (640, 0)]]),
    "N": (680, [[(75, 0), (75, 700), (550, 0), (550, 700)]]),
    "O": (
        650,
        [
            [
                (180, 0),
                (75, 110),
                (75, 590),
                (180, 700),
                (420, 700),
                (530, 590),
                (530, 110),
                (420, 0),
                (180, 0),
            ]
        ],
    ),
    "P": (
        630,
        [
            [
                (75, 0),
                (75, 700),
                (410, 700),
                (520, 590),
                (520, 440),
                (410, 335),
                (75, 335),
            ]
        ],
    ),
    "Q": (
        680,
        [
            [
                (180, 0),
                (75, 110),
                (75, 590),
                (180, 700),
                (420, 700),
                (530, 590),
                (530, 110),
                (420, 0),
                (180, 0),
            ],
            [(330, 200), (570, -70)],
        ],
    ),
    "R": (
        650,
        [
            [
                (75, 0),
                (75, 700),
                (410, 700),
                (520, 590),
                (520, 440),
                (410, 335),
                (75, 335),
            ],
            [(320, 335), (535, 0)],
        ],
    ),
    "S": (
        630,
        [
            [
                (520, 600),
                (425, 700),
                (180, 700),
                (75, 590),
                (75, 465),
                (170, 355),
                (425, 355),
                (525, 245),
                (525, 110),
                (420, 0),
                (180, 0),
                (75, 100),
            ]
        ],
    ),
    "T": (610, [[(45, 700), (525, 700)], [(285, 700), (285, 0)]]),
    "U": (650, [[(75, 700), (75, 110), (185, 0), (420, 0), (530, 110), (530, 700)]]),
    "V": (650, [[(65, 700), (285, 0), (335, 0), (550, 700)]]),
    "W": (
        800,
        [[(65, 700), (180, 0), (255, 0), (385, 360), (515, 0), (590, 0), (705, 700)]],
    ),
    "X": (650, [[(75, 700), (530, 0)], [(530, 700), (75, 0)]]),
    "Y": (650, [[(65, 700), (300, 355), (545, 700)], [(300, 355), (300, 0)]]),
    "Z": (620, [[(75, 700), (520, 700), (75, 0), (520, 0)]]),
    "0": (
        640,
        [
            [
                (180, 0),
                (75, 110),
                (75, 590),
                (180, 700),
                (415, 700),
                (520, 590),
                (520, 110),
                (415, 0),
                (180, 0),
            ],
            [(175, 150), (420, 550)],
        ],
    ),
    "1": (640, [[(115, 545), (290, 700), (290, 0)], [(110, 0), (475, 0)]]),
    "2": (
        640,
        [
            [
                (75, 590),
                (180, 700),
                (410, 700),
                (520, 590),
                (520, 465),
                (75, 90),
                (75, 0),
                (520, 0),
            ]
        ],
    ),
    "3": (
        640,
        [
            [(75, 700), (415, 700), (520, 590), (520, 455), (415, 355), (200, 355)],
            [(415, 355), (520, 250), (520, 110), (410, 0), (75, 0)],
        ],
    ),
    "4": (640, [[(75, 700), (75, 320), (525, 320)], [(430, 700), (430, 0)]]),
    "5": (
        640,
        [
            [
                (520, 700),
                (75, 700),
                (75, 355),
                (410, 355),
                (520, 245),
                (520, 110),
                (410, 0),
                (75, 0),
            ]
        ],
    ),
    "6": (
        640,
        [
            [
                (510, 700),
                (180, 700),
                (75, 590),
                (75, 110),
                (180, 0),
                (410, 0),
                (520, 110),
                (520, 250),
                (410, 355),
                (75, 355),
            ]
        ],
    ),
    "7": (640, [[(75, 700), (520, 700), (230, 0)]]),
    "8": (
        640,
        [
            [
                (180, 355),
                (75, 455),
                (75, 590),
                (180, 700),
                (410, 700),
                (520, 590),
                (520, 455),
                (410, 355),
                (180, 355),
                (75, 250),
                (75, 110),
                (180, 0),
                (410, 0),
                (520, 110),
                (520, 250),
                (410, 355),
            ]
        ],
    ),
    "9": (
        640,
        [
            [
                (520, 345),
                (180, 345),
                (75, 455),
                (75, 590),
                (180, 700),
                (410, 700),
                (520, 590),
                (520, 110),
                (410, 0),
                (85, 0),
            ]
        ],
    ),
    "-": (440, [[(75, 350), (350, 350)]]),
    "/": (450, [[(65, 0), (365, 700)]]),
    ".": (250, [[(100, 0), (100, 22)]]),
    ":": (250, [[(100, 120), (100, 142)], [(100, 480), (100, 502)]]),
    "+": (480, [[(70, 350), (390, 350)], [(230, 190), (230, 510)]]),
    "!": (280, [[(115, 700), (115, 210)], [(115, 0), (115, 22)]]),
    "?": (
        620,
        [
            [
                (75, 590),
                (180, 700),
                (405, 700),
                (515, 590),
                (515, 455),
                (300, 280),
                (300, 200),
            ],
            [(300, 0), (300, 22)],
        ],
    ),
    "Ⅱ": (420, [[(110, 0), (110, 700)], [(290, 0), (290, 700)]]),
}


def draw_polygon(pen, points):
    points = [(round((x + y * RAKE) * CONDENSE), round(y)) for x, y in points]
    pen.moveTo(points[0])
    for point in points[1:]:
        pen.lineTo(point)
    pen.closePath()


def draw_route(pen, points):
    radius = STROKE / 2
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        dx, dy = x1 - x0, y1 - y0
        length = hypot(dx, dy)
        nx, ny = -dy / length * radius, dx / length * radius
        draw_polygon(
            pen,
            [
                (x0 + nx, y0 + ny),
                (x1 + nx, y1 + ny),
                (x1 - nx, y1 - ny),
                (x0 - nx, y0 - ny),
            ],
        )
    # Flat route terminals and clipped junctions create the display signature.
    # Closed counters include the first junction; punctuation keeps square dots.
    if points[0] == points[-1]:
        junctions = points[:-1]
    elif (
        len(points) == 2
        and hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]) < STROKE
    ):
        junctions = points
    else:
        junctions = points[1:-1]
    for x, y in junctions:
        draw_polygon(
            pen,
            [
                (x + cos(-i * pi / 4) * radius, y + sin(-i * pi / 4) * radius)
                for i in range(8)
            ],
        )


def build():
    glyphs, metrics, cmap = {}, {}, {}
    for char, (advance, routes) in GLYPHS.items():
        name = f"uni{ord(char):04X}"
        pen = TTGlyphPen(None)
        for route in routes:
            draw_route(pen, route)
        glyph = pen.glyph()
        # The strokes deliberately overlap; keep non-zero winding fill semantics.
        glyph.flags[0] |= 0x40
        glyphs[name] = glyph
        metrics[name] = (round(advance * CONDENSE), 0)
        cmap[ord(char)] = name
        if "A" <= char <= "Z":
            cmap[ord(char.lower())] = name
    missing = TTGlyphPen(None)
    draw_route(missing, [(75, 0), (75, 700), (450, 700), (450, 0), (75, 0)])
    draw_route(missing, [(75, 0), (450, 700)])
    glyphs[".notdef"] = missing.glyph()
    glyphs["space"] = TTGlyphPen(None).glyph()
    metrics[".notdef"] = (500, 0)
    metrics["space"] = (240, 0)
    cmap[32] = "space"
    cmap[0x2013] = cmap[ord("-")]
    cmap[0x2014] = cmap[ord("-")]
    order = [
        ".notdef",
        "space",
        *[name for name in glyphs if name not in (".notdef", "space")],
    ]
    font = FontBuilder(1000, isTTF=True)
    font.setupGlyphOrder(order)
    font.setupCharacterMap(cmap)
    font.setupGlyf(glyphs)
    for name, glyph in glyphs.items():
        if glyph.numberOfContours > 0:
            glyph.recalcBounds(font.font["glyf"])
            width = glyph.xMax - glyph.xMin
            glyph.coordinates.translate((20 - glyph.xMin, 0))
            glyph.recalcBounds(font.font["glyf"])
            metrics[name] = (max(metrics[name][0], width + 40), 20)
    digit_advance = max(metrics[cmap[ord(char)]][0] for char in "0123456789")
    for char in "0123456789":
        metrics[cmap[ord(char)]] = (digit_advance, 20)
    font.setupHorizontalMetrics(metrics)
    font.setupHorizontalHeader(ascent=820, descent=-180)
    font.setupNameTable(
        {
            "familyName": "Belmondo Circuit",
            "styleName": "Bold",
            "uniqueFontIdentifier": "BELMONDO-Circuit-1.0",
            "fullName": "Belmondo Circuit Bold",
            "psName": "BelmondoCircuit-Bold",
            "version": "Version 1.0",
            "copyright": "Copyright 2026 BELMONDO contributors. Original glyph outlines.",
            "licenseDescription": "SIL Open Font License, Version 1.1",
            "licenseInfoURL": "https://openfontlicense.org/",
        }
    )
    font.setupOS2(
        sTypoAscender=820,
        sTypoDescender=-180,
        usWinAscent=820,
        usWinDescent=180,
        sCapHeight=700,
        sxHeight=700,
        usWeightClass=700,
        fsSelection=0x20,
        fsType=0,
    )
    font.setupPost()
    font.setupMaxp()
    # Fixed timestamps make regeneration byte-for-byte reproducible.
    font.font.recalcTimestamp = False
    font.font["head"].macStyle = 1
    font.font["head"].created = 3877286400
    font.font["head"].modified = 3877286400
    output = ROOT / "belmondo-circuit-bold.ttf"
    font.save(output)
    print(output)


if __name__ == "__main__":
    build()
