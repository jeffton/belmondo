// One world-space key per course; colours describe the local atmosphere.
import * as THREE from "three";

// Shared by main-thread lighting and CPU sky preparation in the worker.
export function celestialDirection(course: string) {
  return new THREE.Vector3(...COURSE_LIGHTING[course].direction).normalize();
}

export interface CourseLighting {
  direction: [number, number, number];
  skyGlow: [[number, number, number], number];
  hemisphere: [number, number];
  key: [number, number];
  fill: [number, number];
  sun: [string, string, string] | null;
  halo: [number, number];
  flare: boolean;
}
export const COURSE_LIGHTING: Record<string, CourseLighting> = {
  FAULTLINE: {
    direction: [-0.52, 0.48, 0.68],
    skyGlow: [[207, 224, 213], 0.055],
    hemisphere: [0xc5dced, 0x414839],
    key: [0xfff0d1, 1.85],
    fill: [0x92b8cc, 0.42],
    sun: ["#fff9e8", "#f0e5c4", "#cad7d4"],
    halo: [0xf2e8ca, 0.12],
    flare: false,
  },
  "VESPER CIRCUIT": {
    direction: [0.25, 0.2, -0.8],
    skyGlow: [[100, 158, 186], 0.025],
    hemisphere: [0x9bb6d5, 0x232738],
    key: [0xacc7eb, 1.1],
    fill: [0x8e68b6, 0.4],
    sun: null,
    halo: [0x9fc9e1, 0.08],
    flare: false,
  },
  "KAISEKI COAST": {
    direction: [-0.8, 0.16, 0.55],
    skyGlow: [[228, 183, 160], 0.17],
    hemisphere: [0xb6c9ec, 0x393349],
    key: [0xffdfb9, 2.5],
    fill: [0x748ec3, 0.32],
    sun: ["#fff1c5", "#ffdc8c", "#ed8549"],
    halo: [0xffba80, 0.32],
    flare: true,
  },
  "SOLAR ARRAY": {
    direction: [0.75, 0.18, -0.6],
    skyGlow: [[232, 165, 128], 0.17],
    hemisphere: [0xb6c9ec, 0x393349],
    key: [0xffca97, 2.5],
    fill: [0x748ec3, 0.32],
    sun: ["#fff1c5", "#ffdc8c", "#ed8549"],
    halo: [0xffba80, 0.32],
    flare: true,
  },
  NOCTILUCENT: {
    direction: [-0.4, 0.12, -0.7],
    skyGlow: [[197, 216, 239], 0],
    hemisphere: [0x819ccf, 0x151b32],
    key: [0xa2bcf0, 1.05],
    fill: [0x6565bc, 0.28],
    sun: null,
    halo: [0xadcfff, 0.14],
    flare: false,
  },
  WHITEOUT: {
    direction: [-0.25, 0.42, 0.85],
    skyGlow: [[216, 235, 242], 0.07],
    hemisphere: [0xb8d8e8, 0x35434e],
    key: [0xd5e8f2, 1.7],
    fill: [0x86a4b9, 0.35],
    sun: ["#f4fbff", "#d6e8ef", "#9fb8c7"],
    halo: [0xd1e4f2, 0.18],
    flare: false,
  },
  MONSOON: {
    direction: [0.5, 0.32, 0.6],
    skyGlow: [[183, 211, 230], 0.07],
    hemisphere: [0xc2d7e7, 0x393a38],
    key: [0xfff3df, 2],
    fill: [0xa4b8cb, 0.42],
    sun: ["#fff8e5", "#f1dfb7", "#d6b98e"],
    halo: [0xd8e5ed, 0.12],
    flare: true,
  },
  CINDERLINE: {
    direction: [-0.6, 0.24, -0.25],
    skyGlow: [[230, 173, 139], 0.14],
    hemisphere: [0xb2b5c6, 0x292a31],
    key: [0xffc290, 2.1],
    fill: [0x8276b0, 0.35],
    sun: ["#fff3d2", "#ffd198", "#d28d65"],
    halo: [0xffaa82, 0.22],
    flare: true,
  },
};
