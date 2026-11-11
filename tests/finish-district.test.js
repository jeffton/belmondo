import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACKS } from "../src/track.js";
import { createTerrain } from "../src/terrain.js";
import { buildFinishDistrict } from "../src/finish-district.js";

for (const [index, config] of TRACKS.entries()) {
  test(`${config.name}: finish district is grounded, clears the racing corridor and culminates at the real line`, () => {
    const track = makeTrack(index);
    const terrain = createTerrain(track);
    const scene = new THREE.Scene();
    const textures = Object.fromEntries(
      ["concrete", "paint", "facade"].map((key) => [key, new THREE.Texture()]),
    );
    const district = buildFinishDistrict(scene, track, textures, {
      heightAt: terrain.heightAt,
    });
    const samples = Array.from({ length: 1800 }, (_, i) =>
      track.frame((i / 1800) * track.length),
    );
    const nearest = (p) => {
      let best,
        distance = Infinity;
      for (const frame of samples) {
        const d = Math.hypot(frame.p.x - p.x, frame.p.z - p.z);
        if (d < distance) {
          distance = d;
          best = frame;
        }
      }
      return { frame: best, distance };
    };
    for (const foundation of district.foundations) {
      const nx = Math.ceil(foundation.width / 2),
        nz = Math.ceil(foundation.length / 2);
      for (let ix = 0; ix <= nx; ix++)
        for (let iz = 0; iz <= nz; iz++) {
          const p = foundation.center
            .clone()
            .addScaledVector(
              foundation.right,
              (ix / nx - 0.5) * foundation.width,
            )
            .addScaledVector(
              foundation.forward,
              (iz / nz - 0.5) * foundation.length,
            );
          const ground = terrain.heightAt(p.x, p.z);
          assert(
            ground >= foundation.bottom,
            "footing must intersect visible land, not hover",
          );
          assert(
            ground <= foundation.deck,
            "land must not penetrate the spectator deck",
          );
          const { frame, distance } = nearest(p);
          assert(
            distance > frame.width + 4,
            "full foundation must clear the racing deck and barrier",
          );
          if (index === 0) {
            const side = Math.sign(p.clone().sub(frame.p).dot(frame.right));
            assert(
              !(side < 0 && frame.u >= 0.925 && frame.u <= 0.983),
              "cannot duplicate the existing approach gallery",
            );
            assert(
              !(side > 0 && frame.u >= 0.008 && frame.u <= 0.102),
              "cannot duplicate the existing departure gallery",
            );
          }
        }
    }
    // Check each built box, not merely its building's nominal centre. Low scenery
    // must remain outside the deck; the finish header alone crosses above it.
    for (const body of district.bodies) {
      const matrix = body.group.matrixWorld.clone().multiply(body.matrix);
      for (const x of [-0.5, 0, 0.5])
        for (const z of [-0.5, 0, 0.5]) {
          const p = new THREE.Vector3(x, -0.5, z).applyMatrix4(matrix);
          const { frame, distance } = nearest(p);
          if (distance <= frame.width + 1)
            assert(
              p.y > frame.p.y + 12,
              "finish architecture must leave the fast racing sightline clear",
            );
        }
    }
    const portal = scene.getObjectByName("finish-line-portal");
    assert(
      portal.position.distanceTo(track.frame(0).p) < 1e-9,
      "finish portal cannot shift the timing line",
    );
    assert(
      district.root.userData.spectators > 0,
      "final sector needs an occupied spectator district",
    );
    let crowdBatches = 0;
    scene.traverse((object) => {
      if (object.name === "spectators") crowdBatches++;
    });
    assert.equal(
      crowdBatches,
      3,
      "crowd rendering stays instanced per cullable structure",
    );
    const before = scene.getObjectByName("spectators").instanceMatrix.version;
    district.update(5);
    district.update(6);
    assert.equal(
      scene.getObjectByName("spectators").instanceMatrix.version,
      before,
      "cheering cannot upload every spectator transform per frame",
    );
    const geometries = new Set(),
      materials = new Set();
    scene.traverse((object) => {
      if (object.isInstancedMesh) object.dispose();
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    terrain.geometries.forEach((geometry) => geometry.dispose());
  });
}
