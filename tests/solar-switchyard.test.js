import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack } from "../src/track.js";
import { createTerrain } from "../src/terrain.js";
import { buildRouteDistricts } from "../src/route-districts.js";

test("Solar collector yard has low connected busbars with continuous grounded supports", () => {
  const track = makeTrack(1);
  const terrain = createTerrain(track);
  const concrete = new THREE.Texture();
  const root = buildRouteDistricts(
    new THREE.Group(),
    track,
    { concrete },
    { terrain, heightAt: terrain.heightAt },
  );
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const yards = root.userData.footprints.filter(
    (f) => f.district === "COLLECTOR YARD",
  );
  try {
    assert(yards.length > 0);
    for (const yard of yards) {
      const right = new THREE.Vector3(...yard.right);
      const forward = new THREE.Vector3(...yard.forward);
      const local = (x, y, z) =>
        new THREE.Vector3(...yard.center)
          .addScaledVector(right, x)
          .addScaledVector(forward, z)
          .setY(yard.floor + y);
      const depth = yard.depth - 6;
      for (const z of [-depth * 0.3, depth * 0.3]) {
        for (const x of [-15, -9, 0, 9, 15]) {
          ray.set(local(x, 16, z), new THREE.Vector3(0, -1, 0));
          ray.far = 2;
          const hit = ray.intersectObject(root, true)[0];
          assert(hit, "busbar must span both cabinets and its end posts");
          assert(Math.abs(hit.point.y - yard.floor - 15) < 0.002);
        }
        // Raycast the real post sides at several heights: supports must run
        // from the foundation to the busbar, not just appear at the top.
        for (const y of [0.1, 7, 13.9]) {
          ray.set(local(-17, y, z), right);
          ray.far = 2;
          const hit = ray.intersectObject(root, true)[0];
          assert(hit, `missing continuous support at height ${y}`);
          assert(
            Math.abs(hit.distance - 1.25) < 0.002,
            `post hit ${hit.distance} at ${y}`,
          );
          ray.set(local(17, y, z), right.clone().negate());
          const other = ray.intersectObject(root, true)[0];
          assert(other, `missing opposite support at height ${y}`);
          assert(Math.abs(other.distance - 1.25) < 0.002);
        }
      }
      // Inspect emitted geometry, not metadata: aerial crosses must be gone.
      root.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const positions = mesh.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const p = new THREE.Vector3().fromBufferAttribute(positions, i);
          const delta = p.clone().sub(new THREE.Vector3(...yard.center));
          if (
            Math.abs(delta.dot(right)) <= 17.01 &&
            Math.abs(delta.dot(forward)) <= depth / 2 + 0.01
          )
            assert(p.y <= yard.floor + 15.002, "collector exceeds low skyline");
        }
      });
    }
  } finally {
    const materials = new Set();
    root.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      materials.add(mesh.material);
    });
    materials.forEach((material) => material.dispose());
    concrete.dispose();
    terrain.geometries.forEach((geometry) => geometry.dispose());
  }
});
