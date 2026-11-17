import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { createTerrain } from "../src/terrain.ts";
import { buildWhiteoutObservatory } from "../src/whiteout-observatory.ts";
import { buildMonsoonPumpChamber } from "../src/monsoon-pump-chamber.ts";

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
    const p = f.p.clone().addScaledVector(f.right, 67);
    ray.set(p.clone().setY(p.y + 40), new THREE.Vector3(0, -1, 0));
    ray.far = 35;
    assert(
      ray.intersectObjects(meshes).length > 0,
      `connected gallery surface at ${u}`,
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
  // Overflow faces carry the same 42m reservoir head down to the 16m race.
  for (const u of [0.342, 0.414, 0.491]) {
    const f = track.frame(u * track.length);
    const right = new THREE.Vector3(f.tangent.z, 0, -f.tangent.x).normalize();
    const from = f.p
      .clone()
      .addScaledVector(right, f.width + 11)
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
