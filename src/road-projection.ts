import * as THREE from "three";
import { clamp, mod, roadBounds } from "./track.ts";
import type { Track, RoadBounds } from "./track.ts";

export interface RoadProjection extends RoadBounds {
  s: number;
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  wallAxis: THREE.Vector3;
  bank: number;
  x: number;
  distance: number;
  width: number;
  branch: number;
}

// Altitude of the actual local road plane at any world XZ position.
export function roadHeight(
  road: Pick<RoadProjection, "point" | "up">,
  position: THREE.Vector3Like,
) {
  return (
    road.point.y -
    (road.up.x * (position.x - road.point.x) +
      road.up.z * (position.z - road.point.z)) /
      road.up.y
  );
}

export const ROAD_LOOK_BEHIND = 32;
export const ROAD_LOOK_AHEAD = 48;

// Search only the connected neighbourhood, never a spatially nearby remote turn.
export function projectRoad(
  track: Track,
  position: THREE.Vector3,
  anchor: number,
  branch: number,
): RoadProjection {
  const step = 4;
  let best: RoadProjection | null = null;
  const [start, end] = track.config.split;
  let boundaryLap = Number.NaN;
  let boundaries: number[] = [];
  const nextCandidates = [0];
  const cachedFrameS = [Number.NaN, Number.NaN, Number.NaN];
  const cachedFrames: Array<ReturnType<Track["frame"]> | undefined> = [
    undefined,
    undefined,
    undefined,
  ];
  const from = anchor - ROAD_LOOK_BEHIND;
  const to = anchor + ROAD_LOOK_AHEAD;
  const origin = Math.floor(from / track.length) * track.length;
  const epsilon = 1e-7;
  // The search window limits eligible stations without moving their chords.
  // Repeat the same grid each lap so clearance doesn't change at lap wrap.
  for (let s = origin + Math.floor((from - origin) / step) * step; s < to;) {
    const lap = Math.floor((s + epsilon) / track.length);
    const lapStart = lap * track.length;
    const launch =
      track.config.jump === null
        ? null
        : (lap + track.config.jump) * track.length;
    if (lap !== boundaryLap) {
      boundaries = [
        start,
        end,
        ...(track.config.jump === null ? [] : [track.config.jump]),
      ].map((u) => (lap + u) * track.length);
      boundaryLap = lap;
    }
    nextCandidates[0] = Math.min(
      (lap + 1) * track.length,
      lapStart + (Math.floor((s - lapStart + epsilon) / step) + 1) * step,
    );
    for (const boundary of boundaries) {
      if (boundary > s + epsilon) nextCandidates.push(boundary);
    }
    const next = Math.min(...nextCandidates);
    nextCandidates.length = 1;
    // Never construct a sloping contact segment across the vertical lip into empty space.
    const sampleEnd =
      launch !== null && Math.abs(next - launch) < epsilon ? next - 1e-6 : next;
    if (sampleEnd <= s || sampleEnd < from) {
      s = next;
      continue;
    }
    const u = mod((s + next) / 2, track.length) / track.length;
    const connected =
      branch && roadBounds(track, (s + next) / 2, branch).connected;
    const branches =
      u > start && u < end ? (branch && !connected ? [branch] : [-1, 1]) : [0];
    for (const route of branches) {
      const cacheIndex = route + 1;
      const cachedFrame = cachedFrames[cacheIndex];
      const a =
        cachedFrameS[cacheIndex] === s && cachedFrame
          ? cachedFrame
          : track.frame(s, route);
      const b = track.frame(sampleEnd, route);
      cachedFrameS[cacheIndex] = sampleEnd;
      cachedFrames[cacheIndex] = b;
      const dx = b.p.x - a.p.x,
        dz = b.p.z - a.p.z;
      const t = clamp(
        ((position.x - a.p.x) * dx + (position.z - a.p.z) * dz) /
          (dx * dx + dz * dz),
        Math.max(0, (from - s) / (sampleEnd - s)),
        Math.min(1, (to - s) / (sampleEnd - s)),
      );
      const point = a.p.clone().lerp(b.p, t);
      const distance =
        (position.x - point.x) ** 2 +
        (position.z - point.z) ** 2 +
        (route ? (position.y - point.y - 2.2) ** 2 : 0);
      if (best && distance >= best.distance) continue;
      const tangent = b.p.clone().sub(a.p).normalize();
      const contactS = s + t * (sampleEnd - s);
      // A search segment may straddle the merge boundary. Its midpoint being
      // connected does not permit a result on the other, disconnected deck.
      if (
        branch &&
        route &&
        route !== branch &&
        (!roadBounds(track, anchor, branch).connected ||
          !roadBounds(track, contactS, route).connected)
      )
        continue;
      const frame = track.frame(contactS, route);
      const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
      const bank = Math.atan2(
        -frame.right.y,
        Math.hypot(frame.tangent.x, frame.tangent.z) * frame.right.dot(right),
      );
      const wallAxis = right.clone().divideScalar(Math.cos(bank));
      right.applyAxisAngle(tangent, -bank);
      const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
      const lateral = position.clone().sub(point).dot(wallAxis);
      best = {
        ...roadBounds(track, contactS, route),
        s: contactS,
        point,
        tangent,
        right,
        up,
        wallAxis,
        bank,
        x: lateral,
        distance,
        width: a.width + (b.width - a.width) * t,
        branch: route,
      };
    }
    s = next;
  }
  // Every finite anchor samples at least one connected road segment.
  return best!;
}
