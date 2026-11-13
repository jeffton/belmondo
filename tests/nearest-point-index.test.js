import assert from "node:assert/strict";
import test from "node:test";
import { createNearestPointIndex } from "../src/nearest-point-index.js";
import { makeTrack, TRACKS } from "../src/track.js";

function exhaustive(points, x, z) {
  let best = 0,
    distance = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = (x - points[i].x) ** 2 + (z - points[i].z) ** 2;
    if (d < distance) {
      distance = d;
      best = i;
    }
  }
  return best;
}

test("exact nearest preserves original order at duplicate and symmetric ties", () => {
  const points = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 },
    { x: 1, z: 0 },
  ];
  const nearest = createNearestPointIndex(points);
  for (const [x, z] of [
    [0, 0],
    [1, 0],
    [0.5, 0.5],
    [-0.5, -0.5],
    [1e9, -1e9],
  ])
    assert.equal(nearest(x, z), exhaustive(points, x, z));
  assert.equal(nearest(0, 0), 0);
  assert.equal(nearest(1, 0), 0);
});

test("exact nearest agrees with exhaustive road lookup on all seven courses", () => {
  for (let index = 0; index < TRACKS.length; index++) {
    const track = makeTrack(index);
    const count = Math.ceil(track.length / 7);
    const points = [];
    for (let i = 0; i < count; i++) {
      const u = i / count;
      for (const branch of u > track.config.split[0] &&
      u < track.config.split[1]
        ? [-1, 1]
        : [0])
        points.push(track.frame(u * track.length, branch).p);
    }
    const nearest = createNearestPointIndex(points);
    // Real terrain grid, including remote corners, plus exact road samples.
    for (let z = -4000; z <= 4000; z += 115)
      for (let x = -4000; x <= 4000; x += 115)
        assert.equal(
          nearest(x, z),
          exhaustive(points, x, z),
          `${track.config.name} ${x},${z}`,
        );
    for (const p of points)
      assert.equal(nearest(p.x, p.z), exhaustive(points, p.x, p.z));
  }
});
