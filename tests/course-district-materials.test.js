import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACKS } from "../src/track.ts";
import { createTerrain } from "../src/terrain.ts";
import { buildNewCourseDistricts } from "../src/new-course-environments.ts";
import { newCourseRecipe } from "../src/new-course-recipes.ts";

function districtFixture(t, name) {
  const track = makeTrack(TRACKS.findIndex((course) => course.name === name));
  const terrain = createTerrain(track);
  const scene = new THREE.Scene();
  const textures = Object.fromEntries(
    ["concrete", "paint", "water"].map((key) => [key, new THREE.Texture()]),
  );
  const naturalMap = new THREE.Texture();
  buildNewCourseDistricts(scene, track, textures, {
    terrain,
    heightAt: terrain.heightAt,
    naturalMap,
  });
  const root = scene.getObjectByName(`${track.config.biome}-districts`);
  t.after(() => {
    const geometries = new Set(terrain.geometries);
    const materials = new Set();
    scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material)
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material])
          materials.add(material);
      if (object.isInstancedMesh) object.dispose();
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    [...Object.values(textures), naturalMap].forEach((map) => map.dispose());
  });
  return { root, textures, recipe: newCourseRecipe(track) };
}

for (const name of ["WHITEOUT", "MONSOON", "CINDERLINE"]) {
  test(`${name}: rendered technical panels have a different material surface from concrete walls`, (t) => {
    const { root, textures, recipe } = districtFixture(t, name);
    const panels = root.children.filter(
      (mesh) =>
        mesh.isInstancedMesh && mesh.material.color.getHex() === 0x203841,
    );
    const walls = root.children.filter(
      (mesh) =>
        mesh.isInstancedMesh && mesh.material.color.getHex() === recipe.wall,
    );
    assert(panels.length > 0 && walls.length > 0);
    for (const mesh of panels) {
      assert.equal(mesh.material.map, textures.paint);
      assert.notEqual(mesh.material.map, textures.concrete);
    }
    for (const mesh of walls)
      assert.equal(mesh.material.map, textures.concrete);
  });
}

test("Monsoon's retained reservoir renders with the water texture, not concrete panels", (t) => {
  const { root, textures } = districtFixture(t, "MONSOON");
  const reservoir = root.userData.footprints.find(
    (f) => f.kind === "reservoir",
  );
  const surfaces = root.children.filter(
    (mesh) => mesh.isInstancedMesh && mesh.material.color.getHex() === 0x34766f,
  );
  assert(reservoir && surfaces.length > 0);
  const matrix = new THREE.Matrix4();
  const center = new THREE.Vector3();
  let coversReservoir = false;
  for (const mesh of surfaces) {
    assert.equal(mesh.material.map, textures.water);
    assert.equal(mesh.material.transparent, false);
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      center.setFromMatrixPosition(matrix);
      if (
        center.distanceTo(
          reservoir.center.clone().setY(reservoir.waterLevel - 0.3),
        ) < 0.001
      )
        coversReservoir = true;
    }
  }
  assert(coversReservoir, "the actual retained pool uses the water material");
});

test("Whiteout's laboratories and weather stations retain orange identifiers without orange building shells", (t) => {
  const { root } = districtFixture(t, "WHITEOUT");
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  for (const footprint of root.userData.footprints.filter((f) =>
    ["weather", "observatory", "survey"].includes(f.kind),
  )) {
    let orangeVolume = 0;
    let wallVolume = 0;
    for (const part of root.userData.parts) {
      part.matrix.decompose(position, rotation, scale);
      const offset = position.clone().sub(footprint.center);
      if (
        position.y <= footprint.deck + 0.5 ||
        Math.abs(offset.dot(footprint.right)) > footprint.width / 2 ||
        Math.abs(offset.dot(footprint.forward)) > footprint.depth / 2
      )
        continue;
      const volume = scale.x * scale.y * scale.z;
      if (part.material === "accent") orangeVolume += volume;
      if (part.material === "wall") wallVolume += volume;
    }
    assert(
      orangeVolume > 0,
      `${footprint.name} retains a functional identifier`,
    );
    assert(
      wallVolume > orangeVolume,
      `${footprint.name}: the neutral building shell dominates its orange equipment/entry accents`,
    );
  }
});
