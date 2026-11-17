import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { createTerrain } from "../src/terrain.ts";
import { createCoastSolarLandform } from "../src/coast-solar-landform.ts";
import { buildCoastSolarPlaces } from "../src/coast-solar-places.ts";

for (const index of [TRACK_INDEX.COAST, TRACK_INDEX.SOLAR]) {
  test(`${index}: authored places have real supports and clear both full route corridors`, () => {
    const track = makeTrack(index);
    const terrain = createTerrain(track);
    const texture = new THREE.Texture();
    const root = buildCoastSolarPlaces(
      new THREE.Group(),
      track,
      { concrete: texture, paint: texture },
      { terrain, heightAt: terrain.heightAt },
    );
    assert.deepEqual(root.userData.rejectedSites, []);
    assert(root.userData.sites.length >= 30);
    const matrix = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const q = new THREE.Quaternion();
    for (const mesh of root.children.filter((mesh) => mesh.isInstancedMesh)) {
      assert(mesh.isInstancedMesh);
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        matrix.decompose(p, q, scale);
        assert(scale.x > 0 && scale.y > 0 && scale.z > 0);
        assert(Number.isFinite(p.y));
      }
    }
    for (const site of root.userData.sites) {
      for (const f of terrain.samples) {
        const dx = f.p.x - site.center[0],
          dz = f.p.z - site.center[2];
        const x = Math.max(
          0,
          Math.abs(dx * site.right[0] + dz * site.right[2]) - site.width / 2,
        );
        const z = Math.max(
          0,
          Math.abs(dx * site.forward[0] + dz * site.forward[2]) -
            site.depth / 2,
        );
        assert(Math.hypot(x, z) > f.width + 8, site.name);
      }
      assert(site.bottom < site.floor);
      for (const x of [-0.5, 0, 0.5]) {
        for (const z of [-0.5, 0, 0.5]) {
          const ground = terrain.heightAt(
            site.center[0] +
              site.right[0] * x * site.width +
              site.forward[0] * z * site.depth,
            site.center[2] +
              site.right[2] * x * site.width +
              site.forward[2] * z * site.depth,
          );
          assert(
            ground < site.floor,
            `${site.name} platform buried by terrain`,
          );
          assert(
            ground > site.bottom,
            `${site.name} support does not reach terrain`,
          );
        }
      }
    }
  });
  test(`${index}: landform leaves all decks and other levels alone, while making real terraces`, () => {
    const track = makeTrack(index);
    const samples = [];
    for (let u = 0; u < 1; u += 0.002) {
      for (const branch of u > track.config.split[0] &&
      u < track.config.split[1]
        ? [-1, 1]
        : [0])
        samples.push(track.frame(u * track.length, branch));
    }
    const height = createCoastSolarLandform(track, samples);
    for (const f of samples) {
      if (index === TRACK_INDEX.COAST && f.u > 0.78 && f.u < 0.915) continue;
      for (const side of [-1, 0, 1]) {
        const p = f.p.clone().addScaledVector(f.right, side * f.width);
        assert.equal(
          height(p.x, p.z, -25),
          -25,
          `road grade altered at ${f.u}`,
        );
      }
    }
    const u = index === TRACK_INDEX.COAST ? 0.58 : 0.12;
    const f = track.frame(u * track.length);
    const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const p = f.p
      .clone()
      .addScaledVector(right, (index === TRACK_INDEX.COAST ? -1 : 1) * 110);
    const shelf = height(p.x, p.z, -25);
    if (index === TRACK_INDEX.COAST)
      assert(shelf > f.p.y - 25, "headland shelf missing");
    else
      assert(
        shelf > f.p.y && shelf < f.p.y + 35,
        "collector hillside must climb above the road into the forward view",
      );
    if (index === TRACK_INDEX.COAST) {
      const bay = track.frame(0.85 * track.length);
      assert(
        height(bay.p.x, bay.p.z, 100) < -20,
        "jump must cross real sea inlet",
      );
    }
  });
}
