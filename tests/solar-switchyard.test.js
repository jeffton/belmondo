import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { createTerrain } from "../src/terrain.ts";
import { buildCoastSolarPlaces } from "../src/coast-solar-places.ts";

test("Solar collector landscape has grounded service spines and bearing racks beneath its plates", () => {
  const track = makeTrack(TRACK_INDEX.SOLAR);
  const terrain = createTerrain(track);
  const concrete = new THREE.Texture();
  const root = buildCoastSolarPlaces(
    new THREE.Group(),
    track,
    { concrete, paint: concrete },
    { terrain, heightAt: terrain.heightAt },
  );
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const yards = root.userData.sites.filter((site) =>
    site.name.startsWith("COLLECTOR TERRACE"),
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
      // A service bus runs the full terrace length, on a real continuous wall.
      for (const z of [-25, 0, 25]) {
        ray.set(local(-49, 9, z), new THREE.Vector3(0, -1, 0));
        ray.far = 2;
        const bus = ray.intersectObject(root, true)[0];
        assert(bus, "missing low service spine");
        assert(Math.abs(bus.point.y - yard.floor - 8) < 0.002);
        for (const y of [0.1, 3, 5.9]) {
          ray.set(local(-56, y, z), right);
          const support = ray.intersectObject(root, true)[0];
          assert(support, `service wall missing at ${y}`);
          assert(Math.abs(support.distance - 1) < 0.002);
        }
      }
      // Check actual instanced plate and bearing geometry, not metadata alone.
      for (const z of [-18, 0, 18]) {
        ray.set(local(-28, 20, z), new THREE.Vector3(0, -1, 0));
        ray.far = 12;
        const plate = ray.intersectObject(root, true)[0];
        assert(plate, "collector plate missing");
        assert(
          plate.point.y > yard.floor + 10 && plate.point.y < yard.floor + 11,
          `${yard.name} z=${z}: first surface is ${plate.point.y - yard.floor}`,
        );
        ray.set(local(-31, 7, z), right);
        ray.far = 2;
        const rack = ray.intersectObject(root, true)[0];
        assert(rack, "plate bearing rack missing");
        assert(Math.abs(rack.distance - 1.5) < 0.002);
      }
    }
  } finally {
    const materials = new Set(),
      geometries = new Set();
    root.traverse((mesh) => {
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry);
      materials.add(mesh.material);
      mesh.dispose();
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    concrete.dispose();
    terrain.geometries.forEach((geometry) => geometry.dispose());
  }
});
