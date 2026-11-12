import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACKS } from "../src/track.js";
import { createTerrain, groundedGeometryOffset } from "../src/terrain.js";
import { buildCity } from "../src/city.js";

for (const [index, config] of TRACKS.entries()) {
  test(`${config.name}: land meets the course without entering either real route or its jump`, () => {
    const track = makeTrack(index),
      terrain = createTerrain(track);
    let close = 0,
      total = 0;
    for (let i = 0; i < 900; i++) {
      const u = i / 900;
      for (const branch of u > config.split[0] && u < config.split[1]
        ? [-1, 1]
        : [0]) {
        const f = track.frame(u * track.length, branch),
          bounds = track.bounds(u * track.length, branch);
        for (let t = 0; t <= 1; t += 0.25) {
          const x = THREE.MathUtils.lerp(bounds.clipMin, bounds.clipMax, t);
          const p = f.p.clone().addScaledVector(f.right, x);
          const gap = p.y - terrain.heightAt(p.x, p.z);
          assert(
            gap > 3.5,
            `land enters deck underside at ${u}/${branch}/${x}: ${gap}`,
          );
          const bridge = config.sections.upperBridge;
          const authoredBridge = bridge && u >= bridge[0] && u <= bridge[1];
          if (!track.gap(u) && !authoredBridge) {
            total++;
            if (gap < 12) close++;
          }
        }
      }
    }
    // Distinguishes grounded geography from the previous 54–105m-high viaduct.
    assert(
      close / total > 0.85,
      "most of the real course must sit on land, not stilts",
    );
    if (config.jump !== null) {
      const jump = track.frame(
        (config.jump + config.gapLength / 2) * track.length,
      );
      assert(
        jump.p.y - terrain.heightAt(jump.p.x, jump.p.z) > 35,
        "jump crosses a genuine open ravine",
      );
    }
    terrain.geometries.forEach((g) => g.dispose());
  });

  test(`${config.name}: foundations and swept contact agree with the rendered triangle mesh`, () => {
    const terrain = createTerrain(makeTrack(index));
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes = terrain.geometries.map((g) => new THREE.Mesh(g, material));
    meshes.forEach((m) => m.updateMatrixWorld());
    const ray = new THREE.Raycaster(),
      down = new THREE.Vector3(0, -1, 0);
    for (let i = 0; i < 36; i++) {
      const x = -1600 + ((i * 197) % 1900) + 0.37,
        z = -900 + ((i * 331) % 1800) + 0.61;
      const y = terrain.heightAt(x, z);
      ray.set(new THREE.Vector3(x, 400, z), down);
      const hit = ray.intersectObjects(meshes)[0];
      assert(hit, "every sampled surface exists in the actual scene mesh");
      assert(
        Math.abs(hit.point.y - y) < 0.0001,
        "heightAt interpolates the visible triangle, not an ideal height",
      );
      const from = new THREE.Vector3(x, y + 20, z),
        to = new THREE.Vector3(x, y - 20, z);
      const sweep = terrain.sweepSurface(from, to, 1.1);
      assert(sweep && sweep.normal.y > 0);
      assert(Math.abs(sweep.point.y - y) < 0.0001);
      assert(
        Math.abs(from.clone().lerp(to, sweep.fraction).y - (y + 1.1)) < 0.0001,
      );
      assert.equal(
        terrain.sweepSurface(from, new THREE.Vector3(x, y + 3, z), 1.1),
        null,
      );
      assert(
        terrain.sweepSurface(to, to, 1.1),
        "starting inside visible land is an impact",
      );
    }
    const outside = new THREE.Vector3(terrain.extent + 1, 200, 0);
    assert.equal(
      terrain.sweepSurface(outside, outside.clone().setY(-100), 1.1),
      null,
      "no invisible collision plane outside rendered land",
    );
    let ridgeTested = false;
    for (let row = 20; row < 180 && !ridgeTested; row++)
      for (let col = 20; col < 180 && !ridgeTested; col++) {
        const x = -terrain.extent + col * terrain.step,
          z = -terrain.extent + row * terrain.step + 3;
        const left = terrain.heightAt(x - 2 * terrain.step, z),
          right = terrain.heightAt(x + 2 * terrain.step, z);
        const crest = terrain.heightAt(x, z);
        if (crest < Math.max(left, right) + 4) continue;
        const y = Math.max(left, right) + 3;
        const from = new THREE.Vector3(x - 2 * terrain.step, y, z),
          to = new THREE.Vector3(x + 2 * terrain.step, y, z);
        const sweep = terrain.sweepSurface(from, to, 1.1);
        assert(
          sweep && sweep.fraction > 0 && sweep.fraction < 1,
          "a fast sweep hits an intermediate ridge even when both endpoints clear ground",
        );
        const origin = from.clone().lerp(to, sweep.fraction);
        assert(
          Math.abs(origin.y - 1.1 - terrain.heightAt(origin.x, origin.z)) <
            0.0001,
        );
        ridgeTested = true;
      }
    assert(ridgeTested, "exercise a real sloping landform");
    terrain.geometries.forEach((g) => g.dispose());
    material.dispose();
  });
}

