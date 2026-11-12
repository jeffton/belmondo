import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACKS } from "../src/track.js";
import { buildEnvironment } from "../src/environment.js";
import { buildHydraulicLock } from "../src/hydraulic-lock.js";
import { terrainFootprint } from "../src/terrain-footprint.js";

function fixture() {
  // Parent owns route configuration; exercise its refined contract without
  // editing that owner's file in this isolated architecture worktree.
  const original = TRACKS[4];
  TRACKS[4] = {
    ...original,
    fork: {
      ...original.fork,
      offsets: [-75, 70],
      riseProfile: [0.22, 0.46, 0.58, 0.78],
    },
    sections: {
      ...original.sections,
      pressureConduit: [0.81, 0.9],
      reservoirWalkway: [0.81, 0.9],
    },
  };
  const track = makeTrack(4),
    scene = new THREE.Scene();
  TRACKS[4] = original;
  const textures = Object.fromEntries(
    ["concrete", "road", "paint", "edge", "facade"].map((name) => [
      name,
      new THREE.Texture(),
    ]),
  );
  const environment = buildEnvironment(scene, track, textures);
  buildHydraulicLock(scene, track, textures, environment);
  scene.updateMatrixWorld(true);
  return {
    track,
    scene,
    environment,
    root: scene.getObjectByName("monsoon-hydraulic-fork"),
  };
}

test("fork hydraulic architecture has grounded foundations and a real retained balance reservoir", () => {
  const { root, scene, environment } = fixture();
  assert(root);
  let draws = 0;
  root.traverse((object) => {
    if (object.isMesh) draws++;
  });
  assert.equal(draws, 4);
  for (const foundation of root.userData.foundations) {
    const samples = terrainFootprint(
      environment.terrain,
      foundation.center,
      foundation.right,
      foundation.forward,
      foundation.width,
      foundation.depth,
    );
    assert(samples.every((p) => foundation.bottom < p.y));
    assert(foundation.top > foundation.bottom);
  }
  const water = root.getObjectByName("fork-retained-reservoir");
  const positions = water.geometry.attributes.position;
  const concrete = root.getObjectByName("fork-concrete");
  const matrix = new THREE.Matrix4();
  for (const foundation of root.userData.foundations) {
    let instanceMatrix;
    for (let i = 0; i < concrete.count; i++) {
      concrete.getMatrixAt(i, matrix);
      const center = new THREE.Vector3().setFromMatrixPosition(matrix);
      if (
        Math.hypot(
          center.x - foundation.center.x,
          center.z - foundation.center.z,
        ) < 0.001 &&
        Math.abs(center.y - (foundation.bottom + foundation.top) / 2) < 0.001
      )
        instanceMatrix = matrix.clone();
    }
    assert(
      instanceMatrix,
      "foundation metadata identifies actual rendered concrete",
    );
    for (const x of [-0.5, 0.5])
      for (const z of [-0.5, 0.5]) {
        const vertex = new THREE.Vector3(x, -0.5, z).applyMatrix4(
          instanceMatrix,
        );
        assert(
          vertex.y < environment.heightAt(vertex.x, vertex.z),
          "actual foundation vertices penetrate rendered land",
        );
      }
  }
  const terrain = scene.getObjectByName("terrain-surface");
  const ray = new THREE.Raycaster();
  const { width, depth, level, bed } = root.userData.reservoir;
  assert(level > bed);
  // Actual surface corners and interior samples must sit over a rendered floor,
  // above the terrain, and inside four continuous retaining walls.
  const samples = Array.from({ length: positions.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(positions, i),
  );
  samples.push(new THREE.Vector3(), new THREE.Vector3(width / 4, depth / 4, 0));
  for (const local of samples) {
    const p = water.localToWorld(local.clone());
    assert(p.y > environment.heightAt(p.x, p.z) + 1);
    ray.set(
      p.clone().add(new THREE.Vector3(0, -0.01, 0)),
      new THREE.Vector3(0, -1, 0),
    );
    ray.far = level - bed + 0.1;
    assert(
      ray.intersectObject(concrete).length,
      "water rests on its actual concrete basin floor",
    );
    ray.far = Infinity;
    assert(
      ray.intersectObject(terrain, true).length,
      "rendered ground exists under reservoir",
    );
  }
  const center = water.localToWorld(new THREE.Vector3());
  for (const direction of [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
  ]) {
    const worldDirection = direction.transformDirection(water.matrixWorld);
    ray.set(center, worldDirection);
    ray.far = Math.max(width, depth) / 2 + 5;
    assert(
      ray.intersectObject(concrete).length,
      "reservoir has a retaining wall in every direction",
    );
  }
});

test("actual instanced vertices and swept rays leave every physical fork carriageway clear", () => {
  const { track, root } = fixture();
  const frames = [];
  for (const branch of [-1, 0, 1])
    for (let s = 0; s < track.length; s += 3) {
      const u = s / track.length;
      if (
        branch === 0 &&
        u > track.config.split[0] &&
        u < track.config.split[1]
      )
        continue;
      const f = track.frame(s, branch);
      frames.push({ ...f, bounds: track.bounds(s, branch) });
    }
  const matrix = new THREE.Matrix4();
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const position = mesh.geometry.attributes.position;
    for (
      let instance = 0;
      instance < (mesh.isInstancedMesh ? mesh.count : 1);
      instance++
    ) {
      if (mesh.isInstancedMesh)
        mesh.getMatrixAt(instance, matrix).premultiply(mesh.matrixWorld);
      else matrix.copy(mesh.matrixWorld);
      for (let index = 0; index < position.count; index++) {
        const vertex = new THREE.Vector3()
          .fromBufferAttribute(position, index)
          .applyMatrix4(matrix);
        for (const f of frames) {
          if (
            Math.abs(vertex.y - f.p.y) > 23 ||
            vertex.distanceToSquared(f.p) > 10000
          )
            continue;
          const delta = vertex.clone().sub(f.p);
          if (Math.abs(delta.dot(f.tangent)) > 2) continue;
          const x = delta.dot(f.right),
            y = delta.dot(f.up);
          assert(
            !(
              x > f.bounds.wallMin - 7 &&
              x < f.bounds.wallMax + 7 &&
              y > -3 &&
              y < 19
            ),
            `architecture intrudes road at u=${f.u}, local=${x}/${y}`,
          );
        }
      }
    }
  });
  const ray = new THREE.Raycaster();
  for (const branch of [-1, 1])
    for (let u = 0.78; u <= 0.93; u += 0.001) {
      const f = track.frame(u * track.length, branch),
        bounds = track.bounds(u * track.length, branch);
      for (const x of [bounds.wallMin - 6, 0, bounds.wallMax + 6]) {
        const p = f.p
          .clone()
          .addScaledVector(f.right, x)
          .addScaledVector(f.up, -2);
        ray.set(p, f.up);
        ray.far = 21;
        assert.equal(
          ray.intersectObject(root, true).length,
          0,
          `swept road/roof clearance u=${u} branch=${branch}`,
        );
      }
    }
});
