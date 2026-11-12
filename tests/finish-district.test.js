import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACKS } from "../src/track.js";
import { createTerrain } from "../src/terrain.js";
import {
  buildFinishDistrict,
  getFinishDistrictLayout,
} from "../src/finish-district.js";
import { getWaterfrontDistricts } from "../src/course-geography.js";

for (const [index, config] of TRACKS.entries()) {
  test(`${config.name}: finish district is grounded, clears the racing corridor and culminates at the real line`, () => {
    const track = makeTrack(index);
    const terrain = createTerrain(track);
    const scene = new THREE.Scene();
    const textures = Object.fromEntries(
      ["concrete", "paint", "facade", "road"].map((key) => [
        key,
        new THREE.Texture(),
      ]),
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
            for (const [
              start,
              end,
              branch,
              gallerySide,
            ] of getWaterfrontDistricts(track)) {
              if (branch !== 0) continue;
              assert(
                !(side === gallerySide && frame.u >= start && frame.u <= end),
                "finish stands cannot duplicate an occupied waterfront gallery",
              );
            }
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
    assert.equal(
      scene.getObjectByName("finish-line-portal"),
      undefined,
      "the dynamic board is the only finish arch",
    );
    assert.equal(
      scene.getObjectByName("timing-line-stripe").userData.finishS,
      track.finishS,
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
      getFinishDistrictLayout(track).length,
      "crowd rendering stays instanced per cullable straight section",
    );
    const [start, end] = config.sections.finishStraight;
    const checker = scene.getObjectByName("finish-straight-checker");
    assert(checker, "checkers belong in the road, not only on finish signs");
    const ray = new THREE.Raycaster();
    for (let i = 0; i < 9; i++) {
      const f = track.frame(
        (start + ((i + 0.3) * (end - start)) / 9) * track.length,
      );
      ray.set(
        f.p.clone().add(new THREE.Vector3(0, 10, 0)),
        new THREE.Vector3(0, -1, 0),
      );
      const hit = ray.intersectObject(checker)[0];
      assert(
        hit && Math.abs(hit.point.y - f.p.y - 0.035) < 0.02,
        "checkerboard must follow the entire actual finishing straight, including across the timing seam",
      );
    }
    let crowdTriangles = 0;
    scene.traverse((object) => {
      if (object.name === "spectators")
        crowdTriangles += (object.geometry.index.count / 3) * object.count;
    });
    assert(
      crowdTriangles <= district.root.userData.spectators * 2,
      "long-straight crowd density must not multiply box-body triangle cost",
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
