import * as T from "three";
import { setup } from "./check-billboard-clearance.mjs";
const temp = new T.Vector3();
function obstruction(ctx, origin, target) {
  const length = origin.distanceTo(target),
    ray = new T.Ray(origin, target.clone().sub(origin).normalize());
  for (const b of ctx.objects) {
    if (!ray.intersectsBox(b.world)) continue;
    const local = ray.clone().applyMatrix4(b.inverse);
    if (b.geometry.type === "BoxGeometry") {
      const hit = local.intersectBox(b.local, temp);
      if (
        hit &&
        hit.clone().applyMatrix4(b.matrix).distanceTo(origin) < length - 0.1
      )
        return b.name;
      continue;
    }
    const pos = b.geometry.attributes.position,
      idx = b.geometry.index;
    for (let k = 0; k < (idx ? idx.count : pos.count); k += 3) {
      const points = [0, 1, 2].map((j) =>
        new T.Vector3().fromBufferAttribute(pos, idx ? idx.getX(k + j) : k + j),
      );
      const hit = local.intersectTriangle(...points, false, temp);
      if (
        hit &&
        hit.clone().applyMatrix4(b.matrix).distanceTo(origin) < length - 0.1
      )
        return b.name;
    }
  }
  return null;
}
export function visibility(
  ctx,
  spec,
  xs = [-0.45, -0.225, 0, 0.225, 0.45],
  ys = [-0.4, 0, 0.4],
) {
  const results = [];
  for (const distance of [160, 45]) {
    const s = spec.u * ctx.track.length - distance,
      u = s / ctx.track.length,
      branch =
        u > ctx.track.config.split[0] && u < ctx.track.config.split[1]
          ? spec.side
          : 0;
    const origin = ctx.track.frame(s, branch).p.clone();
    origin.y += 8;
    const normal = new T.Vector3(Math.sin(spec.yaw), 0, Math.cos(spec.yaw));
    const failures = [];
    for (const x of xs)
      for (const y of ys) {
        const target = spec.center
          .clone()
          .addScaledVector(spec.horizontal, x * spec.width)
          .addScaledVector(normal, 0.86);
        target.y += y * spec.height;
        const hit = obstruction(ctx, origin, target);
        if (hit) failures.push({ x, y, hit });
      }
    results.push({
      distance,
      clear: xs.length * ys.length - failures.length,
      failures,
    });
  }
  return results;
}
import { getTrackAdvertisingLayout } from "../src/advertising.js";

// Regression stations where collision-free placements were hidden by towers.
for (const [course, panels] of [
  [3, [0]],
  [6, [2, 3]],
]) {
  const ctx = setup(course);
  const layout = getTrackAdvertisingLayout(ctx.track);
  for (const panel of panels) {
    const result = visibility(ctx, layout[panel]);
    console.log(ctx.track.config.name, layout[panel].u, JSON.stringify(result));
    if (result.some((view) => view.clear !== 15)) process.exitCode = 1;
  }
}
