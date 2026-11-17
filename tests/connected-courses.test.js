import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { createTerrain } from "../src/terrain.ts";
import { buildFaultlineProcessing } from "../src/faultline-processing.ts";
import { buildVesperInterchange } from "../src/vesper-interchange.ts";

function fixture(index) {
  const track = makeTrack(index);
  const terrain = createTerrain(track);
  const scene = new THREE.Scene();
  const textures = Object.fromEntries(
    ["concrete", "paint", "facade", "water", "rock"].map((name) => [
      name,
      new THREE.Texture(),
    ]),
  );
  const environment = {
    terrain,
    heightAt: terrain.heightAt,
    bridgeAt: terrain.bridgeAt,
    supportClearAt: terrain.supportClearAt,
  };
  return { track, terrain, scene, textures, environment };
}

function clearDrivingVolume(root, track, start, end) {
  root.updateMatrixWorld(true);
  // Both sides are queried so an accidentally enclosing wall cannot pass just
  // because the camera/ray starts behind its front-facing triangles.
  root.traverse((object) => {
    if (object.isMesh) object.material.side = THREE.DoubleSide;
  });
  const ray = new THREE.Raycaster();
  ray.far = 30;
  for (let s = start * track.length; s <= end * track.length; s += 6) {
    const u = s / track.length;
    const branches =
      u > track.config.split[0] && u < track.config.split[1] ? [-1, 1] : [0];
    for (const branch of branches) {
      const f = track.frame(s, branch);
      for (const lateral of [-f.width, 0, f.width]) {
        const point = f.p
          .clone()
          .addScaledVector(f.right, lateral)
          .addScaledVector(f.up, 0.3);
        ray.set(point, f.up);
        const hits = ray.intersectObject(root, true);
        assert.equal(
          hits.length,
          0,
          `${track.config.name} u=${s / track.length} branch=${branch}: architecture occupies road/flight space`,
        );
      }
    }
  }
}

test("FAULTLINE broad commitment leads into a tighter counterturn on the physical surface", () => {
  const track = makeTrack(TRACK_INDEX.FAULTLINE);
  const broad = 1 / Math.abs(track.curvature(0.58 * track.length));
  const tight = 1 / Math.abs(track.curvature(0.61 * track.length));
  assert(
    broad > tight + 40,
    "the first arc opens differently from the following corner",
  );
  assert(broad > 240 && broad < 280);
  assert(tight >= 150 && tight < 210);
  assert(
    Math.sign(track.curvature(0.58 * track.length)) !==
      Math.sign(track.curvature(0.61 * track.length)),
  );
});

test("FAULTLINE processing stages share a real excavated floor and clear the complete return", () => {
  const f = fixture(TRACK_INDEX.FAULTLINE);
  const root = buildFaultlineProcessing(
    f.scene,
    f.track,
    f.textures,
    f.environment,
  );
  for (const footing of root.userData.footings) {
    assert(
      footing.top < footing.floor + 15,
      "the plant cannot sit on a cliff-sized podium",
    );
    for (const contact of footing.contacts) {
      assert(contact.y > footing.bottom);
      assert(contact.y < footing.top);
      assert(
        Math.abs(contact.y - f.terrain.heightAt(contact.x, contact.z)) < 1e-5,
      );
    }
  }
  clearDrivingVolume(root, f.track, 0.5, 0.74);
  f.terrain.geometries.forEach((g) => g.dispose());
});

test("VESPER's connected terminal canopy stays outside both fork driving volumes", () => {
  const f = fixture(TRACK_INDEX.VESPER);
  const { root, arcadeParts } = buildVesperInterchange(
    f.scene,
    f.track,
    f.textures,
    f.environment,
  );
  assert(arcadeParts.some((part) => part.kind === "market-roof"));
  for (const profile of root.userData.profiles) {
    assert(
      profile.halfWidth > 0,
      "the terminal retreats before converging routes",
    );
    assert(
      profile.center.z - profile.halfWidth >
        profile.lower.p.z + profile.lower.width,
    );
    assert(
      profile.center.z + profile.halfWidth <
        profile.upper.p.z - profile.upper.width,
    );
  }
  clearDrivingVolume(root, f.track, 0.28, 0.36);
  f.scene.updateMatrixWorld(true);
  const a = root.userData.profiles[6],
    b = root.userData.profiles[7];
  const entrance = new THREE.Vector3(
    a.center.x + 1,
    a.lower.p.y + 12,
    a.center.z + 6,
  );
  const hallRay = new THREE.Raycaster(entrance, new THREE.Vector3(-1, 0, 0));
  const hallBack = hallRay.intersectObject(root, true)[0];
  assert(
    hallBack.point.x < (a.center.x + b.center.x) / 2,
    "the arrival view enters a genuinely deep room, not a facade decal",
  );
  const upper = f.track.frame(((a.u + b.u) / 2) * f.track.length, 1);
  hallRay.set(
    upper.p.clone().add(new THREE.Vector3(0, 0.5, 0)),
    new THREE.Vector3(0, 0, -1),
  );
  const acrossHall = hallRay.intersectObject(root, true);
  assert(
    acrossHall.length === 0 ||
      acrossHall[0].point.z <
        (a.center.z - a.halfWidth + (b.center.z - b.halfWidth)) / 2 + 17,
    "the upper side aperture looks into the same hall rather than an opaque window plane",
  );
  const sky = new THREE.Vector3(0, 1, 0);
  for (const [u, covered] of [
    [0.31, true],
    [0.32, false],
    [0.33, true],
  ]) {
    const frame = f.track.frame(u * f.track.length, -1);
    const ray = new THREE.Raycaster(
      frame.p.clone().addScaledVector(sky, 3),
      sky,
    );
    const hits = ray.intersectObject(root, true);
    assert.equal(
      hits.length > 0,
      covered,
      "arrival enclosure → open court → departure enclosure is actual geometry",
    );
    const upper = f.track.frame(u * f.track.length, 1);
    ray.set(upper.p.clone().addScaledVector(sky, 3), sky);
    assert.equal(
      ray.intersectObject(root, true).length,
      0,
      "the roof route keeps open sky",
    );
  }
  f.terrain.geometries.forEach((g) => g.dispose());
});
