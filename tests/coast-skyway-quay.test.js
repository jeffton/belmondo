import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildCoastSkywayQuay } from "../src/coast-skyway-quay.ts";
import { createTerrain } from "../src/terrain.ts";
import { makeTrack, TRACK_INDEX } from "../src/track.ts";

test("Skyway steelwork clears both branches including overhead and rests on real caissons", () => {
  const track = makeTrack(TRACK_INDEX.COAST);
  const { heightAt, samples } = createTerrain(track);
  const faces = [];
  buildCoastSkywayQuay(track, heightAt, (points, kind) => {
    faces.push({ points, kind });
  });
  const triangles = faces.flatMap(({ points }) => {
    const [a, b, c, d] = points.map((p) => p.clone().setY(0));
    return [new THREE.Triangle(a, b, c), new THREE.Triangle(a, c, d)];
  });
  const edges = triangles.flatMap(({ a, b, c }) => [
    new THREE.Line3(a, b),
    new THREE.Line3(b, c),
    new THREE.Line3(c, a),
  ]);
  const interior = triangles.filter((t) => t.getArea() > 1e-7);
  const origin = new THREE.Vector3();
  const near = new THREE.Vector3();
  for (const { p, width, u, branch } of samples) {
    origin.copy(p).setY(0);
    const minimum = (width + 8) ** 2;
    const clear =
      interior.every(
        (t) =>
          t.closestPointToPoint(origin, near).distanceToSquared(origin) >
          minimum,
      ) &&
      edges.every(
        (e) =>
          e.distanceSq() === 0 ||
          e.closestPointToPoint(origin, true, near).distanceToSquared(origin) >
            minimum,
      );
    assert(clear, `quay footprint enters branch ${branch} at ${u}`);
  }
  const caissonFeet = faces.filter(
    ({ kind, points }) => kind === "concrete" && points.every((p) => p.y < 0),
  );
  assert.equal(caissonFeet.length, 2);
  for (const { points } of caissonFeet)
    assert(points.every((p) => heightAt(p.x, p.z) - p.y >= 1.99));
});
