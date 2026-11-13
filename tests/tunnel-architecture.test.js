import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTrack } from "../src/track.js";
import { tunnelSegment } from "../src/tunnel-architecture.js";

for (const [index, branch] of [
  [1, 0],
  [2, -1],
  [4, -1],
]) {
  test(`tunnel architecture stays outside the racing clearance on course ${index}`, () => {
    const track = makeTrack(index);
    const [start, end] = track.config.tunnel;
    let quads = 0;
    let litBays = 0;
    for (let s = start * track.length + 1; s < end * track.length - 5; s += 5) {
      const a = track.frame(s, branch);
      const b = track.frame(s + 5, branch);
      const panels = tunnelSegment(a, b, track);
      quads += panels.length;
      litBays += panels.filter((q) => q.kind === "light").length;
      for (const q of panels) {
        assert.ok(["concrete", "edge", "light", "tunnel"].includes(q.kind));
        assert.equal(q.p.length, 4);
        for (const p of q.p) {
          assert.ok(p.toArray().every(Number.isFinite));
          // Nearest endpoint accounts for track curvature between 5m stations.
          const f = p.distanceToSquared(a.p) < p.distanceToSquared(b.p) ? a : b;
          const local = p.clone().sub(f.p);
          const height = local.dot(f.up);
          const lateral = Math.abs(local.dot(f.right));
          assert.ok(
            height >= 15.8 || lateral >= f.width - 0.2,
            `intrusion at s=${s}: height=${height}, lateral=${lateral}, width=${f.width}`,
          );
        }
      }
    }
    assert.ok(litBays > 0);
    // Keep the detail subordinate to the existing whole-course scene budget.
    assert.ok(quads * 2 < track.length * (end - start) * 10);
  });
}
