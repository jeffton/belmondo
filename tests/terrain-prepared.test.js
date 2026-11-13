import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { makeTrack, TRACKS } from "../src/track.js";
import { createTerrain } from "../src/terrain.js";

test("transferable terrain hydrates identical buffers and collision queries on every course", () => {
  for (let i = 0; i < TRACKS.length; i++) {
    const track = makeTrack(i);
    const fresh = createTerrain(track);
    const copy = structuredClone(fresh.prepared);
    const buffers = [copy.heights.buffer];
    for (const geometry of copy.geometries)
      for (const attribute of [
        geometry.index,
        ...Object.values(geometry.attributes),
      ])
        buffers.push(attribute.array.buffer);
    const data = structuredClone(copy, { transfer: [...new Set(buffers)] });
    assert.equal(copy.heights.byteLength, 0);
    const hydrated = createTerrain(track, data);
    assert.deepEqual(hydrated.prepared, fresh.prepared);
    assert.equal(hydrated.extent, fresh.extent);
    assert.deepEqual(hydrated.samples, fresh.samples);
    for (let g = 0; g < fresh.geometries.length; g++) {
      const a = fresh.geometries[g],
        b = hydrated.geometries[g];
      for (const name of Object.keys(a.attributes)) {
        assert.deepEqual(b.attributes[name].array, a.attributes[name].array);
        assert.equal(b.attributes[name].itemSize, a.attributes[name].itemSize);
      }
      assert.deepEqual(b.index.array, a.index.array);
      assert.deepEqual(b.boundingSphere, a.boundingSphere);
      assert.notEqual(b.attributes.position.array, a.attributes.position.array);
    }
    for (let z = -fresh.extent; z <= fresh.extent; z += fresh.step * 5)
      for (let x = -fresh.extent; x <= fresh.extent; x += fresh.step * 5) {
        assert.equal(
          hydrated.heightAt(x + 3, z + 7),
          fresh.heightAt(x + 3, z + 7),
        );
        const from = new THREE.Vector3(x, 500, z);
        const to = new THREE.Vector3(x + 17, -100, z + 29);
        assert.deepEqual(
          hydrated.sweepSurface(from, to),
          fresh.sweepSurface(from, to),
        );
      }
    for (let station = 0; station < 100; station++)
      for (const branch of [-1, 0, 1]) {
        const u = station / 100;
        assert.equal(hydrated.bridgeAt(u, branch), fresh.bridgeAt(u, branch));
        assert.equal(
          hydrated.supportClearAt(u, branch),
          fresh.supportClearAt(u, branch),
        );
      }
    for (const geometry of [...fresh.geometries, ...hydrated.geometries])
      geometry.dispose();
  }
});
