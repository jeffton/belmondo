// Generated board retained byte-for-byte. UVs exclude its white presentation
// margins; all eight campaigns share one texture and the existing spatial batches.
export const ROADSIDE_ART = {
  url: "/art/belmondo-graphic-campaigns.png",
  width: 2170,
  height: 725,
  columns: 4,
  rows: 2,
  region: [0, 160 / 725, 1, 566 / 725],
};

// Region coordinates use image-space top-left origin. Three.js UVs start below.
export function advertisingCellUV(brand, columns, rows, region = [0, 0, 1, 1]) {
  const [left, top, right, bottom] = region;
  const width = (right - left) / columns;
  const height = (bottom - top) / rows;
  const x = left + (brand % columns) * width;
  const y = top + Math.floor(brand / columns) * height;
  // A cell-relative gutter excludes neighbouring artwork at minified mip levels.
  const insetX = width * 0.008;
  const insetY = height * 0.012;
  return [
    [x + insetX, 1 - y - height + insetY],
    [x + width - insetX, 1 - y - height + insetY],
    [x + width - insetX, 1 - y - insetY],
    [x + insetX, 1 - y - insetY],
  ];
}
