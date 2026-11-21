"""Original raster billboard faces for Faultline and Cinderline."""

from pathlib import Path
from random import Random

from PIL import Image, ImageDraw, ImageFont


FONTS = Path(__file__).resolve().parents[1] / "public" / "fonts"
SIZE = (512, 211)


def _font(name, size, axes=None):
    font = ImageFont.truetype(str(FONTS / f"{name}.ttf"), size)
    if axes is not None:
        font.set_variation_by_axes(axes)
    return font


def _spaced(draw, xy, text, font, fill, gap):
    x, y = xy
    for letter in text:
        draw.text((x, y), letter, font=font, fill=fill, anchor="lt")
        x += draw.textlength(letter, font=font) + gap


def quarry():
    """A gouged, two-ink quarry poster, like a local trade advertisement."""
    yellow = "#fabe38"
    coal = "#201c1b"
    image = Image.new("RGB", SIZE, yellow)
    draw = ImageDraw.Draw(image)
    draw.polygon([(0, 136), (74, 111), (133, 118), (175, 97), (217, 99),
                  (335, 45), (458, 0), (512, 0), (512, 211), (0, 211)], fill=coal)
    rng = Random(357)
    for _ in range(205):
        x = rng.randrange(512)
        y = rng.randrange(211)
        if y < 75 and image.getpixel((x, y))[0] == 250:
            draw.line((x, y, x + rng.randrange(1, 7), y - 1), fill="#d6942f")
    # Broken terraced rock, lit from the yellow cut rather than shaded generically.
    draw.polygon([(0, 128), (77, 106), (133, 112), (177, 91), (221, 95),
                  (324, 48), (386, 37), (446, 11), (370, 61), (335, 65),
                  (228, 110), (188, 108), (150, 127), (94, 125), (26, 150),
                  (0, 147)], fill="#90522d")
    draw.line([(0, 129), (77, 107), (133, 113), (177, 92), (221, 96),
               (324, 49), (386, 38), (454, 8)], fill="#ffe08b", width=4)
    # Silhouette of a bucket biting the edge of the rock face.
    draw.polygon([(512, 8), (512, 39), (397, 39), (368, 88), (350, 78),
                  (376, 27), (389, 16)], fill=coal)
    draw.polygon([(348, 67), (373, 79), (383, 94), (376, 119), (356, 128),
                  (326, 116), (316, 106), (322, 101), (334, 105), (326, 96),
                  (331, 92), (342, 97), (337, 86)], fill=yellow)
    draw.line([(351, 79), (367, 87), (372, 95), (365, 111), (355, 115)],
              fill=coal, width=4)
    draw.ellipse((392, 23, 404, 35), fill=yellow)
    for points in [[(303, 110), (311, 103), (310, 116)],
                   [(284, 117), (299, 113), (294, 123)],
                   [(319, 124), (327, 122), (323, 132)]]:
        draw.polygon(points, fill="#da8f38")
    draw.text((19, 18), "QUARRY & DEMOLITION", font=_font("font-4", 28),
              fill=coal, anchor="lt")
    draw.text((485, 193), "HARD CUT", font=_font("font-1", 90),
              fill=yellow, anchor="rb")
    return image


def ground_two():
    """A land trust campaign built around a restoration map, not a company badge."""
    paper = "#e7e2c3"
    pine = "#1b493c"
    image = Image.new("RGB", SIZE, paper)
    draw = ImageDraw.Draw(image)
    # Aerial field study: soil contours interrupted by a restored watercourse.
    for y in range(58, 153, 15):
        draw.line([(0, y + 16), (48, y + 2), (102, y + 5), (157, y - 10),
                   (217, y - 5), (273, y + 9), (332, y + 9), (390, y - 4),
                   (459, y + 4), (512, y - 8)], fill="#b3b28f", width=2)
    draw.polygon([(0, 140), (66, 124), (111, 131), (163, 127), (221, 72),
                  (269, 63), (316, 93), (357, 101), (400, 78), (436, 66),
                  (478, 74), (512, 66), (512, 98), (476, 106), (442, 96),
                  (406, 110), (358, 133), (310, 125), (264, 96), (240, 101),
                  (182, 153), (120, 160), (68, 153), (0, 169)], fill=pine)
    draw.line([(0, 156), (68, 140), (118, 146), (174, 138), (228, 87),
               (266, 80), (313, 109), (357, 118), (438, 80), (477, 90),
               (513, 82)], fill="#96b6a1", width=4)
    for x, y in [(46, 110), (60, 108), (87, 112), (141, 114), (175, 118),
                 (192, 99), (209, 77), (277, 116), (290, 125), (332, 143),
                 (368, 147), (384, 137), (422, 118), (437, 112), (473, 121)]:
        draw.polygon([(x, y - 8), (x + 5, y + 4), (x - 5, y + 4)], fill="#748853")
    draw.rectangle((0, 0, 511, 59), fill=paper)
    draw.text((256, 8), "GROUND TWO", font=_font("archivo-variable", 53, [850, 110]),
              fill=pine, anchor="mt")
    draw.rectangle((0, 170, 511, 210), fill=pine)
    _spaced(draw, (124, 181), "FAULTLINE LAND TRUST", _font("font-9", 20), paper, 2)
    return image


