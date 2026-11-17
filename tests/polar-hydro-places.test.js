import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX, TRACKS } from "../src/track.ts";
import { createTerrain } from "../src/terrain.ts";
import { buildWhiteoutObservatory } from "../src/whiteout-observatory.ts";
import { buildMonsoonPumpChamber } from "../src/monsoon-pump-chamber.ts";

test("WHITEOUT inner-basin rewrite retains introduction, valley and both ridge centrelines exactly", () => {
  const index = TRACK_INDEX.WHITEOUT;
  const config = TRACKS[index];
  const track = makeTrack(index);
  let baseline;
  try {
    TRACKS[index] = { ...config, returnRoute: undefined };
    baseline = makeTrack(index);
  } finally {
    TRACKS[index] = config;
  }
  let moved = 0;
  for (let i = 0; i < 1000; i++) {
    const u = i / 1000;
    for (const branch of [-1, 0, 1]) {
      const f = track.frame(u * track.length, branch);
      const old = baseline.frame(u * baseline.length, branch);
      if (u < 0.309 || u > 0.491) {
        assert(
          f.p.distanceTo(old.p) < 1e-8,
          "local route cannot reparameterise the rest of the course",
        );
      } else moved = Math.max(moved, f.p.distanceTo(old.p));
    }
  }
  assert(
    moved > track.config.width * 2,
    "inner basin changes actual line, not cosmetic sub-road nudges",
  );
});

const textures = {
  concrete: new THREE.Texture(),
  paint: new THREE.Texture(),
  water: new THREE.Texture(),
};
function site(index, build) {
  const track = makeTrack(index);
  const terrain = createTerrain(track);
  const root = build(new THREE.Group(), track, textures, {
    terrain,
    heightAt: terrain.heightAt,
  });
  root.updateMatrixWorld(true);
  return { track, terrain, root };
}
function dispose(root, terrain) {
  root.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  terrain.geometries.forEach((g) => g.dispose());
}

test("WHITEOUT observatory is grounded as one basin installation and clears the complete spiral", () => {
  const { track, terrain, root } = site(
    TRACK_INDEX.WHITEOUT,
    buildWhiteoutObservatory,
  );
  const ray = new THREE.Raycaster();
  const meshes = root.children;
  assert.equal(
    root.getObjectByName("whiteout-basin-observatory-foundation").material.map,
    textures.concrete,
  );
  assert.equal(
    root.getObjectByName("whiteout-basin-observatory-shell").material.map,
    textures.paint,
  );
  assert.equal(
    root.getObjectByName("whiteout-basin-observatory-glazing").material.map,
    null,
    "optics do not inherit concrete cassette panels",
  );
  const { footing, deck } = root.userData;
  for (const p of footing.contacts) assert(p.y > footing.bottom && p.y < deck);
  // Check real scene triangles across all road widths, not only programme boxes.
  for (let u = 0.275; u < 0.49; u += 0.0005) {
    const f = track.frame(u * track.length);
    for (const x of [-f.width, 0, f.width]) {
      const p = f.p.clone().addScaledVector(f.right, x);
      ray.set(p, new THREE.Vector3(0, 1, 0));
      ray.far = 200;
      assert.equal(
        ray.intersectObjects(meshes).length,
        0,
        "installation never covers the racing basin",
      );
    }
  }
  // A continuous gallery must be present next to the changing spiral, not
  // merely a centrepoint tagged as an observatory that the driver never sees.
  for (const u of [0.3, 0.34, 0.38, 0.42, 0.445]) {
    const f = track.frame(u * track.length);
    const p = f.p.clone().addScaledVector(f.right, 44);
    ray.set(p.clone().setY(p.y + 40), new THREE.Vector3(0, -1, 0));
    ray.far = 35;
    const hit = ray.intersectObjects(meshes)[0];
    assert(
      hit && hit.point.y > f.p.y + 30,
      `exterior optical vault, not its flat substrate, is rendered at ${u}`,
    );
  }
  dispose(root, terrain);
});

