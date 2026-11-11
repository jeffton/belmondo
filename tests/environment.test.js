import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACKS } from "../src/track.js";
import { buildEnvironment } from "../src/environment.js";

for (const [index, config] of TRACKS.entries()) {
  test(`${config.name}: landscape stays below every route and buildings have land foundations`, () => {
    const track = makeTrack(index),
      scene = new THREE.Scene();
    const textures = Object.fromEntries(
      ["concrete", "road", "facade", "paint"].map((k) => [
        k,
        new THREE.Texture(),
      ]),
    );
    const env = buildEnvironment(scene, track, textures);
    for (let i = 0; i < 300; i++)
      for (const branch of [-1, 0, 1]) {
        const f = track.frame((i / 300) * track.length, branch);
        assert(
          env.heightAt(f.p.x, f.p.z) < f.p.y - 5,
          "terrain cannot occlude the racing deck",
        );
      }
    for (let i = 0; i < 30; i++) {
      const f = track.frame((i / 30) * track.length),
        candidate = f.p
          .clone()
          .addScaledVector(f.right, (i % 2 ? -1 : 1) * 150);
      const p = env.buildingPosition(candidate);
      for (const dx of [-30, 30])
        for (const dz of [-30, 30]) {
          const ground = env.heightAt(p.x + dx, p.z + dz);
          assert(
            ground >= 0 && ground <= p.y,
            "foundation footprint is on land, below tower bottom",
          );
        }
      for (let j = 0; j < 300; j++)
        for (const branch of [-1, 1]) {
          const q = track.frame((j / 300) * track.length, branch).p;
          assert(
            Math.hypot(p.x - q.x, p.z - q.z) > 70,
            "building footprint clears all racing routes",
          );
        }
    }
    scene.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      o.geometry?.dispose();
      o.material?.dispose();
    });
  });
}
