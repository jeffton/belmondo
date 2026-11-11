import test from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACKS } from "../src/track.js";

for (let index = 0; index < TRACKS.length; index++) {
  test(`${TRACKS[index].name}: broad bends and aligned ballistic landing`, () => {
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
    // At ~130 m/s and 110 m/s² grip, a 150 m bend is already a braking corner.
    assert.ok(
      minimumRadius >= 150,
      `Tight road kink: radius ${minimumRadius} m`,
    );
    const launch = track.frame(track.config.jump * track.length);
    for (const offset of [0.014, 0.03, 0.055, 0.075]) {
      const landing = track.frame((track.config.jump + offset) * track.length);
      const sideways = landing.p.sub(launch.p).dot(launch.right);
      assert.ok(
        Math.abs(sideways) < 0.05,
        `Landing bends ${sideways} m away from launch`,
      );
    }
  });
}
