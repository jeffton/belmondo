import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";
import {
  buildNightHarbor,
  NIGHT_HARBOR_SEA,
  NIGHT_HARBOR_QUAY,
} from "../src/night-harbor.ts";
import { buildCinderWorks } from "../src/cinder-works.ts";
import { placesTerrainFixture } from "./helpers/places-terrain-fixture.js";
const placesTerrain = await placesTerrainFixture();

for (const [name, build] of [
  ["NOCTILUCENT", buildNightHarbor],
  ["CINDERLINE", buildCinderWorks],
]) {
  test(`${name}: whole works clear all carriageways horizontally and root in the integrated terrain`, () => {
    const track = makeTrack(TRACK_INDEX[name]);
    const terrain = placesTerrain.createTerrain(track);
    const textures = {
      concrete: new THREE.Texture(),
      paint: new THREE.Texture(),
    };
    const scene = new THREE.Scene();
    const root = build(scene, track, textures, {
      heightAt: terrain.heightAt,
      terrain,
    });
    try {
      const frames = [];
      for (let s = 0; s < track.length; s += 4)
        for (const branch of [-1, 0, 1]) frames.push(track.frame(s, branch));
      for (const site of root.userData.foundations) {
        for (const p of site.contacts) {
          assert(
            p.y >= site.bottom,
            "foundation penetrates every terrain contact",
          );
          assert(
            p.y < site.deck,
            "terrain never pokes through the working apron",
          );
        }
        for (const frame of frames) {
          const d = frame.p.clone().sub(site.center);
          const x = Math.max(0, Math.abs(d.dot(site.right)) - site.width / 2);
          const z = Math.max(0, Math.abs(d.dot(site.forward)) - site.depth / 2);
          assert(
            Math.hypot(x, z) > frame.width + 12,
            `whole foundation at ${site.u} clears branch ${frame.branch} at ${frame.u}: clearance ${Math.hypot(x, z)} width ${frame.width}`,
          );
        }
      }
      if (name === "NOCTILUCENT") {
        const berth = root.userData.foundations[0];
        assert.equal(
          berth.deck,
          NIGHT_HARBOR_QUAY,
          "quay uses the shared sea datum, not the seabed height",
        );
        for (let z = -berth.depth / 2; z < berth.depth / 2 - 42; z += 4) {
          for (const x of [-51, 51]) {
            const p = berth.point(x, 0, z);
            assert(
              terrain.heightAt(p.x, p.z) < NIGHT_HARBOR_SEA - 3,
              "open repair berth and its entrance contain actual sea, not exposed land",
            );
          }
        }
        for (const body of root.userData.bodies.filter((b) =>
          b.name.startsWith("hull-keel"),
        )) {
          for (const x of [-0.5, 0, 0.5])
            for (const z of [-0.5, 0, 0.5]) {
              const p = new THREE.Vector3(x, -0.5, z).applyMatrix4(body.matrix);
              assert(
                terrain.heightAt(p.x, p.z) < p.y,
                "actual ship underside clears the sea floor",
              );
              assert(p.y < NIGHT_HARBOR_SEA, "hull keel remains in the water");
            }
        }
        assert(
          root.userData.foundations[1].deck >= NIGHT_HARBOR_QUAY,
          "freight apron remains above sea",
        );
      } else {
        const works = root.userData.foundations[0];
        assert(
          works.deck + 42 < track.frame(0.818 * track.length, 1).p.y,
          "low plant stays below the exposed upper rim",
        );
      }
      // Actual geometry, including overhanging roof caps, is subject to the
      // same clearance; a small foundation cannot conceal a large top chord.
      for (const body of root.userData.bodies) {
        const center = new THREE.Vector3().setFromMatrixPosition(body.matrix);
        const scale = new THREE.Vector3().setFromMatrixScale(body.matrix);
        const right = new THREE.Vector3()
          .setFromMatrixColumn(body.matrix, 0)
          .normalize();
        const forward = new THREE.Vector3()
          .setFromMatrixColumn(body.matrix, 2)
          .normalize();
        for (const f of frames) {
          const d = f.p.clone().sub(center);
          const x = Math.max(0, Math.abs(d.dot(right)) - scale.x / 2);
          const z = Math.max(0, Math.abs(d.dot(forward)) - scale.z / 2);
          assert(
            Math.hypot(x, z) > f.width + 12,
            `${body.name} crosses the race/ballistic corridor at ${f.u}`,
          );
        }
      }
      assert(
        root.children.every(
          (mesh) => mesh.isInstancedMesh && !mesh.material.transparent,
        ),
      );
    } finally {
      const geometries = new Set(terrain.geometries),
        materials = new Set();
      root.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) materials.add(o.material);
        if (o.isInstancedMesh) o.dispose();
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      Object.values(textures).forEach((t) => t.dispose());
    }
  });
}