test("banked earthworks follow both actual deck edges instead of a flat centreline ceiling", () => {
  for (const bank of [-Math.PI / 18, Math.PI / 18]) {
    const tangent = new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3(Math.cos(bank), Math.sin(bank), 0);
    const up = new THREE.Vector3(-Math.sin(bank), Math.cos(bank), 0);
    const track = {
      config: {
        name: "SOLAR ARRAY",
        split: [0.3, 0.4],
        jump: 0.82,
        gapLength: 0.014,
        sections: {},
      },
      length: 1000,
      frame: (s, branch = 0) => ({
        p: new THREE.Vector3(0, 65, s),
        tangent,
        right,
        up,
        width: 19,
        u: s / 1000,
        branch,
      }),
      bounds: () => ({ clipMin: -19, clipMax: 19 }),
      gap: () => false,
    };
    const terrain = createTerrain(track);
    for (let s = 180; s <= 600; s += 13) {
      const f = track.frame(s);
      for (const x of [-19, -9.5, 0, 9.5, 19]) {
        const p = f.p.clone().addScaledVector(f.right, x);
        const clearance = p.y - terrain.heightAt(p.x, p.z);
        assert(
          clearance >= 4 && clearance <= 7,
          `both banked shoulders stay grounded without clipping: bank=${bank}, x=${x}, gap=${clearance}`,
        );
      }
    }
    terrain.geometries.forEach((g) => g.dispose());
  }
});

test("Solar's actual instanced outcrops touch final terrain and use distinct authored geometry", () => {
  const track = makeTrack(1),
    terrain = createTerrain(track),
    scene = new THREE.Scene();
  const textures = Object.fromEntries(
    ["concrete", "paint", "facade"].map((key) => [key, new THREE.Texture()]),
  );
  buildCity(scene, track, textures, { heightAt: terrain.heightAt, terrain });
  const variants = new Set();
  let instances = 0;
  scene.traverse((mesh) => {
    if (!mesh.geometry?.name.startsWith("sandstone-outcrop")) return;
    variants.add(mesh.geometry.name);
    for (let i = 0; i < mesh.count; i++) {
      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(i, matrix);
      const positions = mesh.geometry.attributes.position;
      const points = Array.from({ length: positions.count }, (_, j) =>
        new THREE.Vector3()
          .fromBufferAttribute(positions, j)
          .applyMatrix4(matrix),
      );
      const bottom = Math.min(...points.map((p) => p.y)),
        top = Math.max(...points.map((p) => p.y));
      const feet = points.filter(
        (p) => p.y <= bottom + (top - bottom) * 0.2 + 0.0001,
      );
      assert(
        feet.every((p) => p.y <= terrain.heightAt(p.x, p.z)),
        "rendered outcrop lower silhouette is embedded",
      );
      assert(
        feet.some(
          (p) => Math.abs(p.y - terrain.heightAt(p.x, p.z) + 1.2) < 0.001,
        ),
        "transformed rock really meets land",
      );
      instances++;
    }
  });
  assert(instances > 0);
  assert.equal(variants.size, 3);
  terrain.geometries.forEach((g) => g.dispose());
  scene.traverse((o) => {
    o.dispose?.();
    o.geometry?.dispose();
    o.material?.dispose();
  });
});

test("rotated geological geometry embeds its actual lower silhouette into sloping terrain", () => {
  const geometry = new THREE.DodecahedronGeometry(0.5);
  const transform = new THREE.Object3D();
  transform.position.set(-20, 0, 15);
  transform.rotation.set(0.13, 0.7, 0.05);
  transform.scale.set(32, 90, 48);
  transform.updateMatrix();
  const heightAt = (x, z) => 20 + x * 0.2 - z * 0.07;
  const offset = groundedGeometryOffset(geometry, transform.matrix, heightAt);
  const positions = geometry.attributes.position;
  const points = Array.from({ length: positions.count }, (_, i) =>
    new THREE.Vector3()
      .fromBufferAttribute(positions, i)
      .applyMatrix4(transform.matrix),
  );
  const bottom = Math.min(...points.map((p) => p.y)),
    top = Math.max(...points.map((p) => p.y));
  const feet = points.filter((p) => p.y <= bottom + (top - bottom) * 0.2);
  assert(
    feet.every((p) => p.y + offset < heightAt(p.x, p.z)),
    "no lower vertex is floating over the slope",
  );
  assert(
    feet.some((p) => Math.abs(p.y + offset - heightAt(p.x, p.z) + 1.2) < 1e-8),
    "a real transformed foot supplies the ground contact, rather than the model centre",
  );
  geometry.dispose();
});
