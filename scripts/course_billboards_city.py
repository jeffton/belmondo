"""Original print and display campaigns for the hydraulic, polar and night routes."""
from math import cos, pi, sin
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONTS = Path(__file__).resolve().parents[1] / "public/fonts"
SCALE = 3
WIDTH, HEIGHT = 512, 211


def scaled(points):
    return [tuple(round(value * SCALE) for value in point) for point in points]


class Print:
    def __init__(self, color):
        self.image = Image.new("RGB", (WIDTH * SCALE, HEIGHT * SCALE), color)
        self.draw = ImageDraw.Draw(self.image)

    def polygon(self, color, *points):
        self.draw.polygon(scaled(points), fill=color)

    def line(self, color, width, *points):
        self.draw.line(scaled(points), fill=color, width=round(width * SCALE), joint="curve")

    def box(self, color, left, top, right, bottom, radius=0):
        xy = scaled([(left, top), (right, bottom)])
        self.draw.rounded_rectangle(xy, radius=radius * SCALE, fill=color)

    def disk(self, color, x, y, rx, ry=None, rim=0):
        ry = rx if ry is None else ry
        xy = scaled([(x - rx, y - ry), (x + rx, y + ry)])
        if rim:
            self.draw.ellipse(xy, outline=color, width=round(rim * SCALE))
        else:
            self.draw.ellipse(xy, fill=color)

    def type(self, label, x, y, size, font, color, anchor="lt"):
        face = ImageFont.truetype(FONTS / font, size * SCALE)
        self.draw.text((x * SCALE, y * SCALE), label, fill=color, font=face, anchor=anchor)

    def finish(self):
        return self.image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)


MONO = "font-9.ttf"
TALL = "font-6.ttf"
FAST = "font-1.ttf"
CIRCUIT = "belmondo-circuit-bold.ttf"
ARCHIVO = "archivo-variable.ttf"
WIDE = "chakra-petch-700.ttf"


def monsoon_lowtide():
    # Screen-printed passenger ferry poster: the boat is the headline image.
    paper, ink, red, sea = "#efdca7", "#123c46", "#ca4131", "#539e8f"
    p = Print(paper)
    p.disk("#f69f68", 391, 72, 47)
    p.box(sea, 0, 130, 512, 175)
    p.box(ink, 0, 173, 512, 211)
    for x, y, length in ((24, 143, 80), (127, 158, 43), (321, 159, 137), (0, 168, 115)):
        p.line(paper, 2, (x, y), (x + length, y))
    p.polygon(ink, (136, 133), (433, 111), (408, 146), (196, 151))
    p.polygon(red, (161, 126), (407, 108), (433, 111), (397, 128), (144, 141))
    p.polygon(paper, (227, 115), (262, 81), (344, 73), (392, 106))
    p.polygon(ink, (264, 88), (344, 80), (363, 96), (251, 105))
    for x in (276, 299, 322, 345):
        p.line(paper, 3, (x, 82), (x + 5, 104))
    p.type("LOWTIDE", 27, 17, 75, FAST, ink)
    p.type("F E R R I E S", 31, 178, 24, MONO, paper)
    p.type("ACROSS THE FLOODPLAIN", 486, 183, 18, MONO, paper, "rt")
    return p.finish()


