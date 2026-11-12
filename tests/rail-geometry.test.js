import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACKS } from "../src/track.js";
import { RAIL_PROFILE, railFaceNormal } from "../src/rail-profile.js";
import { railPoint, railHeight, railBackDepth } from "../src/rail-geometry.js";

function frameAt(track, u, branch) {
  const f = track.frame(u * track.length, branch);
  return Object.assign(f, track.bounds(u * track.length, branch), { branch });
}

for (const [index, config] of TRACKS.entries()) {
  test(`${config.name}: sloped rendered faces use the physical banked collision plane`, () => {
    const track = makeTrack(index);
    let banked = 0;
    for (let i = 0; i < 600; i++) {
      const u = i / 600;
      if (track.gap(u)) continue;
      for (const branch of u > config.split[0] && u < config.split[1]
        ? [-1, 1]
        : [0]) {
        const f = frameAt(track, u, branch);
        if (Math.abs(f.right.y) > 0.02) banked++;
        for (const side of [-1, 1]) {
          if (f.connected && side === -branch) continue;
          const edge = side < 0 ? f.clipMin : f.clipMax;
          const height = railHeight(f, side),
            normal = railFaceNormal(f, side);
          for (const h of [0, height / 2, height]) {
            const p = railPoint(f, edge, side, h);
            assert(
              Math.abs(p.clone().sub(f.p).dot(normal) - side * edge) < 1e-7,
              "the visible slope must coincide with the real contact plane, not a vertical proxy",
            );
            assert(Math.abs(p.clone().sub(f.p).dot(f.up) - h) < 1e-7);
          }
        }
      }
    }
    assert(banked > 0);
  });

  test(`${config.name}: opposed split tips/caps meet without entering the other carriageway`, () => {
    const track = makeTrack(index),
      [start, end] = config.split;
    for (let i = 0; i <= 1000; i++) {
      const u = start + ((end - start) * i) / 1000;
      const a = frameAt(track, u, -1),
        b = frameAt(track, u, 1);
      const axis = track.frame(u * track.length).right;
      const left = railPoint(
        a,
        a.clipMax,
        1,
        RAIL_PROFILE.height,
        railBackDepth(track, a, 1),
      );
      const right = railPoint(
        b,
        b.clipMin,
        -1,
        RAIL_PROFILE.height,
        railBackDepth(track, b, -1),
      );
      assert(
        right.clone().sub(left).dot(axis) >= -1e-7,
        "sloped median caps cannot overlap or hide a collider in the other route",
      );
      if (a.connected)
        assert.equal(
          railHeight(a, 1),
          0,
          "divider emerges from zero height at the connected root",
        );
      if (b.connected) assert.equal(railHeight(b, -1), 0);
    }
  });
}
