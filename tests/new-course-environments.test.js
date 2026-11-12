import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACKS } from "../src/track.js";
import { buildEnvironment } from "../src/environment.js";
import { buildCity } from "../src/city.js";
import { createTerrain } from "../src/terrain.js";
import {
  getFinishDistrictLayout,
  buildFinishDistrict,
} from "../src/finish-district.js";

function dispose(scene) {
  const geometries = new Set(),
    materials = new Set();
  scene.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) materials.add(o.material);
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}

for (const name of ["WHITEOUT", "MONSOON", "CINDERLINE"]) {
  test(`${name}: actual banked deck and both forks remain above exact rendered ground triangles`, () => {
    const index = TRACKS.findIndex((c) => c.name === name);
    assert(index >= 0, "new course is registered");
    const track = makeTrack(index),
      terrain = createTerrain(track);
    let grounded = 0,
      total = 0;
    for (let i = 0; i < 900; i++) {
      const u = i / 900;
      for (const branch of u > track.config.split[0] &&
      u < track.config.split[1]
        ? [-1, 1]
        : [0]) {
        const f = track.frame(u * track.length, branch),
          b = track.bounds(u * track.length, branch);
        for (const lateral of [b.clipMin, 0, b.clipMax]) {
          const p = f.p.clone().addScaledVector(f.right, lateral);
          const clearance = p.y - terrain.heightAt(p.x, p.z);
          assert(
            clearance > 3.5,
            `terrain at ${u}/${branch}/${lateral}: ${clearance}`,
          );
          if (clearance < 12) grounded++;
          total++;
        }
      }
    }
    assert(
      grounded / total > 0.85,
      `route is on real land (${grounded}/${total}), not columns`,
    );
    // Raycast the actual triangle indices, not another copy of the height math.
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes = terrain.geometries.map((g) => new THREE.Mesh(g, material));
    meshes.forEach((m) => m.updateMatrixWorld());
    const ray = new THREE.Raycaster();
    for (let i = 0; i < 24; i++) {
      const f = track.frame(((i + 0.37) / 24) * track.length);
      const p = f.p.clone().addScaledVector(f.right, 63.7);
      ray.set(new THREE.Vector3(p.x, 600, p.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(meshes)[0];
      assert(hit, "land has a rendered triangle here");
      assert(Math.abs(hit.point.y - terrain.heightAt(p.x, p.z)) < 0.001);
      const collision = terrain.sweepSurface(
        new THREE.Vector3(p.x, 600, p.z),
        new THREE.Vector3(p.x, -100, p.z),
      );
      assert(collision && Math.abs(collision.point.y - hit.point.y) < 0.001);
    }
    if (name === "WHITEOUT")
      assert(
        terrain.heightAt(530, 0) - terrain.heightAt(0, 0) > 100,
        "spiral actually sits inside an enclosing glacial basin",
      );
    meshes.forEach((m) => m.geometry.dispose());
    material.dispose();
  });

  test(`${name}: grounded purposeful architecture clears every route, including support corridors`, () => {
    const track = makeTrack(TRACKS.findIndex((c) => c.name === name));
    const scene = new THREE.Scene();
    const textures = {
      concrete: null,
      paint: null,
      facade: null,
      road: null,
      edge: null,
    };
    const env = buildEnvironment(scene, track, textures);
    buildCity(scene, track, textures, env);
    const root = scene.getObjectByName(`${track.config.biome}-districts`);
    assert(root && root.userData.footprints.length >= 6);
    for (const f of root.userData.footprints) {
      for (const p of f.contacts) assert(p.y >= f.bottom && p.y < f.deck);
      // Interior peaks and rotated edges are enclosed by the actual foundation,
      // not merely a max taken at the footprint centre or its four corners.
      for (let x = -0.5; x <= 0.5; x += 0.1)
        for (let z = -0.5; z <= 0.5; z += 0.1) {
          const p = f.center
            .clone()
            .addScaledVector(f.right, x * f.width)
            .addScaledVector(f.forward, z * f.depth);
          assert(env.heightAt(p.x, p.z) < f.deck);
          assert(env.heightAt(p.x, p.z) > f.bottom);
        }
      for (const r of env.terrain.samples) {
        const d = r.p.clone().sub(f.center);
        const x = Math.max(0, Math.abs(d.dot(f.right)) - f.width / 2);
        const z = Math.max(0, Math.abs(d.dot(f.forward)) - f.depth / 2);
        assert(
          Math.hypot(x, z) > r.width + 9.99,
          `${f.name} enters a physical fork`,
        );
      }
    }
    scene.updateMatrixWorld(true);
    const meshes = [];
    root.traverse((o) => {
      if (o.isMesh) meshes.push(o);
    });
    const ray = new THREE.Raycaster();
    for (let i = 0; i < 300; i++) {
      const u = i / 300;
      for (const branch of u > track.config.split[0] &&
      u < track.config.split[1]
        ? [-1, 1]
        : [0]) {
        const f = track.frame(u * track.length, branch);
        for (const x of [-f.width, 0, f.width]) {
          const p = f.p.clone().addScaledVector(f.right, x);
          ray.set(p, new THREE.Vector3(0, 1, 0));
          ray.far = 120;
          assert.equal(
            ray.intersectObjects(meshes).length,
            0,
            `actual scene triangles over route ${u}/${branch}/${x}`,
          );
        }
      }
    }
    let triangles = 0;
    for (const mesh of meshes) {
      triangles +=
        ((mesh.geometry.index
          ? mesh.geometry.index.count
          : mesh.geometry.attributes.position.count) /
          3) *
        (mesh.isInstancedMesh ? mesh.count : 1);
      assert.equal(mesh.material.transparent, false);
      assert(mesh.geometry.boundingSphere, "spatial culling bounds exist");
    }
    assert(Number.isFinite(triangles));
    const finish = getFinishDistrictLayout(track);
    assert(
      finish.every(
        (f) =>
          !f.kind.includes("civic") &&
          !f.kind.includes("sandstone") &&
          !f.kind.includes("quay"),
      ),
    );
    buildFinishDistrict(scene, track, textures, env);
    if (name === "MONSOON") {
      const lock = root.getObjectByName("curved-dry-lock-reservoirs");
      assert(lock, "the dry lock has continuous grounded reservoir geometry");
      const data = lock.userData;
      for (const p of data.groundingContacts)
        assert(env.heightAt(p.x, p.z) - p.y >= 0.999);
      for (let i = 0; i < data.waterContacts.length; i += 2) {
        const next = i + 2;
        if (
          next >= data.waterContacts.length ||
          data.waterContacts[i].distanceTo(data.waterContacts[next]) > 40
        )
          continue;
        const p = data.waterContacts[i]
          .clone()
          .add(data.waterContacts[i + 1])
          .add(data.waterContacts[next])
          .add(data.waterContacts[next + 1])
          .multiplyScalar(0.25);
        assert(
          env.heightAt(p.x, p.z) < data.waterLevel - 1,
          "water stays above its land basin",
        );
        for (const f of root.userData.footprints) {
          const offset = p.clone().sub(f.center);
          assert(
            f.kind === "pump-island" ||
              Math.abs(offset.dot(f.right)) > f.width / 2 ||
              Math.abs(offset.dot(f.forward)) > f.depth / 2,
            `${f.name} must not occupy the retained reservoir`,
          );
        }
        ray.set(
          p.clone().add(new THREE.Vector3(0, 1, 0)),
          new THREE.Vector3(0, -1, 0),
        );
        ray.far = 2;
        const hit = ray.intersectObject(lock)[0];
        assert(
          hit && Math.abs(hit.point.y - data.waterLevel) < 0.001,
          "actual opaque water surface matches reservoir level",
        );
      }
      // Horizontal rays through the actual inner wall near ground level expose
      // floating segments that endpoint-only contact metadata cannot detect.
      for (let i = 0; i < 400; i++) {
        const u =
          data.range[0] + ((data.range[1] - data.range[0]) * (i + 0.5)) / 400;
        const f = track.frame(u * track.length);
        const right = new THREE.Vector3(
          f.tangent.z,
          0,
          -f.tangent.x,
        ).normalize();
        for (const side of [-1, 1])
          for (const wallOffset of [14, 98]) {
            const wall = f.p
              .clone()
              .addScaledVector(right, side * (f.width + wallOffset));
            const direction = side * (wallOffset === 14 ? 1 : -1);
            const from = wall.clone().addScaledVector(right, -direction * 2);
            from.y = env.heightAt(wall.x, wall.z) + 0.5;
            ray.set(from, right.clone().multiplyScalar(direction));
            ray.far = 5;
            assert(
              ray.intersectObject(lock).length > 0,
              `retaining wall grounds between stations at ${u}/${side}/${wallOffset}`,
            );
          }
      }
      const island = root.userData.footprints.find(
        (f) => f.kind === "pump-island",
      );
      assert(
        island && island.deck > data.waterLevel,
        "pump island has an above-water foundation",
      );
      for (let i = 0; i <= 10; i++) {
        const u = data.range[0] + ((data.range[1] - data.range[0]) * i) / 10;
        assert(
          track.frame(u * track.length).p.y < data.waterLevel - 15,
          "dry lock road lies below neighboring reservoirs",
        );
      }
    }
    dispose(scene);
  });
}

test("unknown courses do not silently become coastal scenery", () => {
  const track = makeTrack(0);
  track.config = { ...track.config, name: "UNKNOWN" };
  assert.throws(() => createTerrain(track), /Unknown course environment/);
});