def clinch():
    """Bright catalogue art dominated by the cutout of an armoured work glove."""
    blue = "#172852"
    sky = "#91acd2"
    orange = "#f1663f"
    image = Image.new("RGB", SIZE, sky)
    draw = ImageDraw.Draw(image)
    draw.polygon([(0, 0), (344, 0), (127, 211), (0, 211)], fill=blue)
    draw.polygon([(0, 160), (314, 0), (427, 0), (164, 211), (0, 211)], fill="#304a79")
    draw.text((25, 13), "CLINCH", font=_font("archivo-italic-variable", 93, [900, 102]),
              fill="#f7f2d6", anchor="lt")
    # Foreshortened fingers, thumb, palm and wrist, cut from flat ink shapes.
    draw.polygon([(192, 211), (239, 174), (252, 150), (247, 136), (252, 122),
                  (274, 115), (298, 122), (325, 93), (350, 78), (370, 79),
                  (380, 69), (404, 71), (413, 83), (435, 86), (450, 101),
                  (453, 123), (438, 150), (409, 172), (371, 184), (349, 211)],
                 fill=orange, outline=blue, width=5)
    draw.polygon([(254, 179), (286, 150), (322, 152), (356, 170), (336, 195),
                  (300, 211), (217, 211)], fill="#a53231", outline=blue, width=4)
    for points in [[(324, 117), (346, 93), (363, 92), (357, 109), (339, 125)],
                   [(350, 130), (373, 103), (394, 92), (403, 104), (379, 129), (367, 137)],
                   [(376, 143), (407, 112), (427, 109), (432, 121), (408, 146), (392, 150)]]:
        draw.polygon(points, fill="#ffc968", outline=blue, width=3)
    draw.line([(279, 133), (300, 138), (325, 127)], fill=blue, width=4)
    draw.text((24, 182), "HARD GRIP", font=_font("font-6", 36),
              fill="#f7f2d6", anchor="lb")
    return image


def thermowell():
    """A luminous industrial exchanger cross-section in a cool technical palette."""
    night = "#092f38"
    ice = "#d8f8ef"
    aqua = "#5ad2bb"
    image = Image.new("RGB", SIZE, night)
    draw = ImageDraw.Draw(image)
    for x in range(13, 218, 17):
        draw.line((x, 10, x, 201), fill="#17434b")
    for y in range(15, 203, 17):
        draw.line((11, y, 218, y), fill="#17434b")
    # Blue and copper pipework read as a single heat-transfer symbol from a distance.
    draw.rounded_rectangle((46, 28, 183, 174), radius=23, outline=aqua, width=5)
    draw.rectangle((62, 42, 166, 160), fill="#17434b", outline="#507c7e", width=2)
    for x in range(70, 161, 12):
        draw.line((x, 46, x, 156), fill="#4b777a", width=2)
    draw.line([(11, 62), (157, 62), (157, 82), (70, 82), (70, 102),
               (206, 102)], fill="#ff925d", width=9, joint="curve")
    draw.line([(11, 143), (157, 143), (157, 123), (71, 123)], fill=aqua,
              width=9, joint="curve")
    draw.polygon([(217, 102), (202, 92), (202, 112)], fill="#ff925d")
    draw.polygon([(58, 123), (73, 113), (73, 133)], fill=aqua)
    draw.text((115, 199), "HX / 09", font=_font("font-9", 21), fill=aqua, anchor="mb")
    draw.line((236, 21, 236, 190), fill="#507c7e", width=2)
    draw.text((259, 40), "THERMO", font=_font("chakra-petch-700", 54),
              fill=ice, anchor="lt")
    draw.text((259, 92), "WELL", font=_font("chakra-petch-700", 54),
              fill=ice, anchor="lt")
    draw.text((260, 165), "GEOTHERMAL EXCHANGERS", font=_font("font-4", 24),
              fill=aqua, anchor="lt")
    return image


