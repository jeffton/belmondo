import billboardProvenance from "./course-billboard-provenance.json" with { type: "json" };

const COURSE_RAILS: Record<string, number[]> = {
  "PALM BREAKER": [0xffb78c, 0xc9f453, 0xf0d390],
  MONSOON: [0x539e8f, 0xb6c385, 0xb5cae2],
  WHITEOUT: [0x487fba, 0xe94a2e, 0xff8da7],
  "SOLAR ARRAY": [0xeab743, 0xd2af6d, 0xe78d3d],
  FAULTLINE: [0xffbd34, 0x779667, 0x94aed1],
  CINDERLINE: [0x51c1b3, 0xff9550, 0xcfb4a9],
  NOCTILUCENT: [0xec632d, 0xd998ab, 0xc5d556],
  "VESPER CIRCUIT": [0xf9388a, 0x4f63ed, 0x6ae6ea],
};

export function courseAdvertisingArt(name: string) {
  const file =
    `${name.toLowerCase().replaceAll(" ", "-")}.webp` as keyof typeof billboardProvenance.outputs;
  return {
    url: `/art/course-billboards/${file}?v=${billboardProvenance.outputs[file]}`,
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
