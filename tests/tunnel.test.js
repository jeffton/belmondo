import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTrack } from "../src/track.js";

test("tunnel metadata matches enclosed courses, not Kaiseki's open canopy", () => {
  const coast = makeTrack(0);
  for (let i = 0; i < 100; i++)
    assert.equal(coast.isTunnel((i / 100) * coast.length), false);
  for (const index of [1, 2]) {
    const track = makeTrack(index),
      [start, end] = track.config.tunnel;
    assert.equal(track.isTunnel((start - 0.001) * track.length), false);
    assert.equal(track.isTunnel((start + 0.001) * track.length), true);
    assert.equal(track.isTunnel((end - 0.001) * track.length), true);
    assert.equal(track.isTunnel((end + 0.001) * track.length), false);
    for (const lap of [-2, 0, 3])
      assert.equal(
        track.isTunnel((lap + (start + end) / 2) * track.length),
        true,
      );
  }
});
