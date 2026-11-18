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
    skyGlow: [[198, 136, 108], 0.07],
    hemisphere: [0xa6b6cb, 0x514038],
    key: [0xbdc9de, 1.1],
    fill: [0xd1a383, 0.4],
    sun: null,
    halo: [0x9fc9e1, 0.08],
    flare: false,
  },
  "PALM BREAKER": {
    direction: [-0.73, 0.57, 0.33],
    skyGlow: [[184, 224, 245], 0.1],
    hemisphere: [0xe2f4ff, 0x68948e],
    key: [0xffefcf, 2.1],
    fill: [0xb4e0e1, 0.48],
    sun: ["#fffaf0", "#f9eabf", "#e2cdb7"],
    halo: [0xffe4b8, 0.15],
    flare: false,
  },
  "SOLAR ARRAY": {
    direction: [0.75, 0.18, -0.6],
    skyGlow: [[246, 180, 111], 0.2],
    hemisphere: [0xbacde8, 0x4f3a31],
    key: [0xffcc92, 2.5],
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
    // Snow bounce lifts the downward-facing architecture as well as the drifts.
    hemisphere: [0xcce8f4, 0xa8c4cd],
    key: [0xe2edf3, 1.35],
    fill: [0xb2c7d4, 0.45],
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
    // Heat and mineral dust lift the bridge soffits from below while the
    // existing directional key keeps their upper silhouette dark and solid.
    hemisphere: [0xb2b5c6, 0xd09259],
    key: [0xffc290, 1.9],
    fill: [0x81778b, 0.25],
    sun: ["#fff3d2", "#ffd198", "#d28d65"],
    halo: [0xffaa82, 0.22],
    flare: true,
  },
};