def kiln_skin():
    """A product hero in a blast-furnace sunburst; the shield owns the frame."""
    image = Image.new("RGB", SIZE, "#4c1821")
    draw = ImageDraw.Draw(image)
    draw.polygon([(0, 70), (214, 10), (343, 0), (112, 211), (0, 211)], fill="#9f2931")
    draw.polygon([(282, 73), (512, 10), (512, 101), (309, 128)], fill="#762332")
    draw.polygon([(290, 125), (512, 118), (512, 182), (263, 170)], fill="#9a2930")
    draw.ellipse((147, -51, 367, 170), fill="#ee633b")
    draw.ellipse((164, -35, 350, 152), fill="#f69448")
    # A dark, ribbed ceramic shield with a hot rim and an offset shadow.
    draw.polygon([(194, 36), (268, 7), (336, 47), (316, 116),
                  (260, 160), (207, 117)], fill="#632028")
    draw.polygon([(180, 27), (255, 3), (324, 43), (299, 115),
                  (247, 153), (193, 108)], fill="#241e2b", outline="#ffe2a7", width=5)
    draw.polygon([(194, 36), (254, 16), (307, 47), (286, 107),
                  (246, 137), (206, 100)], fill="#4a3240")
    draw.polygon([(194, 36), (254, 16), (246, 137), (206, 100)], fill="#322837")
    for x, y in [(212, 65), (220, 83), (228, 101)]:
        draw.line((x, y, x + 23, y - 8), fill="#a47468", width=4)
        draw.line((x + 23, y - 8, x + 63, y + 6), fill="#bc8d7b", width=4)
    for x, y in [(95, 53), (117, 30), (67, 116), (355, 34), (395, 67), (418, 102),
                 (129, 83), (350, 104), (384, 117), (143, 124)]:
        draw.line((x, y, x + 18, y - 6), fill="#ffb351", width=3)
    draw.rectangle((0, 154, 511, 210), fill="#261d2b")
    draw.text((18, 161), "KILN SKIN", font=_font("font-0", 54),
              fill="#ffe2a7", anchor="lt")
    draw.text((486, 178), "CERAMIC SHIELD", font=_font("font-4", 26),
              fill="#ff956c", anchor="rt")
    return image


def vanta_glass():
    """A restrained atelier ad focused on the facets of a carved obsidian object."""
    vellum = "#dfcabe"
    ink = "#342631"
    image = Image.new("RGB", SIZE, vellum)
    draw = ImageDraw.Draw(image)
    draw.rectangle((8, 8, 503, 202), outline="#8e6c72", width=1)
    draw.rectangle((278, 9, 502, 201), fill="#342631")
    draw.line((295, 184, 483, 184), fill="#8b636f", width=1)
    draw.ellipse((298, 168, 482, 191), fill="#2a212d")
    # A single carved mineral vessel, with iridescence confined to the polish.
    draw.polygon([(333, 38), (410, 26), (449, 57), (441, 127), (408, 176),
                  (358, 174), (325, 135), (318, 74)], fill="#12111a")
    draw.polygon([(333, 38), (410, 26), (449, 57), (392, 72), (318, 74)],
                 fill="#666074")
    draw.polygon([(342, 44), (406, 34), (432, 54), (389, 65), (333, 65)],
                 fill="#18141e")
    draw.line([(342, 44), (406, 34), (432, 54)], fill="#b5a0a0", width=2)
    draw.polygon([(318, 74), (357, 79), (370, 128), (358, 174), (325, 135)],
                 fill="#30273b")
    draw.polygon([(357, 79), (392, 72), (420, 116), (408, 176), (370, 128)],
                 fill="#44384e")
    draw.polygon([(392, 72), (449, 57), (441, 127), (408, 176), (420, 116)],
                 fill="#251f33")
    draw.line([(321, 75), (357, 80), (371, 127), (409, 175)], fill="#946963", width=3)
    draw.line([(333, 40), (320, 70), (326, 134)], fill="#b48173", width=2)
    draw.line((30, 39, 81, 39), fill="#8e6c72", width=2)
    _spaced(draw, (26, 66), "VANTA", _font("archivo-variable", 65, [465, 91]), ink, 4)
    _spaced(draw, (30, 137), "GLASS ATELIER", _font("font-7", 19), ink, 3)
    _spaced(draw, (30, 168), "CARVED OBSIDIAN", _font("font-8", 15), "#6b4e54", 2)
    return image


PAINTERS = {
    "faultline": (quarry, ground_two, clinch),
    "cinderline": (thermowell, kiln_skin, vanta_glass),
}
