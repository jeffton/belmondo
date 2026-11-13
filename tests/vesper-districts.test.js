import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack } from "../src/track.js";
import { createTerrain } from "../src/terrain.js";
import {
  buildMetropolis,
  clearsMetropolisRoad,
} from "../src/metropolis-world.js";
import {
  buildVesperDistricts,
  overlapsVesperVolume,
  VESPER_DISTRICTS,
} from "../src/vesper-districts.js";

test("Vesper inhabited districts preserve road, advertising views and complete architectural footprints", () => {
  const track = makeTrack(6);
  const terrain = createTerrain(track);
  const parts = [];
  const architecture = buildVesperDistricts(
    track,
    { terrain, heightAt: terrain.heightAt },
    (material, center, yaw, dims) =>
      parts.push({ material, center, yaw, dims }),
    clearsMetropolisRoad,
  );
  for (const district of VESPER_DISTRICTS)
    assert(architecture.districtCounts[district.name] > 0, district.name);
  for (const [i, volume] of architecture.volumes.entries()) {
    assert(clearsMetropolisRoad(volume, terrain.samples));
    for (const other of architecture.volumes.slice(i + 1))
      assert(
        !overlapsVesperVolume(volume, other),
        "complete city blocks cannot intersect",
      );
    for (const reservation of architecture.reservations)
      assert(
        !overlapsVesperVolume(volume, reservation, 3),
        "ads retain their actual face/post footprints and approach view",
      );
  }
  assert(
    architecture.inhabitants.length > 0,
    "market balconies have inhabitants",
  );
  for (const person of architecture.inhabitants) {
    assert(
      architecture.solids.every((wall) => !overlapsVesperVolume(person, wall)),
      "market occupants stand outside opaque building masses, not inside the shop wall",
    );
  }
  // Test the submitted decorative geometry, not only its declared envelopes.
  // All box/cylinder/crown shapes fit their unit cube before the supplied scale.
  for (const part of parts) {
    const corners = [-1, 1].flatMap((x) =>
      [-1, 1].flatMap((y) =>
        [-1, 1].map((z) =>
          new THREE.Vector3(
            (x * part.dims[0]) / 2,
            (y * part.dims[1]) / 2,
            (z * part.dims[2]) / 2,
          )
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), part.yaw)
            .add(part.center),
        ),
      ),
    );
    assert(
      architecture.volumes.some((v) =>
        corners.every((p) => {
          const d = p.clone().sub(v.center);
          return (
            Math.abs(d.dot(v.right)) <= v.width / 2 + 0.001 &&
            Math.abs(d.dot(v.forward)) <= v.depth / 2 + 0.001 &&
            p.y >= v.bottom - 0.001 &&
            p.y <= v.top + 0.001
          );
        }),
      ),
      "every facade, balcony, planter, person and machine fits an actually checked road-clear building",
    );
  }
  terrain.geometries.forEach((g) => g.dispose());
});

test("Vesper commuter movement stays inside checked lanes and all tram piers clear the race", () => {
  const track = makeTrack(6);
  const terrain = createTerrain(track);
  const scene = new THREE.Scene();
  const city = buildMetropolis(
    scene,
    track,
    { concrete: null },
    { terrain, heightAt: terrain.heightAt },
  );
  const root = scene.getObjectByName("metropolis-districts");
  const lanes = root.userData.trafficLanes;
  assert.equal(
    lanes.length,
    5,
    "all five deliberately placed service movements are feasible",
  );
  assert(
    lanes.some(
      (lane) => lane.kind === "civic-skytram" && lane.piers.length === 4,
    ),
  );
  const traffic = root.getObjectByName("vesper-city-traffic");
  assert.equal(traffic.count, 15);
  const positions = traffic.geometry.attributes.position;
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  let moving = false;
  const first = new THREE.Matrix4();
  traffic.getMatrixAt(0, first);
  for (const time of [0, 1.5, 5, 10, 19, 40, 70]) {
    city.update(time);
    for (const [index, lane] of lanes.entries()) {
      for (const volume of [lane, ...lane.piers]) {
        assert(clearsMetropolisRoad(volume, terrain.samples));
        assert(
          root.userData.volumes.every(
            (v) => !overlapsVesperVolume(volume, v, 2),
          ),
        );
        assert(
          root.userData.advertisingReservations.every(
            (v) => !overlapsVesperVolume(volume, v, 4),
          ),
        );
      }
      for (let car = 0; car < 3; car++) {
        traffic.getMatrixAt(index * 3 + car, matrix);
        scale.setFromMatrixScale(matrix);
        if (index === 0 && car === 0 && !matrix.equals(first)) moving = true;
        if (scale.lengthSq() === 0) continue;
        for (let vertex = 0; vertex < positions.count; vertex++) {
          const p = new THREE.Vector3()
            .fromBufferAttribute(positions, vertex)
            .applyMatrix4(matrix);
          const local = p.clone().sub(lane.center);
          assert(Math.abs(local.dot(lane.right)) <= lane.width / 2 + 0.001);
          assert(Math.abs(local.dot(lane.forward)) <= lane.depth / 2 + 0.001);
          assert(p.y >= lane.bottom && p.y <= lane.top);
          assert(
            traffic.boundingSphere.containsPoint(p),
            "animated mesh bounds cover the whole service lane",
          );
        }
      }
    }
  }
  assert(moving, "service vehicles actually move through the city");
  const geometries = new Set(),
    materials = new Set();
  scene.traverse((mesh) => {
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) materials.add(mesh.material);
    if (mesh.isInstancedMesh) mesh.dispose();
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  terrain.geometries.forEach((g) => g.dispose());
});
