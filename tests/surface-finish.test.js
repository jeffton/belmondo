import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  scaleArchitectureBoxUV,
  applyArchitectureInstanceUV,
} from "../src/architecture-uv.ts";
import { courseArchitecture } from "../src/course-architecture.ts";
import { createRoadFinish } from "../src/road-finish.ts";
import { applyJumpMarkings } from "../src/jump-markings.ts";
import { makeTrack, TRACKS } from "../src/track.ts";

function span(geometry, axis) {
  const values = Array.from({ length: geometry.attributes.uv.count }, (_, i) =>
    axis === 0
      ? geometry.attributes.uv.getX(i)
      : geometry.attributes.uv.getY(i),
  );
  return Math.max(...values) - Math.min(...values);
}

test("physical atlas scale agrees on all six box faces without changing geometry", () => {
  const box = new THREE.BoxGeometry();
  const positions = box.attributes.position.array.slice();
  const normals = box.attributes.normal.array.slice();
  const indices = box.index.array.slice();
  scaleArchitectureBoxUV(box, [96, 48, 24], "facade");
  // Glazing atlas covers 12×24m: sides 24×48, roof 96×24, front 96×48.
  const expected = [
    [2, 2],
    [2, 2],
    [8, 1],
    [8, 1],
    [8, 2],
    [8, 2],
  ];
  for (let face = 0; face < 6; face++) {
    const values = Array.from({ length: 4 }, (_, j) => [
      box.attributes.uv.getX(face * 4 + j),
      box.attributes.uv.getY(face * 4 + j),
    ]);
    for (let axis = 0; axis < 2; axis++)
      assert.equal(
        Math.max(...values.map((v) => v[axis])) -
          Math.min(...values.map((v) => v[axis])),
        expected[face][axis],
      );
  }
  assert.deepEqual(box.attributes.position.array, positions);
  assert.deepEqual(box.attributes.normal.array, normals);
  assert.deepEqual(box.index.array, indices);
});

test("merged buildings keep physical UV scale, bounds and one batch per material", () => {
  const parent = new THREE.Group();
  const texture = new THREE.Texture();
  const builder = courseArchitecture(
    parent,
    "test",
    { concrete: texture },
    {
      wall: { color: 0xffffff, map: "concrete" },
    },
  );
  builder.box("wall", new THREE.Vector3(100, 20, -40), [64, 32, 16], 0.7);
  builder.box("wall", new THREE.Vector3(-100, 20, -40), [32, 16, 8]);
  const root = builder.finish();
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].geometry.attributes.position.count, 48);
  assert.equal(root.userData.parts.length, 2);
  assert.equal(span(root.children[0].geometry, 0), 4);
  assert.equal(span(root.children[0].geometry, 1), 1);
});

test("instance UV uses each rotated building's dimensions, preserving shared primitives and batches", () => {
  const primitive = new THREE.BoxGeometry();
  const originalUV = primitive.attributes.uv.array.slice();
  const material = new THREE.MeshLambertMaterial({ map: new THREE.Texture() });
  const mesh = new THREE.InstancedMesh(primitive, material, 2);
  const matrices = [
    [96, 48, 24],
    [12, 6, 3],
  ].map((scale, i) =>
    new THREE.Matrix4().compose(
      new THREE.Vector3(i * 20, 10, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.7, 0.1)),
      new THREE.Vector3(...scale),
    ),
  );
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  const transforms = mesh.instanceMatrix.array.slice();
  applyArchitectureInstanceUV(mesh, "facade");
  const dimensions = mesh.geometry.getAttribute("architectureDimensions");
  [96, 48, 24, 12, 6, 3].forEach((n, i) =>
    assert(Math.abs(dimensions.array[i] - n) < 0.00001),
  );
  assert.equal(dimensions.meshPerAttribute, 1);
  assert.deepEqual(mesh.instanceMatrix.array, transforms);
  assert.deepEqual(primitive.attributes.uv.array, originalUV);
  assert.equal(primitive.getAttribute("architectureDimensions"), undefined);
  assert.equal(mesh.geometry.index.count, primitive.index.count);
  const second = new THREE.InstancedMesh(primitive, material, 1);
  second.setMatrixAt(0, new THREE.Matrix4().makeScale(2, 3, 4));
  applyArchitectureInstanceUV(second, "facade");
  assert.equal(
    second.material,
    mesh.material,
    "shared compiled material variant",
  );
  assert.notEqual(second.geometry, mesh.geometry, "batch-local instance data");
  const shader = { vertexShader: THREE.ShaderLib.lambert.vertexShader };
  mesh.material.onBeforeCompile(shader, {});
  assert(shader.vertexShader.includes("attribute vec3 architectureDimensions"));
  assert(
    shader.vertexShader.includes("mapTransform * vec3(uv * architectureSize"),
  );
  assert(shader.vertexShader.includes("vec2(12.0, 24.0)"));
  assert.equal(
    material.onBeforeCompile,
    THREE.Material.prototype.onBeforeCompile,
  );
});

test("wet finish and diffuse mineral decks compose with real red jump asphalt", () => {
  const map = new THREE.Texture();
  const wet = new Set([
    "PALM BREAKER",
    "MONSOON",
    "NOCTILUCENT",
    "VESPER CIRCUIT",
  ]);
  for (const [index, config] of TRACKS.entries()) {
    const material = createRoadFinish(config.name, map);
    assert.equal(
      material.type,
      wet.has(config.name) ? "MeshPhongMaterial" : "MeshLambertMaterial",
    );
    assert.equal(material.map, map);
    assert.equal(material.vertexColors, true);
    assert.equal(material.transparent, false);
    const track = makeTrack(index);
    const paint = applyJumpMarkings(material, track);
    if (paint) {
      const shader =
        THREE.ShaderLib[wet.has(config.name) ? "phong" : "lambert"];
      const compiled = {
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader,
        uniforms: {},
      };
      material.onBeforeCompile(compiled, {});
      assert.equal(compiled.uniforms.jumpPaintOpacity.value, 0.6);
      assert(
        compiled.fragmentShader.includes(
          "mix(diffuseColor.rgb, jumpColor / jumpInk",
        ),
      );
      assert(
        compiled.fragmentShader.indexOf("mix(diffuseColor.rgb") <
          compiled.fragmentShader.indexOf("#include <color_fragment>"),
      );
      assert(
        compiled.fragmentShader.includes("#include <lights_fragment_begin>"),
      );
    }
  }
});
