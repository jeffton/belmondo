import assert from "node:assert/strict";
import { test } from "node:test";
import { Group, Vector3 } from "three";
import { buildPalmBreakerAirport } from "../src/palm-breaker-airport.ts";
import { createTerrain } from "../src/terrain.ts";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";

test("Palm Breaker airport is low-cost, grounded in the bay and outside the race corridor", () => {
  const track = makeTrack(TRACK_INDEX.COAST);
  const terrain = createTerrain(track);
  const scene = new Group();
  const airport = buildPalmBreakerAirport(scene, track, terrain);
  scene.updateMatrixWorld(true);
  assert.equal(airport.parent, scene);

  // Bound the entire submitted mesh, not just its origin or the visible roof.
  const points = [];
  assert.equal(airport.children.length, 2);
  for (const mesh of airport.children) {
    const p = mesh.geometry.getAttribute("position");
    assert.equal(mesh.material.transparent, false);
    assert.equal(mesh.geometry.groups.length, 0);
    for (let i = 0; i < p.count; i++) {
      const point = new Vector3().fromBufferAttribute(p, i);
      assert.ok(point.toArray().every(Number.isFinite));
      points.push(point.applyMatrix4(mesh.matrixWorld));
    }
  }
  const near = track.frame(0.846 * track.length);
  const right = new Vector3(near.tangent.z, 0, -near.tangent.x).normalize();
  const inward = Math.min(
    ...points.map((point) => point.clone().sub(near.p).dot(right)),
  );
  // The existing +17 m setback, 36 m wide yard ribs occupy <= width + 53 m.
  assert.ok(inward > near.width + 53 + 20, `innermost vertex ${inward} m`);
  const pad = 18;
  for (const { p, width } of terrain.samples) {
    assert.ok(
      points.every(
        (q) => (q.x - p.x) ** 2 + (q.z - p.z) ** 2 > (width + pad) ** 2,
      ),
    );
  }
  assert.ok(terrain.heightAt(airport.position.x, airport.position.z) < -16);
  assert.ok(
    points.some((point) => point.y < terrain.heightAt(point.x, point.z)),
  );
  assert.ok(points.some((point) => point.y > near.p.y + 15));
});
