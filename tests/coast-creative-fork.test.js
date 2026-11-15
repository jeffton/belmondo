import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.js";
import { createTerrain } from "../src/terrain.js";
import { buildForkEnvironments } from "../src/fork-environments.js";

const track = makeTrack(TRACK_INDEX.COAST);

test("Coast fork joins at level shared noses without changing progression identity", () => {
  assert.equal(track.config.layoutId, "coast-4-finish-end");
  for (const u of track.config.split) {
    const a = track.frame(u * track.length, -1);
    const b = track.frame(u * track.length, 1);
    assert(a.p.distanceTo(b.p) < 0.002);
    assert(a.tangent.dot(b.tangent) > 0.9999);
    assert(track.bounds(u * track.length, -1).connected);
    assert(track.bounds(u * track.length, 1).connected);
  }
});

test("Coast gallery follows an authored reverse bend rather than a scaled parallel offset", () => {
  const [start, end] = track.config.split;
  const displacements = [];
  for (const phase of [0.35, 0.65]) {
    const s = (start + (end - start) * phase) * track.length;
    const base = track.frame(s);
    const inner = track.frame(s, -1);
    const ordinaryOffset =
      track.config.fork.offsets[0] * Math.sin(Math.PI * phase) ** 2;
    displacements.push(
      inner.p.clone().sub(base.p).dot(base.right) - ordinaryOffset,
    );
  }
  assert(displacements[0] > 5, "first half moves toward the gallery entry");
  assert(
    displacements[1] < -5,
    "second half reverses the physical road alignment",
  );
});

test("Coast gallery and sea-side structures leave both complete racing corridors clear", () => {
  const terrain = createTerrain(track);
  const scene = new THREE.Scene();
  const textures = { rock: null, concrete: null, edge: null, facade: null };
  const root = buildForkEnvironments(scene, track, textures, terrain);
  scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const up = new THREE.Vector3(0, 1, 0);
  let covered = 0;
  try {
    const offshore = track.frame(0.37 * track.length, 1);
    assert(terrain.heightAt(offshore.p.x, offshore.p.z) < -16);
    assert(
      terrain.bridgeAt(0.37, 1),
      "offshore deck uses the real bridge supports",
    );
    for (let u = 0.325; u <= 0.41; u += 0.0005) {
      for (const branch of [-1, 1]) {
        const f = track.frame(u * track.length, branch);
        for (const lateral of [-f.width, 0, f.width]) {
          const p = f.p.clone().addScaledVector(f.right, lateral);
          assert(terrain.heightAt(p.x, p.z) < p.y - 1);
          ray.set(p.clone().addScaledVector(up, 0.1), up);
          ray.far = 26;
          assert.equal(ray.intersectObject(root, true).length, 0);
        }
        ray.set(f.p, up);
        ray.far = 60;
        const roof = ray.intersectObject(root, true).length > 0;
        if (branch === 1)
          assert.equal(roof, false, "outer route stays open to the sky");
        else if (roof) covered++;
      }
    }
    assert(covered > 70, "inner reverse bend has a substantial real gallery");
  } finally {
    terrain.geometries.forEach((geometry) => geometry.dispose());
    root.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) object.material.dispose();
    });
  }
});