test("MONSOON visible low water race, retained depth and gate carriage are actual clear scene geometry", () => {
  const { track, terrain, root } = site(
    TRACK_INDEX.MONSOON,
    buildMonsoonPumpChamber,
  );
  const water = root.getObjectByName("monsoon-pump-chamber-water");
  assert.equal(water.material.map, textures.water);
  assert.equal(
    root.getObjectByName("monsoon-pump-chamber-machinery").material.map,
    textures.paint,
  );
  assert.equal(
    root.getObjectByName("monsoon-pump-chamber-concrete").material.map,
    textures.concrete,
  );
  const ray = new THREE.Raycaster();
  for (const sample of root.userData.waterContacts) {
    assert(sample.point.y > terrain.heightAt(sample.point.x, sample.point.z));
    ray.set(
      sample.point.clone().add(new THREE.Vector3(0, 1, 0)),
      new THREE.Vector3(0, -1, 0),
    );
    ray.far = 2;
    assert(ray.intersectObject(water).length > 0);
  }
  // The full visible pool, including both shoulders, occupies real excavated
  // terrain; centreline-only samples cannot detect shoreline ridges through it.
  for (let u = 0.27; u < 0.545; u += 0.003) {
    const f = track.frame(u * track.length);
    const right = new THREE.Vector3(f.tangent.z, 0, -f.tangent.x).normalize();
    for (const offset of [5, 20, 40, 60, 80, 109]) {
      const p = f.p
        .clone()
        .addScaledVector(right, f.width + offset)
        .setY(f.p.y - 7);
      assert(
        terrain.heightAt(p.x, p.z) < p.y - 1,
        "complete low race is excavated below its waterline",
      );
      ray.set(
        p.clone().add(new THREE.Vector3(0, 1, 0)),
        new THREE.Vector3(0, -1, 0),
      );
      ray.far = 2;
      assert(
        ray.intersectObject(water).length > 0,
        "full-width water is actual shared strip geometry",
      );
    }
  }
  for (const u of root.userData.gateStations) {
    const f = track.frame(u * track.length);
    for (const x of [-f.width, 0, f.width]) {
      ray.set(
        f.p.clone().addScaledVector(f.right, x),
        new THREE.Vector3(0, 1, 0),
      );
      ray.far = 100;
      const hit = ray.intersectObjects(root.children)[0];
      assert(
        hit && hit.distance >= 39,
        "full banked racing width clears real gantry underside",
      );
    }
  }
  const groundMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
  });
  const groundMeshes = terrain.geometries.map(
    (g) => new THREE.Mesh(g, groundMaterial),
  );
  groundMeshes.forEach((m) => m.updateMatrixWorld());
  for (const u of [0.29, 0.414, 0.535]) {
    const f = track.frame(u * track.length);
    const p = f.p
      .clone()
      .addScaledVector(
        new THREE.Vector3(f.tangent.z, 0, -f.tangent.x).normalize(),
        f.width + 70,
      );
    const from = p.clone().setY(80),
      to = p.clone().setY(-80);
    ray.set(from, new THREE.Vector3(0, -1, 0));
    ray.far = 160;
    const rendered = ray.intersectObjects(groundMeshes)[0];
    const collision = terrain.sweepSurface(from, to);
    assert(rendered && collision);
    assert(Math.abs(rendered.point.y - terrain.heightAt(p.x, p.z)) < 0.001);
    assert(
      Math.abs(rendered.point.y - collision.point.y) < 0.001,
      "excavated visual ground and physical terrain are the same surface",
    );
  }
  groundMaterial.dispose();
  // Overflow faces expose the 42m reservoir head above the excavated 3m race.
  for (const u of [0.342, 0.414, 0.491]) {
    const f = track.frame(u * track.length);
    const right = new THREE.Vector3(f.tangent.z, 0, -f.tangent.x).normalize();
    const from = f.p
      .clone()
      .addScaledVector(right, f.width + 109)
      .setY(30);
    ray.set(from, right);
    ray.far = 4;
    assert(
      ray.intersectObject(water).length > 0,
      "visible overflow connects the two water elevations",
    );
  }
  dispose(root, terrain);
});
