import * as THREE from "three";
import { clamp, mod, roadBounds } from "./track.js";

// Altitude of the actual local road plane at any world XZ position.
export function roadHeight(road, position) {
  return (
    road.point.y -
    (road.up.x * (position.x - road.point.x) +
      road.up.z * (position.z - road.point.z)) /
      road.up.y
  );
}

// Search only the connected neighbourhood, never a spatially nearby remote turn.
export function projectRoad(track, position, anchor, branch) {
  const step = 4;
  let best = null;
  const [start, end] = track.config.split;
  for (let s = anchor - 32; s < anchor + 48;) {
    const lap = Math.floor(s / track.length);
    const launch = (lap + track.config.jump) * track.length;
    const boundaries = [start, end, track.config.jump].map(
      (u) => (lap + u) * track.length,
    );
    const next = Math.min(
      s + step,
      ...boundaries.filter((boundary) => boundary > s + 1e-7),
    );
    // Never construct a sloping contact segment across the vertical lip into empty space.
    const sampleEnd = Math.abs(next - launch) < 1e-7 ? next - 1e-6 : next;
    if (sampleEnd <= s) {
      s = next;
      continue;
    }
    const u = mod((s + next) / 2, track.length) / track.length;
    const connected =
      branch && roadBounds(track, (s + next) / 2, branch).connected;
    const branches =
      u > start && u < end ? (branch && !connected ? [branch] : [-1, 1]) : [0];
    for (const route of branches) {
      const a = track.frame(s, route),
        b = track.frame(sampleEnd, route);
      const dx = b.p.x - a.p.x,
        dz = b.p.z - a.p.z;
      const t = clamp(
        ((position.x - a.p.x) * dx + (position.z - a.p.z) * dz) /
          (dx * dx + dz * dz),
        0,
        1,
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
  return best;
}
