import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack } from "../src/track.js";
import { buildEnvironment } from "../src/environment.js";
import { buildCity } from "../src/city.js";
import { buildFinishDistrict } from "../src/finish-district.js";
import { buildFlagship } from "../src/flagship.js";
import { getWaterfrontDistricts } from "../src/course-geography.js";

for (let index = 0; index < 3; index++)
  test(`legacy world ${index}: complete emitted architecture clears both authored driving corridors`, () => {
    const track = makeTrack(index);
    const scene = new THREE.Scene();
    const textures = Object.fromEntries(
      [
        "concrete",
        "road",
        "paint",
        "facade",
        "edge",
        "frontage",
        "mark",
        "water",
        "metal",
        "glass",
      ].map((k) => [k, new THREE.Texture()]),
    );
    const environment = buildEnvironment(scene, track, textures);
    buildCity(scene, track, textures, environment);
    buildFinishDistrict(scene, track, textures, environment);
    if (index === 0) {
      // CPU geometry acceptance does not fetch image pixels or create a DOM.
      const load = THREE.TextureLoader.prototype.load;
      try {
        THREE.TextureLoader.prototype.load = () => new THREE.Texture();
        buildFlagship(scene, track, textures, environment, textures);
      } finally {
        THREE.TextureLoader.prototype.load = load;
      }
    }
    scene.updateMatrixWorld(true);
    if (index === 0) {
      const frontage = scene.getObjectByName("kaiseki-waterfront");
      const basementRay = new THREE.Raycaster();
      basementRay.far = 0.1;
      const down = new THREE.Vector3(0, -1, 0);
      for (const [start, end, branch, side] of getWaterfrontDistricts(track)) {
        const bays = Math.ceil(((end - start) * track.length) / 25);
        for (let bay = 0; bay < bays; bay++) {
          const a = track.frame(
            (start + ((end - start) * bay) / bays) * track.length,
            branch,
          );
          const b = track.frame(
            (start + ((end - start) * (bay + 1)) / bays) * track.length,
            branch,
          );
          const f = track.frame(
            (start + ((end - start) * (bay + 0.5)) / bays) * track.length,
            branch,
          );
          const forward = new THREE.Vector3(
            f.tangent.x,
            0,
            f.tangent.z,
          ).normalize();
          const half = a.p.distanceTo(b.p) * 0.45;
          for (const x of [8, 20, 30])
            for (const z of [-0.8, 0, 0.8]) {
              const p = f.p
                .clone()
                .addScaledVector(f.right, side * (f.width + x))
                .addScaledVector(forward, z * half);
              p.y -= 5;
              assert(
                environment.heightAt(p.x, p.z) < p.y,
                `land buries occupied gallery floor at ${f.u}`,
              );
              basementRay.set(p.clone().addScaledVector(down, -0.05), down);
              assert(
                basementRay.intersectObject(frontage, true).length > 0,
                "the checked gallery basement is an actual emitted floor",
              );
            }
        }
      }
    }
    const ray = new THREE.Raycaster();
    ray.far = 12;
    const up = new THREE.Vector3(0, 1, 0);
    const failures = [];
    try {
      for (let s = 0; s < track.length; s += 7) {
        const u = s / track.length;
        for (const branch of u > track.config.split[0] &&
        u < track.config.split[1]
          ? [-1, 1]
          : [0]) {
          const f = track.frame(s, branch);
          for (const x of [-f.width + 1, 0, f.width - 1]) {
            const p = f.p
              .clone()
              .addScaledVector(f.right, x)
              .addScaledVector(up, 0.3);
            ray.set(p, up);
            const hit = ray.intersectObject(scene, true)[0];
            if (hit)
              failures.push({
                u,
                branch,
                x,
                object: hit.object.name || hit.object.parent?.name,
                distance: hit.distance,
              });
          }
        }
      }
      assert.deepEqual(failures, [], JSON.stringify(failures.slice(0, 30)));
    } finally {
      const geometries = new Set(),
        materials = new Set();
      scene.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) materials.add(o.material);
        o.dispose?.();
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
      Object.values(textures).forEach((t) => t.dispose());
    }
  });
