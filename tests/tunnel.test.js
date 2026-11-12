import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACKS } from "../src/track.js";

test("tunnel metadata matches enclosed courses, not Kaiseki's open canopy", () => {
  const coast = makeTrack(0);
  for (let i = 0; i < 100; i++)
    assert.equal(coast.isTunnel((i / 100) * coast.length), false);
  for (const index of [1, 2]) {
    const track = makeTrack(index),
      [start, end] = track.config.tunnel;
    const branch = index === 2 ? -1 : 0;
    assert.equal(track.isTunnel((start - 0.001) * track.length, branch), false);
    assert.equal(track.isTunnel((start + 0.001) * track.length, branch), true);
    assert.equal(track.isTunnel((end - 0.001) * track.length, branch), true);
    assert.equal(track.isTunnel((end + 0.001) * track.length, branch), false);
    for (const lap of [-2, 0, 3])
      assert.equal(
        track.isTunnel((lap + (start + end) / 2) * track.length, branch),
        true,
      );
    if (index === 2) {
      for (const otherBranch of [0, 1])
        assert.equal(
          track.isTunnel(((start + end) / 2) * track.length, otherBranch),
          false,
        );
    }
  }
});

test("explicit tunnel branches classify only the authored branches", () => {
  const original = TRACKS[4];
  try {
    TRACKS[4] = {
      ...original,
      tunnel: [0.2, 0.3],
      tunnelBranches: [1],
    };
    const track = makeTrack(4);
    const middle = 0.25 * track.length;

    assert.equal(track.isTunnel(middle), false);
    assert.equal(track.isTunnel(middle, -1), false);
    assert.equal(track.isTunnel(middle, 1), true);
    assert.equal(track.isTunnel(0.2 * track.length, 1), false);
    assert.equal(track.isTunnel(0.3 * track.length, 1), false);
    assert.equal(track.isTunnel(-0.75 * track.length, 1), true);
    assert.equal(track.isTunnel(0.35 * track.length, 1), false);
  } finally {
    TRACKS[4] = original;
  }
});
