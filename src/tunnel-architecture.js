// Relief sits behind the original wall or above the original 16m ceiling.
// Racing geometry, tunnel classification and the audio enclosure stay in Track.
const PALETTES = {
  "SOLAR ARRAY": {
    wall: 0xc5b39b,
    base: 0x696660,
    roof: 0x858b87,
    pier: 0xd1c6ac,
    light: 0xffd9a0,
    inset: 0x414e55,
    spacing: 36,
    shoulder: 11,
    chamfer: 4,
  },
  NOCTILUCENT: {
    wall: 0x687b94,
    base: 0x354559,
    roof: 0x52647b,
    pier: 0x9aa8b6,
    light: 0xb5e4ed,
    inset: 0x293344,
    spacing: 28,
    shoulder: 13,
    chamfer: 2,
  },
  MONSOON: {
    wall: 0x8faaa3,
    base: 0x476364,
    roof: 0x64837e,
    pier: 0xb1bfb0,
    light: 0xd9eec0,
    inset: 0x334e53,
    spacing: 24,
    shoulder: 10,
    chamfer: 6,
  },
};

/** Solid plinths, recessed wall bays and a load-bearing chamfered vault. */
export function tunnelSegment(a, b, track) {
  const palette = PALETTES[track.config.name];
  const quads = [];
  const s = a.u * track.length;
  const { spacing, shoulder, chamfer } = palette;
  const rib =
    Math.floor(s / spacing) !== Math.floor((b.u * track.length) / spacing);
  const recess = rib ? 0 : 0.85;
  const point = (f, x, y) =>
    f.p.clone().addScaledVector(f.right, x).addScaledVector(f.up, y);
  const xAt = (f, x) => Math.sign(x) * (f.width + Math.abs(x));
  const panel = (x0, y0, x1, y1, color, kind = "concrete") => {
    quads.push({
      p: [
        point(a, xAt(a, x0), y0),
        point(b, xAt(b, x0), y0),
        point(b, xAt(b, x1), y1),
        point(a, xAt(a, x1), y1),
      ],
      color,
      kind,
      uv: [
        [s / 24, y0 / 8],
        [(b.u * track.length) / 24, y0 / 8],
        [(b.u * track.length) / 24, y1 / 8],
        [s / 24, y1 / 8],
      ],
    });
  };
  for (const side of [-1, 1]) {
    const edge = side * 0.001;
    const wall = side * (recess + 0.001);
    panel(edge, 0, edge, 4, palette.base, "edge");
    panel(edge, 4, wall, 4.35, palette.pier, "edge");
    if (rib) {
      panel(wall, 4.35, wall, 6.3, palette.pier);
      panel(wall, 6.3, wall, 6.8, palette.inset, "edge");
      panel(wall, 6.8, wall, 7.6, palette.light, "light");
      panel(wall, 7.6, wall, 8, palette.inset, "edge");
      panel(wall, 8, wall, shoulder, palette.pier);
    } else {
      panel(wall, 4.35, wall, 8.6, palette.wall);
      panel(wall, 8.6, wall, 9.5, palette.inset, "edge");
      panel(wall, 9.5, wall, shoulder, palette.wall);
    }
    panel(
      wall,
      shoulder,
      side * (chamfer + recess),
      16 + recess,
      palette.roof,
      "tunnel",
    );
    if (rib) {
      // Close the returns to the adjacent recessed lining at both bay ends.
      for (const f of [a, b]) {
        const profile = [
          [0.001, 4.35],
          [0.001, shoulder],
          [chamfer, 16],
        ];
        for (let j = 0; j < profile.length - 1; j++) {
          const [x, y] = profile[j],
            [nx, ny] = profile[j + 1];
          quads.push({
            p: [
              point(f, side * (f.width + x), y),
              point(f, side * (f.width + nx), ny),
              point(
                f,
                side * (f.width + nx + 0.85),
                ny + (ny === 16 ? 0.85 : 0),
              ),
              point(f, side * (f.width + x + 0.85), y),
            ],
            color: palette.base,
            kind: "edge",
          });
        }
      }
    }
  }
  quads.push({
    p: [
      point(a, -a.width - chamfer - recess, 16 + recess),
      point(b, -b.width - chamfer - recess, 16 + recess),
      point(b, b.width + chamfer + recess, 16 + recess),
      point(a, a.width + chamfer + recess, 16 + recess),
    ],
    color: palette.roof,
    kind: "tunnel",
    uv: [
      [0, s / 24],
      [0, (b.u * track.length) / 24],
      [2, (b.u * track.length) / 24],
      [2, s / 24],
    ],
  });
  if (rib)
    for (const f of [a, b])
      quads.push({
        p: [
          point(f, -f.width - chamfer, 16),
          point(f, f.width + chamfer, 16),
          point(f, f.width + chamfer + 0.85, 16.85),
          point(f, -f.width - chamfer - 0.85, 16.85),
        ],
        color: palette.base,
        kind: "edge",
      });
  return quads;
}
