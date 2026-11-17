import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { createTerrain } from "../src/terrain.ts";
import { buildCoastSolarPlaces } from "../src/coast-solar-places.ts";

test("Coast's open precinct and marine railway occupy the same grounded landscape without covering the race", () => {
  const track = makeTrack(TRACK_INDEX.COAST);
  const terrain = createTerrain(track);
  const texture = new THREE.Texture();
  const root = buildCoastSolarPlaces(
    new THREE.Group(),
    track,
    { concrete: texture, paint: texture },
    { terrain, heightAt: terrain.heightAt },
  );
  root.updateMatrixWorld(true);
  const precinct = root.getObjectByName("coast-institute-slipway");
  for (const p of precinct.userData.groundingContacts)
    assert(
      Math.abs(p.y - terrain.heightAt(p.x, p.z) + 1) < 0.001,
      "retaining edge loses terrain contact",
    );
  const ray = new THREE.Raycaster();
  ray.far = 100;
  const up = new THREE.Vector3(0, 1, 0);
  for (let u = 0.545; u < 0.901; u += 0.001) {
    const f = track.frame(u * track.length);
    for (const side of [-1, 0, 1]) {
      const p = f.p
        .clone()
        .addScaledVector(f.right, side * (f.width - 1))
        .addScaledVector(up, 0.1);
      ray.set(p, up);
      assert.equal(
        ray.intersectObject(root, true).length,
        0,
        "public terrace or slipway enters racing envelope",
      );
    }
  }
  const slip = root.getObjectByName("coast-slip");
  const positions = slip.geometry.attributes.position;
  let low = Infinity,
    high = -Infinity;
  for (let i = 0; i < positions.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(positions, i);
    low = Math.min(low, p.y);
    high = Math.max(high, p.y);
    assert(
      terrain.heightAt(p.x, p.z) < p.y,
      "marine railway is buried rather than descending into the basin",
    );
  }
  assert(
    Math.abs(low + 19) < 0.001,
    "marine railway must meet the sea, not end on a high plinth",
  );
  const connection = precinct.userData.connection;
  assert(Math.abs(high - connection.height) < 0.001);
  const frame = track.frame(connection.u * track.length);
  const forward = new THREE.Vector3(
    frame.tangent.x,
    0,
    frame.tangent.z,
  ).normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  const aprons = root.children.filter((mesh) => mesh.isInstancedMesh);
  for (const z of [-35, 0, 35]) {
    const point = (distance) =>
      frame.p
        .clone()
        .addScaledVector(right, frame.width + distance)
        .addScaledVector(forward, z)
        .setY(connection.height + 2);
    ray.set(point(52.95), new THREE.Vector3(0, -1, 0));
    ray.far = 3;
    const apron = ray.intersectObjects(aprons)[0];
    assert(
      apron && Math.abs(apron.point.y - connection.height) < 0.002,
      "actual apron does not reach the railway mouth",
    );
    ray.set(point(53.05), new THREE.Vector3(0, -1, 0));
    const ramp = ray.intersectObject(slip)[0];
    assert(ramp, "railway missing immediately beyond apron lip");
    const expected =
      connection.height - ((connection.height + 19) * 0.05) / (420 - 53);
    assert(
      Math.abs(ramp.point.y - expected) < 0.002,
      "railway descends underneath the apron instead of joining its outer lip",
    );
    const obstruction = ray.intersectObjects(aprons)[0];
    assert(
      !obstruction || obstruction.point.y <= ramp.point.y + 0.002,
      "adjacent workshop/apron blocks the working railway mouth",
    );
  }
  const geoms = new Set(),
    mats = new Set();
  root.traverse((m) => {
    if (m.isMesh) {
      geoms.add(m.geometry);
      mats.add(m.material);
    }
  });
  geoms.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
  texture.dispose();
  terrain.geometries.forEach((g) => g.dispose());
});
