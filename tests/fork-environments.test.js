import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { createTerrain } from "../src/terrain.ts";
import { buildEnvironment } from "../src/environment.ts";

const textures = Object.fromEntries(
  ["concrete", "road", "paint", "facade", "edge"].map((name) => [name, null]),
);

for (const index of [TRACK_INDEX.COAST, TRACK_INDEX.SOLAR]) {
  test(`fork ${index}: emitted shelter is lane-specific and clears the full airborne corridor`, () => {
    const track = makeTrack(index);
    const scene = new THREE.Scene();
    const environment = buildEnvironment(scene, track, textures);
    const root = scene.getObjectByName(
      index === TRACK_INDEX.COAST
        ? "coastal-fork-geography"
        : "solar-fork-infrastructure",
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
    if (index === TRACK_INDEX.COAST) {
      const contacts = root.userData.groundingContacts;
      assert(
        contacts.length > 0,
        "the continuous bored headland has real grounded feet",
      );
      for (const p of contacts)
        assert(Math.abs(p.y - environment.heightAt(p.x, p.z) + 2) < 0.001);
    } else {
      assert(grounded > 20, "near-field structures have real terrain contacts");
    }
    if (index === TRACK_INDEX.COAST) {
      const f = track.frame(0.37 * track.length, 1);
      const p = f.p.clone().addScaledVector(f.right, f.width + 160);
      assert(
        environment.heightAt(p.x, p.z) < -16,
        "sea inlet is visibly below the global water surface",
      );
    }
  });
}

// Baseline 1529002 terrain with bank-neutral frames. Banked road normals drive
// shoulder grading and cell excavation: smoothing legitimately changes their Y.
// Preserve the complete neutral landscape byte-for-byte, then check the actual
// banked terrain topology and clearance across both full-width decks.
for (const [index, expected] of [
  [
    TRACK_INDEX.NOCTILUCENT,
    "0f639ea68781dcb01fa9fae56d9f2a6c88961d38675ad8c42be1e3c7e51ccbe8",
  ],
  [
    TRACK_INDEX.MONSOON,
    "b09dd433e96b18df029b8597a0e93cade2ee5b1425ce62d6e4bb98775d1b9c7a",
  ],
]) {
  test(`course ${index}: bank-neutral landscape is preserved and banked terrain clears both decks`, () => {
    const track = makeTrack(index);
    const neutralTrack = {
      ...track,
      frame(s, branch = 0) {
        const f = track.frame(s, branch);
        const right = new THREE.Vector3(
          f.tangent.z,
          0,
          -f.tangent.x,
        ).normalize();
        return {
          ...f,
          bank: 0,
          right,
          up: new THREE.Vector3().crossVectors(f.tangent, right).normalize(),
        };
      },
    };
    const neutral = createTerrain(neutralTrack);
    const terrain = createTerrain(track);
    try {
      const hash = createHash("sha256");
      assert.equal(terrain.geometries.length, neutral.geometries.length);
      for (let i = 0; i < neutral.geometries.length; i++) {
        const base = neutral.geometries[i];
        const actual = terrain.geometries[i];
        const positions = base.attributes.position.array;
        hash.update(Buffer.from(positions.buffer));
        assert.deepEqual(
          actual.index.array,
          base.index.array,
          "same terrain topology",
        );
        assert.equal(
          actual.attributes.position.count,
          base.attributes.position.count,
        );
        for (let j = 0; j < positions.length; j += 3) {
          assert.equal(actual.attributes.position.array[j], positions[j]);
          assert.equal(
            actual.attributes.position.array[j + 2],
            positions[j + 2],
          );
          assert(Number.isFinite(actual.attributes.position.array[j + 1]));
        }
      }
      assert.equal(hash.digest("hex"), expected);
      for (const f of terrain.samples) {
        const bounds = track.bounds(f.u * track.length, f.branch);
        for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
          const x = THREE.MathUtils.lerp(
            bounds.clipMin,
            bounds.clipMax,
            fraction,
          );
          const p = f.p.clone().addScaledVector(f.right, x);
          assert(
            p.y - terrain.heightAt(p.x, p.z) > 3.5,
            "graded land clears the actual banked road across its full width",
          );
        }
      }
    } finally {
      for (const geometry of [...neutral.geometries, ...terrain.geometries])
        geometry.dispose();
    }
  });
}