def monsoon_gill():
    # Cold industrial catalogue with a close-up diver's rebreather occupying half the frame.
    ink, edge, shell, mint = "#13251c", "#586e46", "#b6c385", "#e1ecad"
    p = Print(ink)
    for x in range(0, 520, 21):
        p.line("#293a29", 1, (x, 0), (x, 211))
    for y in range(6, 212, 21):
        p.line("#293a29", 1, (0, y), (512, y))
    p.disk(edge, 103, 104, 88)
    p.polygon(shell, (43, 73), (95, 38), (154, 49), (178, 107), (152, 159),
              (73, 169), (39, 124))
    p.polygon("#263021", (54, 72), (145, 60), (159, 107), (67, 116))
    p.polygon("#8dad6d", (62, 77), (139, 68), (146, 80), (71, 93))
    p.box(edge, 41, 121, 68, 153, 7)
    p.box(edge, 151, 118, 173, 145, 6)
    p.line(shell, 7, (153, 138), (194, 143), (218, 184), (248, 211))
    p.disk(ink, 114, 135, 22)
    p.disk(mint, 114, 135, 16, rim=2)
    for x in (106, 113, 120):
        p.line(mint, 2, (x, 128), (x, 142))
    p.type("GILL", 204, 28, 127, CIRCUIT, mint)
    p.box(mint, 242, 157, 512, 193)
    p.type("BREATHING SYSTEMS", 482, 165, 21, MONO, ink, "rt")
    return p.finish()


def monsoon_lock():
    # A flood office notice, not a retail ad. Big municipal seal and four flood levels.
    sky, blue, black, white = "#b5cae2", "#21418b", "#162250", "#f0f4e9"
    p = Print(sky)
    p.box(white, 17, 15, 495, 195)
    p.box(blue, 17, 15, 495, 48)
    p.type("MONSOON FLOOD OFFICE", 33, 21, 22, MONO, white)
    p.type("LOCK 12", 33, 74, 90, TALL, black)
    p.type("WATER IS A PUBLIC WORK", 36, 161, 18, WIDE, blue)
    p.disk(blue, 426, 113, 50)
    for i, y in enumerate((90, 104, 118, 132)):
        p.line(white, 3, (395, y), (408 + i * 6, y), (414 + i * 6, y + 6), (454, y + 6))
    return p.finish()


def whiteout_brrr():
    # Freezer-bar campaign: unrestrained flavor branding among observatory signs.
    purple, cobalt, pink, ice = "#3a245d", "#4f66b6", "#ff8da7", "#e7f3ee"
    p = Print(cobalt)
    for i in range(16):
        a = i * pi / 8
        p.polygon(purple, (394, 99), (394+450*cos(a), 99+450*sin(a)),
                  (394+450*cos(a+.15), 99+450*sin(a+.15)))
    p.disk(pink, 394, 106, 115)
    p.polygon("#d29b8d", (377, 132), (402, 137), (396, 208), (376, 204))
    p.polygon(ice, (334, 143), (337, 58), (365, 25), (414, 24), (446, 54),
              (454, 143), (431, 157), (362, 156))
    p.polygon("#62cfeb", (337, 103), (364, 107), (402, 96), (448, 102),
              (454, 143), (431, 157), (362, 156), (334, 143))
    p.disk(purple, 376, 78, 5, 9)
    p.disk(purple, 414, 77, 5, 9)
    p.polygon(purple, (373, 92), (419, 91), (410, 107), (382, 107))
    p.line(ice, 3, (382, 94), (411, 94))
    p.type("BRRR!", 19, 28, 106, FAST, ice)
    p.box(pink, 23, 152, 277, 186, 5)
    p.type("GLACIER POPS", 38, 157, 23, WIDE, purple)
    return p.finish()


def whiteout_parallax():
    # Precision optics campaign. A near-black planetarium rather than ice-blue enamel.
    black, cream, blue, amber = "#0b1626", "#e1e6d7", "#487fba", "#f2a45a"
    p = Print(black)
    for x, y in ((18, 37), (59, 117), (93, 37), (128, 67), (195, 11), (299, 17),
                 (328, 82), (364, 25), (411, 96), (458, 29), (477, 124)):
        p.disk(cream, x, y, 1.5)
    for radius, color in ((105, "#152d4b"), (83, "#23446a"), (64, blue),
                          (39, "#8ba9c0"), (25, black), (13, amber)):
        p.disk(color, 254, 70, radius, radius * .74)
    p.disk(cream, 254, 70, 92, 71, rim=2)
    p.line(cream, 2, (145, 70), (213, 70))
    p.line(cream, 2, (296, 70), (364, 70))
    p.disk(cream, 237, 54, 9, 5)
    p.box(black, 41, 138, 471, 211)
    p.type("PARALLAX", 256, 139, 61, ARCHIVO, cream, "mt")
    p.type("WIDE FIELD OPTICS", 256, 190, 14, MONO, amber, "mt")
    return p.finish()


