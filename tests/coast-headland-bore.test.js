import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createHash } from "node:crypto";
import { clearChaseCamera } from "../src/chase-camera.ts";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { createTerrain } from "../src/terrain.ts";
import { buildForkEnvironments } from "../src/fork-environments.ts";

const track = makeTrack(TRACK_INDEX.COAST);
const [boreStart, boreEnd] = track.config.sections.headlandBore;
const terrain = createTerrain(track);
const scene = new THREE.Scene();
const textures = Object.fromEntries(
  ["rock", "concrete", "edge", "facade"].map((name) => [name, null]),
);
const root = buildForkEnvironments(scene, track, textures, terrain);
scene.updateMatrixWorld(true);
const ray = new THREE.Raycaster();
const up = new THREE.Vector3(0, 1, 0);

function intersections(origin, direction, distance) {
  ray.set(origin, direction);
  ray.far = distance;
  return ray.intersectObject(root, true);
}

test("headland encloses the curved lower route but leaves the upper route open", () => {
  for (let u = boreStart + 0.001; u < boreEnd - 0.001; u += 0.001) {
    const f = track.frame(u * track.length, -1);
    for (const x of [-f.width - 7, 0, f.width + 7]) {
      const p = f.p
        .clone()
        .addScaledVector(f.right, x)
        .addScaledVector(up, 0.1);
      assert.equal(intersections(p, up, 26).length, 0, `headroom ${u}/${x}`);
      assert(intersections(p, up, 48).length > 0, `missing vault ${u}/${x}`);
    }
    for (const side of [-1, 1]) {
      const p = f.p.clone().addScaledVector(up, 12);
      assert(
        intersections(p, f.right.clone().multiplyScalar(side), f.width + 12)
          .length > 0,
        `missing side wall ${u}/${side}`,
      );
    }
    const upper = track.frame(u * track.length, 1);
    for (const x of [-upper.width - 7, 0, upper.width + 7])
      assert.equal(
        intersections(
          upper.p
            .clone()
            .addScaledVector(upper.right, x)
            .addScaledVector(up, 0.1),
          up,
          2000,
        ).length,
        0,
        `upper sky ${u}/${x}`,
      );
  }
});

test("both full racing corridors and chase-camera paths clear the actual solid mesh", () => {
  const [start, end] = track.config.split;
  for (let s = start * track.length; s < end * track.length; s += 3) {
    for (const branch of [-1, 1]) {
      const f = track.frame(s, branch);
      for (let x = -f.width - 7; x <= f.width + 7; x += 2) {
        const p = f.p
          .clone()
          .addScaledVector(f.right, x)
          .addScaledVector(up, 0.1);
        assert.equal(
          intersections(p, up, 26).length,
          0,
          `corridor ${f.u}/${branch}/${x}`,
        );
        const next = track.frame(s + 3, branch);
        const q = next.p
          .clone()
          .addScaledVector(next.right, x)
          .addScaledVector(up, 12);
        const origin = p.clone().addScaledVector(up, 11.9);
        const delta = q.clone().sub(origin);
        assert.equal(
          intersections(origin, delta.clone().normalize(), delta.length())
            .length,
          0,
          `forward sweep ${f.u}/${branch}/${x}`,
        );
      }
      // Elevated trailing camera and its entire sightline to the hovering craft.
      const camera = track
        .frame(s - 20, branch)
        .p.clone()
        .addScaledVector(up, 12);
      const target = f.p.clone().addScaledVector(up, 2.2);
      const delta = target.clone().sub(camera);
      assert.equal(
        intersections(camera, delta.clone().normalize(), delta.length()).length,
        0,
        `camera ${f.u}/${branch}`,
      );
    }
  }
});

test("actual speed-dependent chase camera clears the headland and portals", () => {
  for (
    let s = track.config.split[0] * track.length;
    s < track.config.split[1] * track.length;
    s += 3
  ) {
    for (const branch of [-1, 1]) {
      const f = track.frame(s, branch);
      const forward = new THREE.Vector3(
        f.tangent.x,
        0,
        f.tangent.z,
      ).normalize();
      for (const speed of [0, 300, 600]) {
        const focus = f.p.clone().addScaledVector(up, 2.9);
        const camera = focus
          .clone()
          .addScaledVector(forward, -10.5 - speed * 0.006)
          .addScaledVector(up, 3.8);
        clearChaseCamera(camera, track, { contactS: s, branch }, terrain, 3.8);
        const delta = focus.clone().sub(camera);
        assert.equal(
          intersections(camera, delta.clone().normalize(), delta.length())
            .length,
          0,
          `actual camera ${f.u}/${branch}/${speed}`,
        );
      }
    }
  }
});

test("Solar instances, mesh geometry and colors retain the accepted exact output", () => {
  const solar = makeTrack(TRACK_INDEX.SOLAR);
  const solarRoot = buildForkEnvironments(
    new THREE.Group(),
    solar,
    textures,
    createTerrain(solar),
  );
  const hash = createHash("sha256");
  solarRoot.traverse((mesh) => {
    if (!mesh.isInstancedMesh) return;
    hash.update(mesh.name);
    hash.update(Buffer.from(mesh.instanceMatrix.array.buffer));
    hash.update(Buffer.from(mesh.geometry.attributes.position.array.buffer));
    hash.update(String(mesh.material.color.getHex()));
  });
  assert.equal(
    hash.digest("hex"),
    "678670d5e6d034c8ddda48b711169b0a5c9eed2e8259b8993eb9bceef6f96b82",
  );
});

test("the exterior has continuous real-ground contacts and no legacy canopy", () => {
  assert(root.userData.groundingContacts.length > 200);
  for (const p of root.userData.groundingContacts)
    assert(Math.abs(p.y - terrain.heightAt(p.x, p.z) + 2) < 1e-6);
  assert.equal(root.getObjectByName("fork-wall"), undefined);
  assert.equal(root.getObjectByName("fork-rock"), undefined);
  assert(root.getObjectByName("coast-bore-rock"));
  assert(root.getObjectByName("coast-bore-lining"));
});
