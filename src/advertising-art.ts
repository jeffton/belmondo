const COURSE_RAILS: Record<string, number[]> = {
  "PALM BREAKER": [0x71f7de, 0xf66989, 0xffc273],
  MONSOON: [0xe6f68a, 0xa4f3ce, 0x28adb6],
  WHITEOUT: [0xf05236, 0x83b6e4, 0xdbefff],
  "SOLAR ARRAY": [0xcf4830, 0xfff4a7, 0xf7ae37],
  FAULTLINE: [0xfbac34, 0xf6dc91, 0xbd742f],
  CINDERLINE: [0xec4536, 0xffa54a, 0xffdfb7],
  NOCTILUCENT: [0xfa7b6c, 0xf6d399, 0x787ebe],
  "VESPER CIRCUIT": [0x6bf2e4, 0xca4f98, 0xf9f08a],
};

export function courseAdvertisingArt(name: string) {
  return {
    url: `/art/course-billboards/${name.toLowerCase().replaceAll(" ", "-")}.webp`,
    width: 512,
    height: 633,
    columns: 1,
    rows: 3,
    region: [0, 0, 1, 1],
    rails: COURSE_RAILS[name],
  };
}

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
