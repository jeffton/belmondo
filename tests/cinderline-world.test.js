import { after, test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.js";
import { createTerrain } from "../src/terrain.js";
import { getTrackPickups } from "../src/pickups.js";
import { getTrackAdvertisingLayout } from "../src/advertising.js";
import { newCourseRecipe } from "../src/new-course-recipes.js";

const track = makeTrack(TRACK_INDEX.CINDERLINE);
const terrain = createTerrain(track);
const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const meshes = terrain.geometries.map(
  (geometry) => new THREE.Mesh(geometry, material),
);
meshes.forEach((mesh) => mesh.updateMatrixWorld());
after(() => {
  terrain.geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
});

test("CINDERLINE: actual ground triangles form the ballistic caldera ravine", () => {
  const ray = new THREE.Raycaster();
  const { jump, gapLength } = track.config;
  for (const fraction of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const frame = track.frame((jump + gapLength * fraction) * track.length);
    for (const lateral of [-frame.width, 0, frame.width]) {
      const p = frame.p.clone().addScaledVector(frame.right, lateral);
      const top = new THREE.Vector3(p.x, 400, p.z);
      const bottom = new THREE.Vector3(p.x, -100, p.z);
      ray.set(top, new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(meshes)[0];
      assert(hit, "the visible ravine has a real ground surface");
      assert(
        hit.point.y < frame.p.y - 60,
        "gap is a chasm, not missing asphalt above graded land",
      );
      assert(Math.abs(hit.point.y - terrain.heightAt(p.x, p.z)) < 0.001);
      const collision = terrain.sweepSurface(top, bottom, 0);
      assert(collision && Math.abs(collision.point.y - hit.point.y) < 0.001);
    }
  }
  for (const u of [0.5, 0.61, 0.65]) {
    const frame = track.frame(u * track.length);
    const clearance = frame.p.y - terrain.heightAt(frame.p.x, frame.p.z);
    assert(
      clearance > 3.5 && clearance < 12,
      "approach and long landing runout remain carried by land",
    );
  }
});

test("CINDERLINE: roadside services and advertising occupy grounded runout, not the gap", () => {
  const { jump, gapLength } = track.config;
  const exclusions = [
    ...newCourseRecipe(track).approaches,
    ...getTrackAdvertisingLayout(track),
  ];
  for (const item of exclusions)
    assert(
      item.u < jump - 0.01 || item.u > jump + gapLength + 0.025,
      "roadside structures do not become implausible tall towers inside the caldera ravine",
    );
});

test("CINDERLINE: every full pickup polygon fits its actual banked carriageway", () => {
  const pickups = getTrackPickups(track);
  for (const pad of pickups) {
    assert(!track.gap(pad.u));
    assert(!track.isTunnel(pad.s, pad.branch));
    assert(
      !/wave/.test(pad.purpose),
      "pickup intent describes the authored course rather than obsolete scenery waves",
    );
    for (const p of pad.outline) {
      const frame = track.frame(pad.s, pad.branch);
      const x = p.clone().sub(frame.p).dot(frame.right);
      const bounds = track.bounds(pad.s, pad.branch);
      assert(
        x > bounds.clipMin && x < bounds.clipMax,
        "whole polygon is on the physical deck",
      );
      assert(p.y > terrain.heightAt(p.x, p.z) + 3.5);
    }
  }
});
