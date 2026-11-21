import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import { createTerrain } from "../src/terrain.ts";
import { buildCinderVolcanoes } from "../src/cinder-volcanoes.ts";

test("volcano triangles stay outside both racing branches and root in the actual terrain", () => {
  const track = makeTrack(TRACK_INDEX.CINDERLINE);
  const terrain = createTerrain(track);
  const root = new THREE.Group();
  const update = buildCinderVolcanoes(root, track, {
    heightAt: terrain.heightAt,
  });
  try {
    const samples = [];
    for (let s = 0; s < track.length; s += 4)
      for (const branch of [-1, 0, 1]) samples.push(track.frame(s, branch));
    const rock = root.getObjectByName("cinder-volcano-rock");
    const vertices = rock.geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i),
        z = vertices.getZ(i);
      for (const frame of samples)
        assert(
          Math.hypot(x - frame.p.x, z - frame.p.z) > frame.width + 20,
          "actual mountain vertices clear every carriageway",
        );
    }
    for (const volcano of root.userData.volcanoes) {
      for (const p of volcano.rings[0])
        assert(
          Math.abs(p.y + 5 - terrain.heightAt(p.x, p.z)) < 0.001,
          "the entire skirt penetrates the visible ground",
        );
      assert(
        volcano.rings[4].every((p, i) => p.y > volcano.rings[5][i].y),
        "open crater descends inside the rim",
      );
      // The full convex horizontal envelope must clear the road, not only its vertices.
      const radius = Math.max(
        ...volcano.rings[0].map((p) =>
          Math.hypot(p.x - volcano.center.x, p.z - volcano.center.z),
        ),
      );
      for (const f of samples)
        assert(
          Math.hypot(f.p.x - volcano.center.x, f.p.z - volcano.center.z) >
            radius + f.width + 20,
          "whole mountain clears road and flight corridor",
        );
    }
    const smoke = root.getObjectByName("cinder-volcano-fumaroles");
    assert.deepEqual(
      root.children.filter((mesh) => mesh.material.transparent),
      [smoke],
      "only the batched ash uses blending",
    );
    assert.equal(smoke.material.depthWrite, false);
    assert.equal(smoke.material.depthTest, true);
    assert.equal(smoke.geometry.attributes.position.count, 18);
    const { vent } = smoke.geometry.attributes;
    for (const [index, volcano] of root.userData.volcanoes.entries()) {
      const v = new THREE.Vector3().fromBufferAttribute(vent, index * 6);
      assert(
        Math.hypot(v.x - volcano.center.x, v.z - volcano.center.z) < 0.001,
      );
      assert(v.y < Math.min(...volcano.rings[4].map((p) => p.y)));
      assert(v.y > volcano.center.y + volcano.height * 0.68);
    }
    update(8.5);
    assert.equal(smoke.material.uniforms.time.value, 8.5);
    assert.equal(
      root.children.length,
      3,
      "all three landmarks batch into three draws",
    );
    assert(
      root.children.reduce(
        (sum, mesh) => sum + mesh.geometry.attributes.position.count / 3,
        0,
      ) < 2000,
    );
  } finally {
    terrain.geometries.forEach((g) => g.dispose());
    root.children.forEach((mesh) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
  }
});
