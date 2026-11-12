import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { makeTrack } from "../src/track.js";
import { createTerrain } from "../src/terrain.js";
import { buildEnvironment } from "../src/environment.js";

const textures = Object.fromEntries(
  ["concrete", "road", "paint", "facade", "edge"].map((name) => [name, null]),
);

for (const index of [0, 1]) {
  test(`fork ${index}: emitted shelter is lane-specific and clears the full airborne corridor`, () => {
    const track = makeTrack(index);
    const scene = new THREE.Scene();
    const environment = buildEnvironment(scene, track, textures);
    const root = scene.getObjectByName(
      index === 0 ? "coastal-fork-geography" : "solar-fork-infrastructure",
    );
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const up = new THREE.Vector3(0, 1, 0);
    const down = up.clone().negate();
    let sheltered = 0;
    let exposed = 0;
    for (
      let s = track.config.split[0] * track.length;
      s < track.config.split[1] * track.length;
      s += 4
    ) {
      for (const branch of [-1, 1]) {
        const f = track.frame(s, branch);
        for (let x = -f.width; x <= f.width; x += 2) {
          const p = f.p
            .clone()
            .addScaledVector(f.right, x)
            .addScaledVector(f.up, 0.1);
          ray.far = 26;
          ray.set(p, up);
          assert.equal(
            ray.intersectObject(root, true).length,
            0,
            `airborne obstruction at ${f.u}/${branch}/${x}`,
          );
          // The rendered land must stay below the entire deck, not just center.
          assert(
            environment.heightAt(p.x, p.z) < p.y,
            `terrain crosses branch ${branch} at ${f.u}`,
          );
        }
        if (f.u > 0.355 && f.u < 0.39) {
          ray.far = 60;
          ray.set(f.p, up);
          if (ray.intersectObject(root, true).length) {
            if (branch === -1) sheltered++;
            else exposed++;
          }
        }
      }
    }
    assert(
      sheltered > 35,
      "a substantial run of the inward lane has actual overhead shelter",
    );
    assert.equal(exposed, 0, "outward lane retains open sky");
    // Each emitted solid's lower footprint intersects real ground; roofs/ducts
    // are supported by the same emitted arcade, not floating distant set pieces.
    const matrix = new THREE.Matrix4();
    const center = new THREE.Vector3();
    let grounded = 0;
    root.traverse((mesh) => {
      if (!mesh.isInstancedMesh) return;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        center.setFromMatrixPosition(matrix);
        const foot = new THREE.Vector3(0, -0.5, 0).applyMatrix4(matrix);
        if (mesh.name === "fork-panel") {
          // Raycast only supports from above the actual underside. A support
          // top must reach the panel, not just lie somewhere beneath it.
          ray.set(foot.clone().addScaledVector(up, 1), down);
          ray.far = 1.01;
          const posts = root.children.filter(
            (child) => child.name === "fork-metal",
          );
          assert(
            ray.intersectObjects(posts).length > 0,
            "collector panel floats above its support",
          );
        }
        if (foot.y < environment.heightAt(foot.x, foot.z)) {
          ray.set(new THREE.Vector3(center.x, center.y + 0.01, center.z), down);
          ray.far = 2000;
          assert(
            ray.intersectObject(
              environment.group.getObjectByName("terrain-surface"),
              true,
            ).length > 0,
          );
          grounded++;
        }
      }
    });
    assert(grounded > 20, "near-field structures have real terrain contacts");
    if (index === 0) {
      const f = track.frame(0.37 * track.length, 1);
      const p = f.p.clone().addScaledVector(f.right, f.width + 160);
      assert(
        environment.heightAt(p.x, p.z) < -16,
        "sea inlet is visibly below the global water surface",
      );
    }
  });
}

// Approved 1290238 terrain, including Night's over/under and Whiteout's spiral.
for (const [index, expected] of [
  [2, "cc6affd35fc979a58fd73590b928f6dd563f720076e0ee96e7d96e0a622de954"],
  [3, "79f3537f077c632dc157ff49537c7da6378c79c412f7ba7eef21805038bff2a9"],
  [4, "43fb8dabfe7fc08e099fa17046a37713e2552a588e67e417dcc3cba524c9bd63"],
  [5, "a87606fef5cb3b7a064781c056b16a57994a990eba297c7bc0abf0f73cda1dbb"],
]) {
  test(`course ${index}: terrain output remains byte-identical`, () => {
    const terrain = createTerrain(makeTrack(index));
    const hash = createHash("sha256");
    for (const geometry of terrain.geometries) {
      hash.update(Buffer.from(geometry.attributes.position.array.buffer));
      geometry.dispose();
    }
    assert.equal(hash.digest("hex"), expected);
  });
}
