// Broad architectural marks survive the LOWRES framebuffer and mip filtering.
// Each district has its own tower rhythm; no per-texel occupancy noise.
const HEIGHTS = [0.42, 0.69, 0.52, 1, 0.78, 0.36, 0.61, 0.89];
const WIDTHS = [1.2, 0.8, 1.5, 1, 1.3, 0.7, 1.1, 1.4];
const TOTAL_WIDTH = WIDTHS.reduce((sum, width) => sum + width, 0);

export function vesperTower(p, district) {
  let position = p * TOTAL_WIDTH;
  let tower = 0;
  while (position >= WIDTHS[tower] && tower < WIDTHS.length - 1) {
    position -= WIDTHS[tower++];
  }
  const local = position / WIDTHS[tower];
  const identity = tower + district * 3;
  const roof = HEIGHTS[identity % HEIGHTS.length];
  // A setback crown and a narrow street gap give each block a readable outline.
  const height = local > 0.91 ? 0.045 : roof * (local < 0.22 ? 0.84 : 1);
  return { height, tower: identity, local };
}

export function vesperFacade(city, latitude, height) {
  const { local, tower } = city;
  const side = local < 0.22;
  const color = side
    ? [20, 29, 46]
    : tower % 3 === 0
      ? [33, 39, 58]
      : [27, 37, 54];
  const level = latitude / height;
  if (local > 0.88 || level < 0.18 || level > 0.87) return color;
  // Occupied office blocks, a service spine or an unlit residential tower.
  // Palette and layout belong to whole buildings, not individual source pixels.
  const warm = tower % 3 === 0;
  const light = warm ? [112, 88, 69] : [63, 105, 121];
  if (tower % 4 === 0 && local > 0.27 && local < 0.35) return light;
  const bands = tower % 4 === 1 ? [0.32, 0.62] : tower % 4 === 2 ? [0.74] : [];
  if (
    !side &&
    local > 0.3 &&
    local < (warm ? 0.78 : 0.69) &&
    bands.some((band) => Math.abs(level - band) < 0.035)
  )
    return light;
  return color;
}