def whiteout_courier():
    # Polar air mail: stamps, a bright warm rescue orange and huge overprint.
    paper, dark, orange, gray = "#f1edda", "#152c4a", "#e94a2e", "#b9bec0"
    p = Print(paper)
    for x in range(-24, 539, 52):
        p.polygon(orange, (x, 0), (x+23, 0), (x+7, 14), (x-16, 14))
        p.polygon(dark, (x, 198), (x+23, 198), (x+7, 211), (x-16, 211))
    p.type("NORTH", 36, 31, 76, TALL, dark)
    p.type("POST", 35, 105, 78, TALL, dark)
    p.box(gray, 326, 34, 474, 181)
    for x in range(326, 480, 12):
        p.disk(paper, x, 34, 3)
        p.disk(paper, x, 181, 3)
    for y in range(34, 186, 12):
        p.disk(paper, 326, y, 3)
        p.disk(paper, 474, y, 3)
    p.box(orange, 340, 47, 460, 168)
    p.polygon(paper, (355, 113), (433, 72), (426, 143), (401, 124),
              (379, 145), (384, 121))
    p.line(dark, 2, (385, 120), (427, 81), (402, 124))
    return p.finish()


def night_linehaul():
    # Strapped-shipping-crate typography and a beveled transport insignia.
    orange, ink, sand, dim = "#ec632d", "#201e24", "#f1d591", "#984830"
    p = Print(orange)
    p.polygon(dim, (281, 0), (512, 0), (512, 211), (352, 211))
    p.box(ink, 0, 150, 512, 211)
    p.type("17", 37, 12, 181, TALL, ink)
    p.type("LINEHAUL", 37, 154, 54, FAST, sand)
    p.polygon(sand, (245, 108), (355, 62), (468, 91), (392, 140), (292, 132))
    p.polygon(ink, (256, 119), (391, 130), (470, 82), (477, 101), (391, 154), (277, 147))
    p.polygon(ink, (338, 81), (374, 64), (399, 70), (356, 88))
    for x in (299, 325, 351):
        p.disk(orange, x, 135, 5)
    p.type("NIGHT FREIGHT CO.", 484, 173, 17, MONO, sand, "rt")
    return p.finish()


def night_bedshift():
    # Luxury sleeper rooms sold with a soft surreal moon and clean horizontal typography.
    maroon, aubergine, cream, rose = "#522647", "#301c3d", "#fff2d6", "#d998ab"
    p = Print(aubergine)
    for i in range(17):
        span = 16 + i * 9
        p.disk(maroon if i % 2 else "#43223e", 256, 66, span, span * .53, rim=3)
    p.disk(cream, 256, 57, 41)
    p.disk(rose, 243, 43, 10, 5)
    p.disk(rose, 273, 73, 13, 6)
    p.polygon(rose, (151, 104), (184, 96), (203, 109), (316, 109), (329, 96),
              (365, 108), (326, 136), (191, 137))
    p.polygon(cream, (182, 112), (210, 103), (255, 118), (311, 103), (340, 114),
              (312, 133), (207, 133))
    p.type("BEDSHIFT", 256, 141, 61, ARCHIVO, cream, "mt")
    for x in (25, 47, 69, 444, 466, 488):
        p.polygon(rose, (x-6, 38), (x, 31), (x+6, 38), (x, 45))
    return p.finish()


