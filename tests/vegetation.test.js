import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACKS } from "../src/track.js";
import { buildEnvironment } from "../src/environment.js";
import { buildCity } from "../src/city.js";
import { createTerrain } from "../src/terrain.js";
import {
  buildVegetation,
  vegetationObstacles,
  vegetationRoadClear,
  VEGETATION_PROFILES,
} from "../src/vegetation.js";

const textures = Object.fromEntries(
  ["concrete", "road", "facade", "paint", "edge"].map((name) => [name, null]),
);
function dispose(scene) {
  const geometries = new Set(),
    materials = new Set(),
    maps = new Set();
  scene.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) {
      materials.add(o.material);
      if (o.material.map) maps.add(o.material.map);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  maps.forEach((m) => m.dispose());
}

for (let index = 0; index < TRACKS.length; index++) {
  test(`${TRACKS[index].name}: rendered plants root in terrain, clear all forks and existing scenery`, () => {
    const track = makeTrack(index),
      scene = new THREE.Scene();
    const environment = buildEnvironment(scene, track, textures);
    buildCity(scene, track, textures, environment);
    const occupied = vegetationObstacles(scene);
    const root = buildVegetation(scene, track, environment);
    const plants = root.userData.plants;
    const profile = VEGETATION_PROFILES[track.config.name];
    if (track.config.name === "WHITEOUT") {
      assert.equal(plants.length, 0, "glacial basin is not a forest");
      assert.equal(root.children.length, 0, "no unused GPU resources");
      dispose(scene);
      return;
    }
    assert(
      plants.length > 0,
      "biome has actual accepted vegetation, not only a scatter recipe",
    );
    if (["KAISEKI COAST", "MONSOON"].includes(track.config.name)) {
      assert(plants.some((p) => p.species === "palm"));
      assert(plants.some((p) => p.species === "tree"));
      assert(plants.some((p) => p.species === "bush"));
    }
    if (track.config.name === "CINDERLINE") {
      assert(plants.every((p) => p.species === "scrub"));
      assert(
        plants.every(
          (p) => Math.sin(p.root.x * 0.013 + p.root.z * 0.009) <= 0.8,
        ),
        "no plants on mineral staining",
      );
    }
    const matrix = new THREE.Matrix4(),
      vertex = new THREE.Vector3();
    let instances = 0,
      triangles = 0;
    const material = new Set();
    for (const mesh of root.children) {
      assert(mesh.isInstancedMesh);
      material.add(mesh.material);
      assert.equal(mesh.material.transparent, false, "no alpha overdraw");
      assert.equal(mesh.material.map, null, "no vegetation texture allocation");
      const positions = mesh.geometry.attributes.position;
      // Three 20-face crowns plus two 20-face stems are the most complex model.
      assert(positions.count / 3 <= 3 * 20 + 2 * 20);
      triangles += (mesh.count * positions.count) / 3;
      instances += mesh.count;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        const actualBox = new THREE.Box3();
        const actualVertices = [];
        for (let j = 0; j < positions.count; j++) {
          vertex.fromBufferAttribute(positions, j).applyMatrix4(matrix);
          actualBox.expandByPoint(vertex);
          actualVertices.push(vertex.clone());
        }
        assert(
          mesh.boundingBox.containsBox(actualBox),
          "batch bounds contain rendered foliage",
        );
        assert(
          vegetationRoadClear(actualBox, environment.terrain.samples),
          "whole crown clears road and sight corridor, not only its root",
        );
        assert(
          !occupied.intersects(actualBox.clone().expandByScalar(2.9)),
          "no foliage in water, mountains, foundations or buildings",
        );
        const height = actualBox.max.y - actualBox.min.y;
        const feet = actualVertices.filter(
          (v) => v.y <= actualBox.min.y + height * 0.2,
        );
        const differences = feet.map(
          (v) => environment.heightAt(v.x, v.z) - v.y,
        );
        assert(
          Math.min(...differences) > 0.17,
          "all transformed lower contacts embedded, no floating trunks",
        );
        assert(
          Math.min(...differences) < 0.2,
          "at least one real lower contact touches the terrain",
        );
        for (const v of actualVertices.filter(
          (v) => v.y > actualBox.min.y + height * 0.35,
        ))
          assert(
            v.y > environment.heightAt(v.x, v.z),
            "visible crown above terrain",
          );
      }
    }
    assert.equal(instances, plants.length);
    assert.equal(material.size, 1, "all species share one material");
    assert(
      root.children.length <= new Set(profile.species).size,
      "one draw call per used species",
    );
    const maximumGroves = profile.ranges.reduce(
      (n, [a, b]) =>
        n + Math.ceil(((b - a) * track.length) / (profile.spacing * 0.7)),
      0,
    );
    assert(
      instances <= maximumGroves * (profile.cluster[1] - 1),
      "instance budget derives from authored grove spacing and size",
    );
    assert(
      triangles <= instances * 100,
      "triangle budget scales with the actual low-poly silhouettes",
    );
    const secondScene = new THREE.Scene();
    scene.remove(root);
    const repeat = buildVegetation(scene, track, environment);
    assert.deepEqual(
      repeat.userData.plants.map((p) => p.matrix.elements),
      plants.map((p) => p.matrix.elements),
      "placements reproduce without a per-frame generator",
    );
    secondScene.add(root);
    dispose(secondScene);
    dispose(scene);
  });
}

test("placements follow moved and lengthened authored frames, not a fixed map rectangle", () => {
  const source = makeTrack(0),
    offset = new THREE.Vector3(1900, 0, -1700),
    scale = 1.7;
  const track = {
    ...source,
    length: source.length * scale,
    frame(s, branch) {
      const f = source.frame(s / scale, branch);
      return { ...f, p: f.p.clone().add(offset) };
    },
    bounds: (s, branch) => source.bounds(s / scale, branch),
  };
  const terrain = createTerrain(track),
    scene = new THREE.Scene();
  const root = buildVegetation(scene, track, { terrain });
  assert(root.userData.plants.length > 0);
  for (const plant of root.userData.plants) {
    const f = track.frame(plant.u * track.length);
    assert(
      plant.root.distanceTo(f.p) < 300,
      "cluster anchored to its actual course station",
    );
    assert(
      plant.root.distanceTo(source.frame(plant.u * source.length).p) > 2000,
      "not left behind in old world coordinates",
    );
    assert(vegetationRoadClear(plant.box, terrain.samples));
  }
  terrain.geometries.forEach((g) => g.dispose());
  dispose(scene);
});

test("obstacle occupancy uses individual instances and merged triangles, not empty space between them", () => {
  const scene = new THREE.Scene(),
    geometry = new THREE.BoxGeometry(10, 10, 10),
    material = new THREE.MeshBasicMaterial();
  const instances = new THREE.InstancedMesh(geometry, material, 2);
  instances.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-100, 10, 0));
  instances.setMatrixAt(1, new THREE.Matrix4().makeTranslation(100, 10, 0));
  scene.add(instances);
  const occupied = vegetationObstacles(scene);
  const box = (x) =>
    new THREE.Box3(
      new THREE.Vector3(x - 1, 8, -1),
      new THREE.Vector3(x + 1, 12, 1),
    );
  assert(occupied.intersects(box(-100)));
  assert(occupied.intersects(box(100)));
  assert(
    !occupied.intersects(box(0)),
    "grove can occupy the real gap between distant structures",
  );
  dispose(scene);
});
