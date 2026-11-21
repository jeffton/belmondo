"""Original raster advertisements for Palm Breaker and Solar Array."""

from math import cos, radians, sin
from pathlib import Path
from random import Random

from PIL import Image, ImageDraw, ImageFont


SIZE = (512, 211)
FONTS = Path(__file__).resolve().parents[1] / "public" / "fonts"


def _font(name, size, axes=None):
    face = ImageFont.truetype(str(FONTS / f"{name}.ttf"), size)
    if axes:
        face.set_variation_by_axes(axes)
    return face


def _letter(draw, xy, copy, face, ink, anchor="lt", stroke=0, outline=None):
    draw.text(xy, copy, font=face, fill=ink, anchor=anchor,
              stroke_width=stroke, stroke_fill=outline)


def _paper(image, seed, strength, density):
    rng = Random(seed)
    pixels = image.load()
    for _ in range(density):
        x, y = rng.randrange(SIZE[0]), rng.randrange(SIZE[1])
        shift = rng.randrange(-strength, strength + 1)
        pixels[x, y] = tuple(max(0, min(255, c + shift)) for c in pixels[x, y])
    return image


def coral_air():
    image = Image.new("RGB", SIZE, "#ed8e7f")
    d = ImageDraw.Draw(image)
    cream, shadow = "#fff0be", "#79283d"
    d.ellipse((203, 39, 310, 147), fill="#ffc290")
    d.rectangle((0, 119, 511, 210), fill="#499c99")
    d.rectangle((0, 137, 511, 151), fill="#3c858c")
    d.rectangle((0, 168, 511, 210), fill="#256275")
    d.polygon([(0, 160), (61, 174), (158, 188), (275, 184), (367, 194),
               (410, 210), (0, 210)], fill="#fbc790")
    d.polygon([(269, 120), (339, 112), (409, 114), (443, 121), (512, 117),
               (512, 126), (269, 126)], fill="#375e6e")
    for x, y, w in [(337, 98, 9), (351, 102, 12), (367, 95, 18), (389, 104, 9),
                    (402, 101, 16), (422, 108, 9)]:
        d.rectangle((x, y, x + w, 120), fill="#375e6e")
    for y, x, end in [(129, 12, 132), (145, 267, 451), (154, 123, 214),
                       (160, 296, 510), (179, 340, 429)]:
        d.line((x, y, end, y), fill="#9ec3ac", width=2)
    # Low-flying passenger craft, its shadow offset into the water.
    plane = [(99, 155), (168, 142), (198, 140), (233, 102), (244, 102),
             (232, 135), (334, 116), (359, 118), (376, 125), (364, 132),
             (245, 151), (215, 172), (194, 172), (209, 155), (146, 163),
             (121, 161), (91, 145), (106, 143)]
    d.polygon([(x + 9, y + 7) for x, y in plane], fill="#245264")
    d.polygon(plane, fill=cream)
    d.line((148, 157, 362, 123), fill="#d44954", width=4)
    for x, y in [(278, 131), (291, 129), (304, 127), (317, 125), (330, 123)]:
        d.line((x, y, x + 6, y - 1), fill=shadow, width=3)
    _letter(d, (256, 15), "PALM BREAKER", _font("archivo-italic-variable", 51, [880, 103]),
            cream, "mt", 2, shadow)
    _letter(d, (257, 70), "FLY CORAL AIR", _font("font-9", 24), shadow, "mt")
    d.line((104, 78, 139, 78), fill=shadow, width=2)
    d.line((375, 78, 410, 78), fill=shadow, width=2)
    for x, bend in [(31, 16), (60, -9), (83, 13)]:
        top = 151 + (x % 3) * 5
        d.line((x, 194, x + bend // 2, top + 18, x + bend, top), fill=shadow, width=4)
        for dx, dy in [(-24, 9), (-20, -3), (-6, -7), (15, -5), (23, 5), (13, 14)]:
            d.line((x + bend, top, x + bend + dx // 2, top + dy // 2 - 4,
                    x + bend + dx, top + dy), fill=shadow, width=3)
    return _paper(image, 19, 10, 54000)


def fin_spasm():
    image = Image.new("RGB", SIZE, "#20154e")
    d = ImageDraw.Draw(image)
    violet, acid, foam = "#4c2ad5", "#eaff56", "#a1fff1"
    d.polygon([(0, 0), (318, 0), (227, 73), (121, 118), (0, 144)], fill="#2b2366")
    # A single breaking wave sweeps right across the hand-painted wall.
    d.polygon([(0, 179), (83, 137), (183, 117), (248, 76), (304, 29), (369, 5),
               (432, 4), (482, 24), (511, 53), (511, 79), (466, 49), (403, 44),
               (353, 57), (310, 101), (265, 159), (180, 211), (0, 211)], fill=violet)
    d.line((85, 146, 172, 127, 239, 100, 303, 48, 365, 21, 425, 15,
            474, 30, 511, 58), fill="#46e9e0", width=12, joint="curve")
    d.line((236, 119, 294, 101, 342, 56, 403, 34, 467, 39, 511, 70),
           fill=foam, width=4, joint="curve")
    for x, y, k in [(309, 51, 8), (369, 11, 13), (413, 13, 8), (482, 48, 11),
                    (460, 62, 14), (311, 112, 7), (330, 92, 7), (459, 18, 7)]:
        d.polygon([(x, y), (x + k, y - 5), (x + 4, y + 4)], fill=foam)
    # Surfer and board cut across the lip rather than floating beside a logo.
    d.polygon([(293, 140), (317, 127), (404, 93), (435, 85), (421, 100),
               (346, 132), (309, 145)], fill=acid)
    d.polygon([(352, 128), (366, 121), (359, 139)], fill="#ff56a1")
    d.line((312, 139, 424, 91), fill="#ff56a1", width=3)
    d.line((329, 125, 342, 101, 357, 94, 370, 103, 390, 99), fill="#180e38", width=11)
    d.line((355, 97, 345, 77, 362, 63), fill="#ff56a1", width=13)
    d.line((347, 78, 321, 82, 307, 72), fill="#ffb573", width=8)
    d.line((353, 78, 374, 74, 391, 59), fill="#ffb573", width=8)
    d.ellipse((355, 55, 373, 72), fill="#ffb573")
    d.polygon([(353, 63), (357, 55), (369, 54), (376, 61)], fill="#180e38")
    d.line((341, 96, 360, 91), fill="#ff56a1", width=7)
    _letter(d, (19, 16), "CUT THE LIP.", _font("chakra-petch-700", 22), foam)
    _letter(d, (251, 144), "FIN SPASM", _font("font-1", 73), acid, "mt", 3, "#1d133f")
    d.polygon([(0, 194), (113, 187), (104, 201), (0, 206)], fill="#ff56a1")
    d.polygon([(512, 148), (436, 158), (451, 145), (512, 137)], fill="#ff56a1")
    return _paper(image, 72, 11, 47000)


def sawgrass_soda():
    image = Image.new("RGB", SIZE, "#e8bd7c")
    d = ImageDraw.Draw(image)
    dark, red, yellow, green = "#264745", "#a44737", "#ffe6ab", "#588c68"
    d.rectangle((8, 8, 503, 202), outline=red, width=3)
    d.rectangle((14, 14, 497, 196), outline=red, width=1)
    d.ellipse((178, 29, 336, 187), fill="#d8ad68", outline=red, width=2)
    for y in range(61, 170, 9):
        a = int((79 ** 2 - (y - 108) ** 2) ** 0.5)
        d.line((257 - a, y, 257 + a, y), fill="#d0a263", width=3)
    for x, y, r in [(165, 151, 31), (350, 155, 27)]:
        d.ellipse((x - r, y - r, x + r, y + r), fill=green, outline=dark, width=3)
        d.ellipse((x - r + 6, y - r + 6, x + r - 6, y + r - 6), fill=yellow)
        for degrees in range(0, 360, 60):
            angle = radians(degrees)
            d.line((x, y, x + (r - 7) * cos(angle), y + (r - 7) * sin(angle)),
                   fill=green, width=2)
    bottle = [(240, 42), (272, 42), (272, 69), (277, 79), (289, 90), (295, 106),
              (290, 144), (295, 172), (287, 186), (224, 186), (216, 172),
              (221, 144), (216, 106), (221, 91), (235, 77), (240, 68)]
    d.polygon(bottle, fill=green, outline=dark, width=4)
    d.line((244, 54, 244, 73, 226, 97, 225, 114), fill="#b8cb8a", width=4)
    d.rounded_rectangle((235, 31, 277, 49), radius=3, fill=red, outline=dark, width=2)
    for x in range(240, 275, 6):
        d.line((x, 33, x, 46), fill="#d79467", width=2)
    d.polygon([(219, 107), (254, 113), (291, 106), (288, 149), (255, 156),
               (221, 150)], fill=yellow, outline=dark, width=2)
    _letter(d, (255, 121), "SG", _font("font-1", 27), red, "mt")
    d.line((236, 149, 274, 149), fill=red, width=2)
    _letter(d, (256, 15), "SAWGRASS SODA", _font("font-4", 19), red, "mt")
    for x, word in [(93, "KEY"), (414, "LIME")]:
        _letter(d, (x, 83), word, _font("font-6", 61), dark, "mt", 1, dark)
    _letter(d, (92, 68), "ICE-COLD", _font("font-7", 14), red, "mt")
    _letter(d, (415, 68), "FLORIDA", _font("font-7", 14), red, "mt")
    rng = Random(34)
    for _ in range(1400):
        x, y = rng.randrange(10, 501), rng.randrange(9, 200)
        d.line((x, y, x + rng.randrange(0, 4), y), fill="#e8bd7c")
    return _paper(image, 35, 13, 64000)


def sunspan_power():
    image = Image.new("RGB", SIZE, "#e4b03b")
    d = ImageDraw.Draw(image)
    black, light = "#282927", "#fcdf72"
    d.rectangle((0, 144, 511, 210), fill=black)
    d.rectangle((0, 142, 511, 145), fill=light)
    d.polygon([(0, 1), (42, 1), (42, 143), (0, 143)], fill=black)
    d.polygon([(470, 1), (511, 1), (511, 143), (470, 143)], fill=black)
    for x in (0, 470):
        for y in range(10, 142, 22):
            d.polygon([(x, y + 13), (x + 42, y), (x + 42, y + 4), (x, y + 17)], fill="#725d33")
    # Utility stamp: a split disc bridged by an angular transmission line.
    d.ellipse((178, 13, 334, 131), fill=black)
    d.polygon([(165, 111), (218, 56), (258, 75), (301, 32), (345, 32),
               (268, 106), (225, 86), (197, 115)], fill="#e4b03b")
    d.line((104, 72, 160, 72), fill=black, width=3)
    d.line((352, 72, 408, 72), fill=black, width=3)
    d.ellipse((96, 68, 104, 76), fill=black)
    d.ellipse((408, 68, 416, 76), fill=black)
    _letter(d, (256, 151), "SUNSPAN POWER", _font("belmondo-circuit-bold", 39), light, "mt")
    _letter(d, (120, 86), "GRID", _font("font-9", 16), black, "mt")
    _letter(d, (392, 86), "UTIL", _font("font-9", 16), black, "mt")
    return _paper(image, 81, 8, 43500)


def umbra_instruments():
    image = Image.new("RGB", SIZE, "#151d20")
    d = ImageDraw.Draw(image)
    cream, foil, dark_foil = "#efddb3", "#ccaa74", "#6c593b"
    # Tabletop still life with one illuminated object and a copper bevel.
    d.polygon([(37, 209), (511, 138), (511, 210)], fill="#1f2829")
    d.line((65, 206, 510, 140), fill="#4f4840", width=2)
    d.polygon([(179, 172), (357, 170), (495, 191), (386, 208), (233, 196)], fill="#0e1517")
    face = [(225, 72), (394, 56), (456, 77), (394, 164), (228, 190), (200, 176)]
    d.polygon([(200, 176), (228, 190), (394, 164), (456, 77), (457, 96),
               (402, 182), (232, 205), (202, 193)], fill="#8f704b", outline="#b7905a", width=2)
    d.polygon(face, fill=foil, outline=cream, width=2)
    d.polygon([(237, 81), (391, 66), (438, 82), (387, 151), (234, 176), (212, 169)],
              fill="#243133", outline=dark_foil, width=2)
    d.polygon([(235, 95), (321, 84), (345, 95), (318, 140), (228, 154)],
              fill="#57706b", outline=cream, width=2)
    for i in range(1, 5):
        d.line((235 + i * 17, 95 - i * 2, 228 + i * 18, 154 - i * 3), fill="#96aaa2", width=2)
    for y in (108, 122, 136):
        d.line((232, y, 340 - (y - 108) // 2, y - 13), fill="#233736", width=2)
    d.ellipse((347, 91, 416, 137), fill="#101c1e", outline=foil, width=3)
    d.arc((356, 96, 407, 132), 194, 344, fill=cream, width=3)
    d.line((379, 122, 394, 104), fill="#ec7856", width=3)
    d.ellipse((376, 120, 382, 126), fill=cream)
    for x, y in [(226, 84), (421, 83), (230, 171), (385, 146)]:
        d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=foil)
    _letter(d, (28, 18), "UMBRA", _font("archivo-variable", 65, [680, 104]), cream)
    d.line((30, 92, 176, 92), fill=foil, width=2)
    _letter(d, (30, 109), "ANALOG", _font("font-7", 20), cream)
    _letter(d, (30, 134), "SOLAR METER", _font("font-9", 20), cream)
    _letter(d, (31, 178), "TYPE 06", _font("font-7", 16), foil)
    return _paper(image, 90, 7, 47500)


def dryline_receiver():
    image = Image.new("RGB", SIZE, "#a8cac5")
    d = ImageDraw.Draw(image)
    ink, orange, sand = "#203e49", "#d75232", "#e3bc88"
    d.ellipse((47, 26, 139, 118), fill="#ed943d")
    d.polygon([(0, 139), (38, 122), (87, 134), (124, 118), (149, 119),
               (164, 131), (207, 129), (243, 147), (512, 144), (512, 211),
               (0, 211)], fill="#aa7e68")
    d.polygon([(0, 153), (74, 139), (105, 146), (152, 139), (208, 152),
               (512, 155), (512, 211), (0, 211)], fill=sand)
    d.polygon([(0, 179), (130, 161), (211, 162), (143, 174), (95, 182),
               (159, 183), (101, 202), (0, 210)], fill="#bd956f")
    d.polygon([(112, 197), (134, 141), (153, 144), (174, 195), (161, 197),
               (143, 156), (124, 197)], fill=ink)
    d.line((125, 184, 157, 168), fill=ink, width=5)
    d.line((132, 171, 162, 187), fill=ink, width=5)
    d.polygon([(73, 112), (181, 49), (186, 68), (183, 99), (167, 127),
               (140, 140), (111, 139), (89, 127)], fill=ink)
    d.polygon([(78, 114), (175, 58), (166, 84), (135, 110), (103, 124)],
              fill="#6a9696")
    d.line((76, 112, 181, 49), fill="#edf1ce", width=5)
    d.line((104, 98, 105, 78, 115, 73), fill=ink, width=4)
    d.line((161, 164, 207, 189, 240, 191), fill=ink, width=2)
    d.line((117, 70, 213, 18), fill="#eff2d2", width=3)
    d.line((127, 70, 216, 24), fill="#eff2d2", width=1)
    for x, y in [(196, 33), (216, 22)]:
        d.line((x - 5, y, x + 5, y), fill="#eff2d2", width=2)
        d.line((x, y - 5, x, y + 5), fill="#eff2d2", width=2)
    _letter(d, (486, 24), "DRYLINE", _font("font-5", 76), ink, "rt")
    _letter(d, (483, 102), "HELIOGRAPH", _font("font-9", 26), ink, "rt")
    d.polygon([(241, 133), (512, 133), (512, 161), (224, 161)], fill=orange)
    _letter(d, (483, 137), "RECEIVER SERVICE", _font("font-3", 24), "#fff1c0", "rt")
    d.line((270, 185, 485, 185), fill=ink, width=2)
    for x in range(273, 486, 18):
        d.line((x, 185, x, 192 if x % 36 == 3 else 189), fill=ink, width=2)
    return _paper(image, 102, 8, 52000)


PAINTERS = {
    "palm-breaker": (coral_air, fin_spasm, sawgrass_soda),
    "solar-array": (sunspan_power, umbra_instruments, dryline_receiver),
}
