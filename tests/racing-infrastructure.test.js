import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACKS } from "../src/track.js";
import { createTerrain } from "../src/terrain.js";
import { getTrackAdvertisingLayout } from "../src/advertising.js";
import { buildRacingInfrastructure } from "../src/racing-infrastructure.js";

function emittedTriangles(group) {
  const triangles = [];
  const matrix = new THREE.Matrix4();
  for (const mesh of group.children) {
    const position = mesh.geometry.getAttribute("position");
    const index = mesh.geometry.index;
    for (let instance = 0; instance < mesh.count; instance++) {
      mesh.getMatrixAt(instance, matrix);
      const count = index ? index.count : position.count;
      for (let i = 0; i < count; i += 3) {
        triangles.push(
          [0, 1, 2].map((j) =>
            new THREE.Vector3()
              .fromBufferAttribute(position, index ? index.getX(i + j) : i + j)
              .applyMatrix4(matrix),
          ),
        );
      }
    }
  }
  return triangles;
}

for (const [index, config] of TRACKS.entries()) {
  test(`${config.name}: modeled relief clears all physical route branches and billboard approach fans`, () => {
    const track = makeTrack(index);
    const before = JSON.stringify(track.config);
    const textures = {
      concrete: new THREE.Texture(),
      facade: new THREE.Texture(),
      paint: new THREE.Texture(),
    };
    const scene = new THREE.Scene();
    const result = buildRacingInfrastructure(
      scene,
      track,
      textures,
      createTerrain(track),
    );
    const triangles = emittedTriangles(result.group);
    assert(triangles.length > 0);
    assert.equal(
      JSON.stringify(track.config),
      before,
      "route/configuration must remain immutable",
    );
    assert(result.group.children.every((o) => o.isInstancedMesh));
    const materials = new Set(result.group.children.map((o) => o.material));
    assert.equal(
      materials.size,
      3,
      "three shared materials, not per-object banks",
    );
    for (const material of materials) {
      assert(Object.values(textures).includes(material.map));
      assert.equal(material.type, "MeshLambertMaterial");
    }
    const routeCells = new Map();
    // Independent denser reference: all three branches, not just main-line or
    // structure stations. This catches the Night upper/lower-route overlap.
    const count = Math.ceil(track.length / 1.5);
    for (const branch of [-1, 0, 1])
      for (let i = 0; i < count; i++) {
        const f = track.frame((i / count) * track.length, branch);
        const key = `${Math.floor(f.p.x / 50)}:${Math.floor(f.p.z / 50)}`;
        if (!routeCells.has(key)) routeCells.set(key, []);
        routeCells.get(key).push(f);
      }
    for (const triangle of triangles) {
      // Sample emitted triangle interiors as well as vertices: a lintel can
      // penetrate the road even if both ends are safely outside its rails.
      const steps = Math.ceil(
        Math.max(
          ...[0, 1, 2].map((i) =>
            triangle[i].distanceTo(triangle[(i + 1) % 3]),
          ),
        ) / 3,
      );
      for (let i = 0; i <= steps; i++)
        for (let j = 0; j <= steps - i; j++) {
          const p = triangle[0]
            .clone()
            .multiplyScalar(1 - (i + j) / steps)
            .addScaledVector(triangle[1], i / steps)
            .addScaledVector(triangle[2], j / steps);
          const x = Math.floor(p.x / 50),
            z = Math.floor(p.z / 50);
          for (let dx = -1; dx <= 1; dx++)
            for (let dz = -1; dz <= 1; dz++)
              for (const f of routeCells.get(`${x + dx}:${z + dz}`) || []) {
                if (Math.abs(p.y - f.p.y - 4) > 12) continue;
                assert(
                  Math.hypot(p.x - f.p.x, p.z - f.p.z) > f.width + 5,
                  `emitted surface intrudes into racing rails/16m void at ${p.toArray()}`,
                );
              }
        }
    }
    for (const ad of getTrackAdvertisingLayout(track)) {
      for (const approach of [160, 120, 60, 45, 30]) {
        const curated = approach === 160 || approach === 45;
        const s = ad.u * track.length - approach;
        const u = s / track.length;
        const branch = curated
          ? u > config.split[0] && u < config.split[1]
            ? ad.side
            : 0
          : ad.branch;
        const eye = track.frame(s, branch).p.clone();
        eye.y += curated ? 8 : 5;
        const targets = [ad.center, ...ad.corners];
        if (curated) {
          const normal = new THREE.Vector3(
            Math.sin(ad.yaw),
            0,
            Math.cos(ad.yaw),
          );
          for (const x of [-0.45, -0.225, 0, 0.225, 0.45])
            for (const y of [-0.4, 0, 0.4]) {
              const target = ad.center
                .clone()
                .addScaledVector(ad.horizontal, x * ad.width)
                .addScaledVector(normal, 0.86);
              target.y += y * ad.height;
              targets.push(target);
            }
        }
        for (const target of targets) {
          const ray = new THREE.Ray(eye, target.clone().sub(eye).normalize());
          for (const [a, b, c] of triangles) {
            const hit = ray.intersectTriangle(
              a,
              b,
              c,
              false,
              new THREE.Vector3(),
            );
            assert(
              !hit || hit.distanceTo(eye) >= target.distanceTo(eye),
              `relief masks billboard ${ad.u} at ${approach} m`,
            );
          }
        }
      }
    }
    const expected = [2, 3, 1, 1, 1, 1, 3][index];
    assert.equal(
      result.assemblies.length,
      expected,
      "authored landmarks must not disappear silently",
    );
    if (config.name === "SOLAR ARRAY")
      assert.equal(
        result.assemblies.filter((a) => a.kind === "paired-tunnel-threshold")
          .length,
        2,
      );
  });
}
