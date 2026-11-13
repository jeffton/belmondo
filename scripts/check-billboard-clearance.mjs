import * as T from "three";
import { makeTrack, TRACKS } from "../src/track.js";
import { buildEnvironment } from "../src/environment.js";
import { buildCity } from "../src/city.js";
import { buildFlagship, loadFlagshipAssets } from "../src/flagship.js";
import { buildFinishDistrict } from "../src/finish-district.js";
import { getTrackAdvertisingLayout } from "../src/advertising.js";
T.TextureLoader.prototype.load = () => new T.Texture();
const unit = new T.Box3(
  new T.Vector3(-0.5, -0.5, -0.5),
  new T.Vector3(0.5, 0.5, 0.5),
);
const triIndices = [
  0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2,
  6, 0, 6, 4, 1, 5, 7, 1, 7, 3,
];
const corners = (b) =>
  [-1, 1].flatMap((x) =>
    [-1, 1].flatMap((y) =>
      [-1, 1].map(
        (z) =>
          new T.Vector3(
            x < 0 ? b.min.x : b.max.x,
            y < 0 ? b.min.y : b.max.y,
            z < 0 ? b.min.z : b.max.z,
          ),
      ),
    ),
  );
function collide(a, b) {
  const relative = a.inverse.clone().multiply(b.matrix),
    vs = corners(b.local).map((v) => v.applyMatrix4(relative));
  for (let n = 0; n < triIndices.length; n += 3)
    if (
      a.local.intersectsTriangle(
        new T.Triangle(...triIndices.slice(n, n + 3).map((j) => vs[j])),
      )
    )
      return true;
  return (
    vs.some((v) => a.local.containsPoint(v)) ||
    corners(a.local).some((v) =>
      b.local.containsPoint(v.applyMatrix4(a.matrix).applyMatrix4(b.inverse)),
    )
  );
}
export function setup(index) {
  const track = makeTrack(index),
    scene = new T.Scene(),
    textures = {
      concrete: null,
      paint: null,
      facade: null,
      road: null,
      edge: null,
    };
  const env = buildEnvironment(scene, track, textures);
  buildCity(scene, track, textures, env);
  buildFinishDistrict(scene, track, textures, env);
  if (track.config.name === "KAISEKI COAST")
    buildFlagship(scene, track, textures, env, loadFlagshipAssets());
  scene.updateMatrixWorld(true);
  const objects = [];
  scene.traverse((m) => {
    if (!m.isMesh || m.parent?.name === "terrain-surface") return;
    const g = m.geometry;
    g.computeBoundingBox();
    for (let i = 0; i < (m.isInstancedMesh ? m.count : 1); i++) {
      const matrix = m.matrixWorld.clone();
      if (m.isInstancedMesh) {
        const inst = new T.Matrix4();
        m.getMatrixAt(i, inst);
        matrix.multiply(inst);
      }
      objects.push({
        matrix,
        inverse: matrix.clone().invert(),
        local: g.boundingBox,
        world: g.boundingBox.clone().applyMatrix4(matrix),
        geometry: g,
        name: (m.name || m.parent?.name) + "#" + i,
      });
    }
  });
  const roads = [];
  for (let s = 0; s < track.length; s += 3) {
    const u = s / track.length;
    for (const b of u > track.config.split[0] && u < track.config.split[1]
      ? [-1, 1]
      : [0])
      roads.push(track.frame(s, b));
  }
  return { track, env, objects, roads };
}
export function specAt(track, u, side, width, elevation = 0) {
  const branch =
      u > track.config.split[0] && u < track.config.split[1] ? side : 0,
    frame = track.frame(u * track.length, branch),
    normal = frame.tangent
      .clone()
      .multiplyScalar(-0.85)
      .addScaledVector(frame.right, -side * 0.55)
      .setY(0)
      .normalize(),
    yaw = Math.atan2(normal.x, normal.z),
    height = width * 0.375;
  const center = frame.p
    .clone()
    .addScaledVector(frame.right, side * (frame.width + width * 0.46 + 12));
  center.y = frame.p.y + height / 2 + 7 + elevation;
  return {
    u,
    side,
    branch,
    frame,
    center,
    yaw,
    width,
    height,
    horizontal: new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)),
  };
}
export function check(ctx, spec) {
  const { track, env, objects, roads } = ctx,
    { width: w, height: h, center, yaw, horizontal } = spec,
    volumes = [];
  function box(x, y, z, w, h, d) {
    const matrix = new T.Matrix4().compose(
      new T.Vector3(x, y, z)
        .applyAxisAngle(new T.Vector3(0, 1, 0), yaw)
        .add(center),
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
      new T.Vector3(w, h, d),
    );
    volumes.push({
      matrix,
      inverse: matrix.clone().invert(),
      local: unit,
      world: unit.clone().applyMatrix4(matrix),
    });
  }
  box(0, 0, 0, w + 1.2, h + 1.2, 1.5);
  box(0, -h / 2 - 0.9, 0.7, w + 2.8, 0.8, 2.8);
  box(-w / 2 - 0.7, 0, -0.6, 0.8, h + 3.2, 2.5);
  box(0, 0, 0.86, w, h, 0.02);
  // Include both possible rail sides/edges conservatively.
  for (const d of [-1, 1]) {
    box(d * (w / 2 + 0.6), 0, 0.95, 0.2, h + 1.5, 0.25);
    box(0, d * (h / 2 + 0.6), 0.95, w + 1.5, 0.2, 0.25);
  }
  for (const d of [-1, 1]) {
    const p = center.clone().addScaledVector(horizontal, d * w * 0.32),
      bottom = env.heightAt(p.x, p.z) - 2,
      top = center.y - h / 2 + 1;
    if (top <= bottom) return ["buried support"];
    box(d * w * 0.32, (bottom + top) / 2 - center.y, 0, 0.9, top - bottom, 1.1);
  }
  const hits = new Set();
  for (const a of volumes)
    for (const b of objects) {
      if (!a.world.intersectsBox(b.world)) continue;
      if (b.geometry.type === "BoxGeometry") {
        if (collide(a, b)) hits.add(b.name);
        continue;
      }
      const relative = a.inverse.clone().multiply(b.matrix),
        pos = b.geometry.attributes.position,
        idx = b.geometry.index;
      for (let k = 0; k < (idx ? idx.count : pos.count); k += 3) {
        const vertices = [0, 1, 2].map((j) =>
          new T.Vector3()
            .fromBufferAttribute(pos, idx ? idx.getX(k + j) : k + j)
            .applyMatrix4(relative),
        );
        if (a.local.intersectsTriangle(new T.Triangle(...vertices))) {
          hits.add(b.name);
          break;
        }
      }
    }
  for (let x = -1; x <= 1; x += 0.125)
    for (let y = -1; y <= 1; y += 0.5) {
      let p = center.clone().addScaledVector(horizontal, x * (w / 2 + 1.5));
      p.y += y * (h / 2 + 1.6);
      if (p.y <= env.heightAt(p.x, p.z) + 1) hits.add("terrain");
      for (const f of roads)
        if (
          p.y >= f.p.y - 0.5 &&
          p.y <= f.p.y + 5 &&
          Math.hypot(p.x - f.p.x, p.z - f.p.z) <= f.width + 2
        )
          hits.add("road");
    }
  for (const d of [-1, 1]) {
    let p = center.clone().addScaledVector(horizontal, d * w * 0.32),
      bottom = env.heightAt(p.x, p.z) - 2,
      top = center.y - h / 2 + 1;
    for (const f of roads)
      if (
        f.p.y + 3.3 >= bottom &&
        f.p.y <= top &&
        Math.hypot(p.x - f.p.x, p.z - f.p.z) <= f.width + 3
      )
        hits.add("support-road");
  }
  if (track.isTunnel(spec.u * track.length, spec.branch)) hits.add("tunnel");
  const [start, end] = track.config.sections.finishStraight;
  if (spec.u >= start || spec.u <= end - 1) hits.add("finish-stands");
  return [...hits];
}
if (process.argv[2] === "scan") {
  for (let index = 0; index < TRACKS.length; index++) {
    const ctx = setup(index);
    for (const spec of getTrackAdvertisingLayout(ctx.track)) {
      const hits = check(ctx, spec);
      console.log(ctx.track.config.name, spec.u, spec.side, hits);
      if (hits.length) process.exitCode = 1;
    }
    ctx.env.geometries?.forEach((g) => g.dispose());
  }
}
