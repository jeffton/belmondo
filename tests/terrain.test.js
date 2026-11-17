import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACKS, TRACK_INDEX } from "../src/track.ts";
import { createTerrain, groundedGeometryOffset } from "../src/terrain.ts";

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
    if (config.biome !== "metropolis")
      assert(
        close / total > 0.85,
        "most of the real course must sit on land, not stilts",
      );
    else
      assert.equal(
        close,
        0,
        "urban roof racing is elevated above the city floor",
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
      ray.set(new THREE.Vector3(x, y + 100, z), down);
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
    if (config.biome !== "metropolis")
      assert(ridgeTested, "exercise a real sloping landform");
    else
      assert.equal(
        ridgeTested,
        false,
        "city floor is flat; roof clearances are tested against emitted architecture",
      );
    terrain.geometries.forEach((g) => g.dispose());
    material.dispose();
  });
}

test("Coast's filled receiving mole supports the deck while the real gap and surrounding inlet stay open", () => {
  const track = makeTrack(TRACK_INDEX.COAST);
  const terrain = createTerrain(track);
  for (const u of [0.79, 0.8, 0.85, 0.88, 0.9]) {
    const f = track.frame(u * track.length);
    const clearance = f.p.y - terrain.heightAt(f.p.x, f.p.z);
    assert(
      clearance > 3.5 && clearance < 12,
      `continuous mole lost land support at ${u}: ${clearance}`,
    );
  }
  // The middle of the bay is fully excavated; its two ends retain shore transitions.
  for (const u of [0.85, 0.88]) {
    const f = track.frame(u * track.length);
    const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const sea = f.p.clone().addScaledVector(right, f.width + 120);
    assert(
      terrain.heightAt(sea.x, sea.z) < -20,
      `mole support filled the offshore inlet at ${u}`,
    );
  }
  const jump = track.frame(
    (track.config.jump + track.config.gapLength / 2) * track.length,
  );
  assert(
    jump.p.y - terrain.heightAt(jump.p.x, jump.p.z) > 35,
    "support bank must not fill the actual jump",
  );
  terrain.geometries.forEach((geometry) => geometry.dispose());
});

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

test("Solar's continuous rock cuttings occupy both approaches in the rendered collision terrain", () => {
  const track = makeTrack(TRACK_INDEX.SOLAR);
  const terrain = createTerrain(track);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = terrain.geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  meshes.forEach((mesh) => mesh.updateMatrixWorld());
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  // Independent world-space coverage probes: both passage regions must have
  // broad relief, not just a surviving instance counter or isolated rock prop.
  for (const [stations, side] of [
    [[0.145, 0.165, 0.185], -1],
    [[0.825, 0.845, 0.865], 1],
  ]) {
    for (const u of stations) {
      const f = track.frame(u * track.length);
      const forward = new THREE.Vector3(
        f.tangent.x,
        0,
        f.tangent.z,
      ).normalize();
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      for (const offset of [80, 110, 140]) {
        const p = f.p.clone().addScaledVector(right, side * (f.width + offset));
        const height = terrain.heightAt(p.x, p.z);
        assert(
          height > f.p.y + terrain.step,
          `continuous rock cutting missing at ${u}/${offset}`,
        );
        ray.set(p.clone().setY(height + 100), down);
        const hit = ray.intersectObjects(meshes)[0];
        assert(
          hit && Math.abs(hit.point.y - height) < 0.0001,
          "authored rock relief must be the actual rendered heightfield",
        );
        const sweep = terrain.sweepSurface(
          p.clone().setY(height + 20),
          p.clone().setY(height - 20),
          1.1,
        );
        assert(
          sweep && Math.abs(sweep.point.y - height) < 0.0001,
          "authored rock relief must also stop physical sweeps",
        );
      }
      const crest = f.p.clone().addScaledVector(right, side * (f.width + 110));
      const outside = f.p
        .clone()
        .addScaledVector(right, side * (f.width + 240));
      assert(
        terrain.heightAt(crest.x, crest.z) -
          terrain.heightAt(outside.x, outside.z) >
          terrain.step,
        "rock cutting must return to lower landscape outside its broad crest",
      );
    }
  }
  terrain.geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
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
