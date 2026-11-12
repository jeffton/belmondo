import test from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACKS } from "../src/track.js";

test("all courses expose wider main decks and keep both split routes clear", () => {
  for (let index = 0; index < TRACKS.length; index++) {
    const track = makeTrack(index),
      { split } = track.config,
      midpoint = ((split[0] + split[1]) / 2) * track.length,
      main = track.frame(midpoint),
      left = track.frame(midpoint, -1),
      right = track.frame(midpoint, 1),
      routeSeparation = left.p.distanceTo(right.p);

    assert(main.width >= 18, `${track.config.name}: main deck is not wider`);
    assert(
      left.width >= 16 && right.width >= 16,
      `${track.config.name}: split deck is too narrow`,
    );
    assert(
      routeSeparation > left.width + right.width,
      `${track.config.name}: widened split decks overlap`,
    );
  }
});

const minimumRadiusByLayout = {
  "coast-3": 150,
  "solar-3": 150,
  "noctilucent-3": 150,
  "whiteout-1": 150,
  "monsoon-3": 95,
  "cinderline-1": 150,
};

for (let index = 0; index < TRACKS.length; index++) {
  test(`${TRACKS[index].name}: authored corner radii and any jump's aligned ballistic landing`, () => {
    const track = makeTrack(index);
    let minimumRadius = Infinity;
    for (const branch of [-1, 0, 1]) {
      for (let i = 0; i < 1500; i++) {
        const before = track.frame(((i - 0.25) / 1500) * track.length, branch);
        const after = track.frame(((i + 0.25) / 1500) * track.length, branch);
        const angle = before.tangent.setY(0).angleTo(after.tangent.setY(0));
        if (angle > 1e-8) {
          const distance = before.p.setY(0).distanceTo(after.p.setY(0));
          minimumRadius = Math.min(minimumRadius, distance / angle);
        }
      }
    }
    // Monsoon-3 adds ~103/116 m braking corners (minimum horizontal projection
    // ~98 m); the unchanged layouts retain their broader bend contract. These are authored facts,
    // not an engine restriction on physically feasible technical routes.
    assert.ok(
      minimumRadius >= minimumRadiusByLayout[track.config.layoutId],
      `Tight road kink: radius ${minimumRadius} m`,
    );
    if (track.config.jump !== null) {
      const launch = track.frame(track.config.jump * track.length);
      for (const offset of [0.014, 0.03, 0.055, 0.075]) {
        const landing = track.frame(
          (track.config.jump + offset) * track.length,
        );
        const sideways = landing.p.sub(launch.p).dot(launch.right);
        assert.ok(
          Math.abs(sideways) < 0.05,
          `Landing bends ${sideways} m away from launch`,
        );
      }
    }
  });
}

test("joined fork halves have a level seam and expose common visual/physical bounds", () => {
  for (let index = 0; index < TRACKS.length; index++) {
    const track = makeTrack(index),
      [start, end] = track.config.split;
    for (const u of [start, end]) {
      for (const branch of [-1, 1]) {
        const bounds = track.bounds(u * track.length, branch);
        assert(bounds.connected, "exact split endpoints join the unsplit road");
        assert(
          bounds.seam.distanceTo(track.bounds(u * track.length, -branch).seam) <
            1e-8,
        );
      }
    }
    for (let i = 1; i < 100; i++) {
      const s = (start + ((end - start) * i) / 100) * track.length;
      const first = track.frame(s, -1),
        second = track.frame(s, 1);
      const firstBounds = track.bounds(s, -1),
        secondBounds = track.bounds(s, 1);
      const left = firstBounds.innerSide === 1 ? first : second,
        right = firstBounds.innerSide === 1 ? second : first;
      const a = firstBounds.innerSide === 1 ? firstBounds : secondBounds,
        b = firstBounds.innerSide === 1 ? secondBounds : firstBounds;
      if (a.connected || b.connected) {
        assert.equal(a.connected, b.connected);
        assert(
          Math.abs(left.p.y - right.p.y) < 1e-8,
          "the joined seam must not become a vertical step before separation",
        );
        assert(a.clipMax < a.wallMax && b.clipMin > b.wallMin);
        assert(
          a.seam.distanceTo(b.seam) < 1e-8,
          "unequal-width rendered halves share the exact same seam vertex",
        );
        assert(a.clipMax <= left.width && b.clipMin >= -right.width);
      } else {
        assert.equal(a.clipMax, left.width);
        assert.equal(b.clipMin, -right.width);
        assert.equal(a.seam, null);
        assert.equal(b.seam, null);
      }
    }
  }
});
