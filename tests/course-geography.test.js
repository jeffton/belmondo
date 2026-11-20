import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { createTerrain } from "../src/terrain.ts";
import { buildCourseGeography } from "../src/course-geography.ts";

function geography(index) {
  const track = makeTrack(index),
    terrain = createTerrain(track),
    scene = new THREE.Scene();
  const textures = {
    rock: new THREE.Texture(),
    edge: new THREE.Texture(),
    paint: new THREE.Texture(),
  };
  const root = buildCourseGeography(scene, track, textures, {
    heightAt: terrain.heightAt,
    supportClearAt: terrain.supportClearAt,
  });
  root.updateMatrixWorld(true);
  return { track, terrain, root };
}

test("Solar's mountain has a genuinely open tunnel void, rock roof and land-contacting flanks", () => {
  const { track, terrain, root } = geography(TRACK_INDEX.SOLAR);
  const mountain = root.getObjectByName("bored-mountain-mass");
  assert(mountain);
  for (const foot of mountain.userData.groundingContacts) {
    assert(
      Math.abs(foot.y - terrain.heightAt(foot.x, foot.z) + 1) < 0.001,
      "each rock flank must intersect the actual final land mesh",
    );
  }
  const [start, end] = track.config.sections.mountainTunnel;
  const ray = new THREE.Raycaster();
  for (let i = 0; i <= 48; i++) {
    const u = start + ((end - start) * i) / 48;
    const f = track.frame(u * track.length);
    for (const x of [-f.width + 1, 0, f.width - 1]) {
      const point = f.p
        .clone()
        .addScaledVector(f.right, x)
        .add(new THREE.Vector3(0, 2.2, 0));
      ray.set(point, new THREE.Vector3(0, 1, 0));
      ray.far = 14;
      assert.equal(
        ray.intersectObject(mountain).length,
        0,
        "no rock can fill the driven tunnel void or portal",
      );
      if (i > 0 && i < 48) {
        ray.far = 150;
        const roof = ray.intersectObject(mountain)[0];
        assert(
          roof && roof.distance >= 14,
          "the void needs a real rock roof above it",
        );
      }
    }
  }
});

test("Night's overpass leaves the lower route open and rejects columns through its real footprint", () => {
  const { track, terrain, root } = geography(TRACK_INDEX.NOCTILUCENT);
  const truss = root.getObjectByName("upper-crossing-truss");
  assert(truss);
  const foundations = truss.userData.groundingContacts;
  assert(foundations.length > 0);
  for (const foot of foundations)
    assert(
      foot.y < terrain.heightAt(foot.x, foot.z),
      "caissons embed in the seabed",
    );
  const crossing = track.config.sections.crossings[0];
  const upper = track.frame(crossing.upperU * track.length);
  const lower = track.frame(crossing.lowerU * track.length);
  assert(Math.hypot(upper.p.x - lower.p.x, upper.p.z - lower.p.z) < 1);
  assert(upper.p.y - lower.p.y > 100);
  assert(terrain.bridgeAt(crossing.upperU));
  assert.equal(
    terrain.supportClearAt(crossing.upperU),
    false,
    "upper bridge columns cannot pass through lower track",
  );
  const ray = new THREE.Raycaster();
  ray.far = 18;
  for (let offset = -160; offset <= 160; offset += 3) {
    const f = track.frame(crossing.lowerU * track.length + offset);
    for (const x of [-f.width, -f.width / 2, 0, f.width / 2, f.width]) {
      const point = f.p.clone().addScaledVector(f.right, x);
      if (Math.abs(offset) <= 65)
        assert(
          terrain.heightAt(point.x, point.z) < point.y - 3.5,
          "upper-course earthworks cannot bury the lower crossing",
        );
      ray.set(
        point.clone().add(new THREE.Vector3(0, 0.2, 0)),
        new THREE.Vector3(0, 1, 0),
      );
      assert.equal(
        ray.intersectObject(truss).length,
        0,
        "bridge trusses stay clear of the lower road's flight clearance",
      );
    }
  }
  const [start, end] = track.config.sections.upperBridge;
  // Bridge structure must stay outside the complete upper driving
  // corridor, not just leave its distant lower crossing clear.
  ray.far = 30;
  for (let i = 0; i <= 100; i++) {
    const f = track.frame((start + ((end - start) * i) / 100) * track.length);
    for (const x of [-f.width, 0, f.width]) {
      ray.set(
        f.p.clone().addScaledVector(f.right, x).addScaledVector(f.up, 0.2),
        f.up,
      );
      assert.equal(
        ray.intersectObject(truss).length,
        0,
        "bridge structure leaves the upper deck and its airborne corridor open",
      );
    }
  }
  let supports = 0;
  for (let i = 0; i <= 50; i++)
    if (terrain.supportClearAt(start + ((end - start) * i) / 50)) supports++;
  assert(
    supports > 0 && supports < 51,
    "the span has grounded supports outside its actual underpass opening",
  );
});

test("expanded courses keep the entire racing footprint within distance-resolved land", () => {
  for (const index of [
    TRACK_INDEX.COAST,
    TRACK_INDEX.SOLAR,
    TRACK_INDEX.NOCTILUCENT,
  ]) {
    const track = makeTrack(index),
      terrain = createTerrain(track);
    for (const f of terrain.samples) {
      assert(Math.abs(f.p.x) + f.width + 300 < terrain.extent);
      assert(Math.abs(f.p.z) + f.width + 300 < terrain.extent);
    }
    assert.equal(
      terrain.step,
      23,
      "longer layouts cannot silently coarsen land-contact resolution",
    );
    terrain.geometries.forEach((g) => g.dispose());
  }
});
