// Eight hand-lettered campaigns share one GPU texture and the existing batches.
export const ROADSIDE_ART = {
  url: "/art/roadside-campaigns.webp",
  width: 1024,
  height: 844,
  columns: 2,
  rows: 4,
  region: [0, 0, 1, 1],
};

// Region coordinates use image-space top-left origin. Three.js UVs start below.
export function advertisingCellUV(
  brand: number,
  columns: number,
  rows: number,
  region = [0, 0, 1, 1],
) {
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
