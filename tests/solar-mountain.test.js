import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.js";
import { createTerrain } from "../src/terrain.js";
import { buildCourseGeography } from "../src/course-geography.js";

function mountainScene() {
  const track = makeTrack(TRACK_INDEX.SOLAR);
  const terrain = createTerrain(track);
  const root = buildCourseGeography(
    new THREE.Scene(),
    track,
    {
      edge: new THREE.Texture(),
    },
    terrain,
  );
  return {
    track,
    terrain,
    mountain: root.getObjectByName("bored-mountain-mass"),
  };
}

// Clip actual emitted triangles, not their vertices alone: a broad rock face
// can cross a flight corridor even when all three corners are outside it.
function clip(polygon, axis, bound, direction) {
  const output = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const da = (a[axis] - bound) * direction;
    const db = (b[axis] - bound) * direction;
    if (da >= 0) output.push(a);
    if (da >= 0 !== db >= 0) output.push(a.clone().lerp(b, da / (da - db)));
  }
  return output;
}

test("Solar emitted mountain faces leave both portals, the full road and overflights open", () => {
  const { track, mountain } = mountainScene();
  const position = mountain.geometry.attributes.position;
  const triangles = [];
  for (let i = 0; i < position.count; i += 3) {
    const points = [0, 1, 2].map((j) =>
      new THREE.Vector3().fromBufferAttribute(position, i + j),
    );
    triangles.push({ points, box: new THREE.Box3().setFromPoints(points) });
  }
  const local = new THREE.Vector3();
  for (let s = 0; s < track.length; s += 6) {
    const u = s / track.length;
    const branches =
      u > track.config.split[0] && u < track.config.split[1] ? [-1, 1] : [0];
    for (const branch of branches) {
      const f = track.frame(s, branch);
      const bounds = track.bounds(s, branch);
      const corners = [];
      for (const x of [bounds.clipMin, bounds.clipMax])
        for (const y of [0.2, 14])
          for (const z of [-4, 4])
            corners.push(
              f.p
                .clone()
                .addScaledVector(f.right, x)
                .addScaledVector(f.up, y)
                .addScaledVector(f.tangent, z),
            );
      const box = new THREE.Box3().setFromPoints(corners);
      for (const triangle of triangles) {
        if (!box.intersectsBox(triangle.box)) continue;
        let polygon = triangle.points.map((p) => {
          local.copy(p).sub(f.p);
          return new THREE.Vector3(
            local.dot(f.right),
            local.dot(f.up),
            local.dot(f.tangent),
          );
        });
        for (const [axis, bound, direction] of [
          ["x", bounds.clipMin, 1],
          ["x", bounds.clipMax, -1],
          ["y", 0.2, 1],
          ["y", 14, -1],
          ["z", -4, 1],
          ["z", 4, -1],
        ]) {
          polygon = clip(polygon, axis, bound, direction);
          if (!polygon.length) break;
        }
        assert.equal(
          polygon.length,
          0,
          `rock intersects branch ${branch} flight corridor at ${u}`,
        );
      }
    }
  }
});

test("Solar mountain has subdivided irregular ridges rather than six broad extrusion planes", () => {
  const { track, mountain } = mountainScene();
  mountain.updateMatrixWorld(true);
  const [start, end] = track.config.sections.mountainTunnel;
  const f = track.frame(((start + end) / 2) * track.length);
  const right = new THREE.Vector3(f.tangent.z, 0, -f.tangent.x).normalize();
  const ray = new THREE.Raycaster();
  const heights = [];
  for (let x = -140; x <= 140; x += 4) {
    ray.set(
      f.p
        .clone()
        .addScaledVector(right, x)
        .add(new THREE.Vector3(0, 250, 0)),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = ray.intersectObject(mountain)[0];
    assert(hit, "the exterior mountain must remain a closed rock roof");
    heights.push(hit.point.y);
  }
  const ridges = heights.filter(
    (y, i) =>
      i > 0 &&
      i < heights.length - 1 &&
      y > heights[i - 1] &&
      y > heights[i + 1],
  ).length;
  assert(
    ridges >= 3,
    "the exterior needs lateral ridges and gullies, not one extruded peak",
  );
  assert.equal(mountain.material.flatShading, true);
  // This local rock remains one draw with no extra material/texture allocation.
  assert.equal(mountain.geometry.groups.length, 0);
  assert(!Array.isArray(mountain.material));
});
