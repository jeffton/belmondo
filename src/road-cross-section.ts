import * as THREE from "three";
import type { RoadBounds, Track, TrackFrame } from "./track.ts";

interface ForkCrossSection {
  left: THREE.Vector3;
  centre: THREE.Vector3;
  right: THREE.Vector3;
}
export type RoadSurfaceFrame = TrackFrame &
  RoadBounds & {
    branch?: number;
    forkBoundary?: ForkCrossSection;
  };
const forkSections = new WeakMap<Track, Map<number, ForkCrossSection>>();

/** Exact authored fork endpoints share one common-road cross-section. */
export function roadFrame(
  track: Track,
  station: number,
  branch = 0,
): RoadSurfaceFrame {
  const frame = track.frame(station, branch) as RoadSurfaceFrame;
  Object.assign(frame, track.bounds(frame.u * track.length, branch));
  frame.branch = branch;
  const boundary = track.config.split.find((u) => station === u * track.length);
  if (boundary === undefined) return frame;
  const common = track.frame(station, 0);
  let sections = forkSections.get(track);
  if (!sections) {
    sections = new Map();
    forkSections.set(track, sections);
  }
  let section = sections.get(boundary);
  if (!section) {
    section = {
      left: common.p.clone().addScaledVector(common.right, -common.width),
      centre: common.p.clone(),
      right: common.p.clone().addScaledVector(common.right, common.width),
    };
    sections.set(boundary, section);
  }
  Object.assign(frame, common);
  frame.forkBoundary = section;
  if (frame.seam) frame.seam = section.centre.clone();
  return frame;
}

function boundaryFraction(frame: RoadSurfaceFrame, fraction: number) {
  return frame.branch && frame.connected
    ? frame.innerSide === 1
      ? fraction / 2
      : 0.5 + fraction / 2
    : fraction;
}
function boundaryPoint(frame: RoadSurfaceFrame, fraction: number, y: number) {
  const section = frame.forkBoundary!;
  return (
    fraction <= 0.5
      ? section.left.clone().lerp(section.centre, fraction * 2)
      : section.centre.clone().lerp(section.right, fraction * 2 - 1)
  ).addScaledVector(frame.up, y);
}

/** Shared top/concrete strip tessellation; UVs retain the full original width. */
export function roadStrip(
  track: Track,
  a: RoadSurfaceFrame,
  b: RoadSurfaceFrame,
  x: readonly number[],
  y: number,
  fractions: readonly [number, number],
  fullDeck: boolean,
) {
  const v0 = (a.u * track.length) / 32;
  const v1 = ((b.u < a.u ? b.u + 1 : b.u) * track.length) / 32;
  const at = (frame: RoadSurfaceFrame, value: number, fraction: number) =>
    fullDeck && frame.forkBoundary
      ? boundaryPoint(frame, boundaryFraction(frame, fraction), y)
      : roadPoint(frame, value, y);
  const [left, right] = fractions;
  const p = [
    at(a, x[0], left),
    at(a, x[1], right),
    at(b, x[2], right),
    at(b, x[3], left),
  ];
  const uv = [
    [x[0] / 32, v0],
    [x[1] / 32, v0],
    [x[2] / 32, v1],
    [x[3] / 32, v1],
  ];
  const ends = [0, 0, 1, 1];
  const splitA = fullDeck && !a.branch && a.forkBoundary;
  const splitB = fullDeck && !b.branch && b.forkBoundary;
  const midpoint = (left + right) / 2;
  let indices = [0, 2, 1, 0, 3, 2];
  if (splitA) {
    p.push(at(a, (x[0] + x[1]) / 2, midpoint));
    uv.push([(x[0] + x[1]) / 64, v0]);
    ends.push(0);
  }
  if (splitB) {
    p.push(at(b, (x[2] + x[3]) / 2, midpoint));
    uv.push([(x[2] + x[3]) / 64, v1]);
    ends.push(1);
  }
  if (splitA && splitB) indices = [0, 5, 4, 0, 3, 5, 4, 2, 1, 4, 5, 2];
  else if (splitA) indices = [0, 2, 4, 4, 2, 1, 0, 3, 2];
  else if (splitB) indices = [0, 2, 1, 0, 4, 2, 0, 3, 4];
  return { p, uv, indices, ends };
}

/** The renderer's exact longitudinal stations, including coplanar fork tips. */
export function roadStations(track: Track): number[] {
  const cfg = track.config;
  const steps = Math.ceil(track.length / 5);
  const stations = [
    ...new Set([
      ...Array.from({ length: steps + 1 }, (_, i) => i / steps),
      ...cfg.split.filter((u) => u >= 0 && u <= 1),
      ...(cfg.ramp ? [cfg.ramp.start] : []),
      ...(cfg.jump === null ? [] : [cfg.jump, cfg.jump + cfg.gapLength!]),
    ]),
  ].sort((a, b) => a - b);
  const connectedAt = (u: number) => {
    const f = track.frame(u * track.length, -1);
    return track.bounds(f.u * track.length, -1).connected;
  };
  const transitions = [];
  for (let i = 0; i < stations.length - 1; i++) {
    let left = stations[i],
      right = stations[i + 1];
    if (left < cfg.split[0] || right > cfg.split[1]) continue;
    const leftConnected = connectedAt(left);
    if (leftConnected === connectedAt(right)) continue;
    while (true) {
      const middle = (left + right) / 2;
      if (middle === left || middle === right) break;
      if (connectedAt(middle) === leftConnected) left = middle;
      else right = middle;
    }
    transitions.push(leftConnected ? left : right);
  }
  stations.push(...transitions);
  stations.sort((a, b) => a - b);
  return stations;
}

/** The renderer's exact banked edge position, including a shared fork seam. */
export function roadPoint(
  frame: RoadSurfaceFrame,
  x: number,
  y: number,
): THREE.Vector3 {
  if (frame.forkBoundary) {
    const fraction = (x - frame.clipMin) / (frame.clipMax - frame.clipMin);
    return boundaryPoint(frame, boundaryFraction(frame, fraction), y);
  }
  const inner =
    frame.seam &&
    ((frame.innerSide === 1 && x === frame.clipMax) ||
      (frame.innerSide === -1 && x === frame.clipMin));
  return (
    inner
      ? frame.seam!.clone()
      : frame.p.clone().addScaledVector(frame.right, x)
  ).addScaledVector(frame.up, y);
}