def night_helix():
    # Fluorescent maintenance label with a giant machined bearing cutaway.
    green, pale, black, blue = "#c5d556", "#eff4aa", "#21261c", "#5c6639"
    p = Print(green)
    p.polygon(black, (227, 0), (512, 0), (512, 211), (309, 211))
    for r, color in ((122, blue), (98, pale), (79, black), (59, green), (41, black)):
        p.disk(color, 446, 105, r)
    for i in range(12):
        a = i * pi / 6
        x, y = 446 + cos(a) * 69, 105 + sin(a) * 69
        p.disk(blue, x + 2, y + 3, 10)
        p.disk(pale, x, y, 8)
    p.line(green, 4, (345, 0), (411, 70), (511, 68))
    p.type("HELIX", 18, 45, 75, CIRCUIT, black)
    p.type("MAG BEARINGS", 20, 135, 23, MONO, black)
    p.line(black, 6, (20, 174), (233, 174))
    return p.finish()


def vesper_yuzu():
    # Day-glo citrus soda, drawn like a painted eighties vending machine panel.
    pink, navy, lime, white = "#f9388a", "#411c65", "#f7f567", "#fff1c7"
    p = Print(pink)
    p.disk(navy, 368, 107, 136)
    p.disk(lime, 407, 112, 91)
    p.disk(navy, 407, 112, 73, rim=2)
    for i in range(10):
        a = i * pi / 5
        p.line(navy, 3, (407, 112), (407+72*cos(a), 112+72*sin(a)))
    p.polygon(navy, (307, 26), (361, 48), (317, 190), (260, 171))
    p.polygon(white, (300, 20), (351, 42), (308, 181), (256, 162))
    p.polygon(pink, (288, 59), (339, 81), (320, 144), (268, 122))
    p.disk(lime, 305, 103, 14)
    p.line(navy, 4, (306, 28), (333, 40))
    p.type("YUZU", 14, 29, 86, FAST, white)
    p.type("9", 150, 111, 101, FAST, lime)
    p.type("CITRUS FIZZ", 22, 150, 24, TALL, white)
    return p.finish()


def vesper_void():
    # Sparse two-ink record store ad, with one giant groove mark and no border.
    cream, ink, blue = "#d7e4f0", "#171722", "#4f63ed"
    p = Print(cream)
    p.disk(ink, 140, 105, 136)
    for r in range(27, 136, 10):
        p.disk("#414456", 140, 105, r, rim=2)
    p.disk(blue, 140, 105, 38)
    p.disk(cream, 140, 105, 8)
    p.polygon(cream, (140, 105), (241, 30), (292, 8), (223, 82), (155, 114))
    p.type("VOID", 381, 30, 94, ARCHIVO, ink, "mt")
    p.type("RECORDS", 381, 133, 32, MONO, blue, "mt")
    p.line(blue, 3, (293, 182), (469, 182))
    return p.finish()


def vesper_six():
    # The board IS a citywide television ident, including the period scanlines.
    black, white, violet, blue = "#170e2c", "#f7eacf", "#7643ad", "#6ae6ea"
    p = Print(black)
    p.box("#2d1c55", 12, 12, 499, 198, 24)
    p.box("#4d2b80", 21, 21, 490, 189, 20)
    for y in range(28, 186, 5):
        p.line(violet, 1, (36, y), (475, y))
    p.disk(blue, 392, 104, 63)
    p.polygon(black, (354, 115), (432, 66), (421, 130), (369, 155), (380, 124))
    p.type("CH 6", 41, 45, 126, CIRCUIT, white)
    p.box(black, 44, 159, 280, 185)
    p.disk("#ff8457", 61, 172, 6)
    p.type("LIVE FROM VESPER", 79, 163, 17, MONO, white)
    return p.finish()


PAINTERS = {
    "monsoon": (monsoon_lowtide, monsoon_gill, monsoon_lock),
    "whiteout": (whiteout_parallax, whiteout_courier, whiteout_brrr),
    "noctilucent": (night_linehaul, night_bedshift, night_helix),
    "vesper-circuit": (vesper_yuzu, vesper_void, vesper_six),
}
