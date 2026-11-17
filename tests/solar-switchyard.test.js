import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { createTerrain } from "../src/terrain.ts";
import { buildSolarCollectorHillside } from "../src/solar-collector-hillside.ts";

test("Solar collector bands form one supported hillside and clear both fork corridors", () => {
  const track = makeTrack(TRACK_INDEX.SOLAR);
  const terrain = createTerrain(track);
  const texture = new THREE.Texture();
  const root = buildSolarCollectorHillside(
    new THREE.Group(),
    track,
    { concrete: texture, paint: texture },
    { terrain, heightAt: terrain.heightAt },
  );
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const panels = root.children.filter(
    (mesh) => mesh.name === "collector-panel",
  );
  assert(panels.length > 0);
  for (const corners of root.userData.panels) {
    const middle = corners
      .reduce((p, q) => p.add(q), new THREE.Vector3())
      .multiplyScalar(0.25);
    ray.set(
      middle.clone().add(new THREE.Vector3(0, 3, 0)),
      new THREE.Vector3(0, -1, 0),
    );
    ray.far = 6;
    assert(
      ray.intersectObjects(panels).length > 0,
      "collector ribbon has a missing surface",
    );
    for (const p of [...corners, middle]) {
      assert(
        terrain.heightAt(p.x, p.z) < p.y,
        "a collector surface is buried in the final terrain",
      );
      for (const f of terrain.samples)
        assert(
          Math.hypot(p.x - f.p.x, p.z - f.p.z) > f.width + 8,
          "collector crosses a route corridor",
        );
    }
  }
  // Check the actual retaining-edge geometry reaches the same terrain triangles
  // used by physics, not an independently calculated landscape height.
  const edges = root.children.filter((mesh) => mesh.name === "collector-edge");
  const emitted = edges.flatMap((mesh) => {
    const p = mesh.geometry.attributes.position;
    return Array.from({ length: p.count }, (_, i) =>
      new THREE.Vector3().fromBufferAttribute(p, i),
    );
  });
  for (const foot of root.userData.groundingContacts) {
    assert(Math.abs(foot.y - terrain.heightAt(foot.x, foot.z) + 1) < 0.001);
    assert(
      emitted.some((p) => p.distanceTo(foot) < 0.001),
      "ground contact has no emitted retaining edge",
    );
  }
  const geometries = new Set(),
    materials = new Set();
  root.traverse((mesh) => {
    if (mesh.isMesh) {
      geometries.add(mesh.geometry);
      materials.add(mesh.material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  terrain.geometries.forEach((geometry) => geometry.dispose());
  texture.dispose();
});
