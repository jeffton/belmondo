import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACKS } from "../src/track.js";
import { createTerrain } from "../src/terrain.js";
import {
  buildMetropolis,
  clearsMetropolisRoad,
  METROPOLIS_SIGN_ATLAS,
} from "../src/metropolis-world.js";
import { newCourseRecipe, biomeLandHeight } from "../src/new-course-recipes.js";
import { getTrackPickups } from "../src/pickups.js";
import { createSky, paintSky } from "../src/sky.js";
import { readFileSync } from "node:fs";

function dispose(root) {
  const geometries = new Set(),
    materials = new Set();
  root.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) materials.add(o.material);
    if (o.isInstancedMesh) o.dispose();
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}

test("VESPER has an explicit urban biome and distinct unaliased records/menu identity", () => {
  const course = TRACKS.find((c) => c.name === "VESPER CIRCUIT");
  assert(course);
  assert.equal(TRACKS.indexOf(course), 6);
  assert(!TRACKS.slice(0, 6).some((c) => c.layoutId === course.layoutId));
  const recipe = newCourseRecipe({ config: course });
  assert.equal(recipe.biome, "metropolis");
  assert.equal(biomeLandHeight(recipe, 0, 0, {}), 12);
  assert.equal(course.lighting, "night");
  assert.equal(
    course.night,
    false,
    "legacy Night route surgery stays disabled",
  );
});

test("VESPER architecture grounds on actual rendered terrain and clears banked hulls on both forks", () => {
  const track = makeTrack(6);
  const terrain = createTerrain(track);
  const scene = new THREE.Scene();
  // A real map exercises the generated sign UVs and disposal ownership without
  // a browser/network dependency.
  const signMap = new THREE.DataTexture(new Uint8Array(16), 2, 2);
  buildMetropolis(
    scene,
    track,
    { concrete: null },
    { terrain, heightAt: terrain.heightAt },
    signMap,
  );
  const root = scene.getObjectByName("metropolis-districts");
  const { volumes, supports, arcadeParts } = root.userData;
  assert(
    volumes.length > 150,
    `close inhabited frontage, not remote skyline: ${volumes.length}`,
  );
  for (const volume of volumes) {
    assert(
      clearsMetropolisRoad(volume, terrain.samples),
      "all route envelopes clear actual oriented building volume",
    );
    const contacts = [-1, 1].flatMap((x) =>
      [-1, 1].map((z) => {
        const p = volume.center
          .clone()
          .addScaledVector(volume.right, (x * volume.width) / 2)
          .addScaledVector(volume.forward, (z * volume.depth) / 2);
        return terrain.heightAt(p.x, p.z);
      }),
    );
    assert(
      volume.bottom < Math.min(...contacts),
      "four foundation corners embed in real terrain",
    );
    assert(
      volume.top > Math.max(...contacts),
      "occupied floors rise above ground",
    );
  }
  assert(
    arcadeParts.filter((part) => part.kind === "market-roof").length > 20,
    "lower route has an enclosed market experience, not just a parallel road",
  );
  for (const part of arcadeParts) {
    assert.equal(part.branch, -1, "high route stays open to the skyline");
    assert(
      clearsMetropolisRoad(part, terrain.samples),
      "arcade clears both physical road/hull envelopes",
    );
    if (part.kind === "market-column")
      assert.equal(
        part.bottom,
        terrain.heightAt(part.center.x, part.center.z) - 1,
      );
  }
  assert(
    supports.length > 500,
    "race deck has continuous load-bearing rooftop foundations",
  );
  for (const support of supports) {
    for (let i = 0; i < 4; i++) {
      const p = support.foot[i];
      assert(Math.abs(p.y - (terrain.heightAt(p.x, p.z) - 1)) < 0.001);
      assert(support.top[i].y > p.y);
    }
  }
  for (let i = 0; i < 500; i++) {
    const u = i / 500;
    for (const branch of u > track.config.split[0] && u < track.config.split[1]
      ? [-1, 1]
      : [0]) {
      const f = track.frame(u * track.length, branch);
      const b = track.bounds(u * track.length, branch);
      for (const lateral of [b.clipMin - 3, 0, b.clipMax + 3]) {
        const p = f.p.clone().addScaledVector(f.right, lateral);
        assert(
          p.y - terrain.heightAt(p.x, p.z) > 8,
          "city datum does not swell into rooftops",
        );
      }
    }
  }
  assert(root.getObjectByName("broken-neon-deck-reflections"));
  const signs = root.children.filter((o) => o.name === "vesper-municipal-sign");
  assert(
    signs.length >= 3,
    "original municipal signs belong to close architecture",
  );
  for (const sign of signs) {
    assert.equal(sign.material.map, signMap);
    for (const value of sign.geometry.attributes.uv.array)
      assert(value >= 0 && value <= 1);
  }
  const instances = root.children.filter((o) => o.isInstancedMesh);
  assert(
    instances.length < 100,
    `spatial instancing budget: ${instances.length}`,
  );
  assert(root.userData.sceneryInstances < 12000);
  dispose(scene);
  terrain.geometries.forEach((g) => g.dispose());
  signMap.dispose();
});

test("VESPER deliberate pickup choices fit their real decks and trade branch rewards", () => {
  const track = makeTrack(6);
  const pads = getTrackPickups(track);
  assert(pads.length >= 8);
  assert(pads.some((p) => p.branch === -1 && p.type === "weapon"));
  assert(pads.some((p) => p.branch === 1 && p.type === "boost"));
  for (const pad of pads) {
    assert(pad.purpose.length > 20);
    const f = track.frame(pad.s, pad.branch);
    assert(Math.abs(pad.lateral) + pad.width / 2 < f.width - 2);
    assert(!track.gap(pad.u));
  }
});

test("VESPER original 2048 full-sphere panorama has no horizontal seam and sign provenance matches asset", () => {
  const course = TRACKS[6];
  const sky = createSky(course, course.fog);
  assert.equal(sky.image.width, 2048);
  assert.equal(sky.image.height, 1024);
  assert.equal(sky.magFilter, THREE.LinearFilter);
  assert.equal(sky.mapping, THREE.EquirectangularReflectionMapping);
  const image = paintSky(course, course.fog, 256, 128);
  for (let row = 0; row < image.height; row++) {
    const a = row * image.width * 4;
    const b = (row * image.width + image.width - 1) * 4;
    // Authored city silhouette is periodic too, not only the gradient/clouds.
    for (let channel = 0; channel < 3; channel++)
      assert(
        Math.abs(image.data[a + channel] - image.data[b + channel]) < 4,
        `sky seam row ${row}`,
      );
  }
  const provenance = JSON.parse(
    readFileSync(
      new URL("../public/art/vesper/provenance.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(provenance.references.length, 0);
  assert.equal(provenance.altered, false);
  assert(METROPOLIS_SIGN_ATLAS.endsWith(provenance.asset));
  sky.dispose();
});
