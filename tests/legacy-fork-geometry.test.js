import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { makeTrack, TRACKS, TRACK_INDEX } from "../src/track.ts";
import { railPoint, railBackDepth, railHeight } from "../src/rail-geometry.ts";
import { RAIL_PROFILE } from "../src/rail-profile.ts";

const production = JSON.parse(
  readFileSync(new URL("./fixtures/legacy-v3-configs.json", import.meta.url)),
);
for (const version of ["production-v3", "redesigned-v4"])
  for (let index = 0; index < (version === "production-v3" ? 2 : 3); index++)
    test(`${version} course ${index}: coincident seams and sloping median caps never overlap`, () => {
      const config = TRACKS[index];
      let track;
      try {
        if (version === "production-v3") TRACKS[index] = production[index];
        track = makeTrack(index);
      } finally {
        TRACKS[index] = config;
      }
      const [start, end] = track.config.split;
      let thickCaps = 0;
      for (let i = 0; i <= 1000; i++) {
        const u = start + ((end - start) * i) / 1000;
        const s = u * track.length;
        const frames = [-1, 1].map((branch) =>
          Object.assign(track.frame(s, branch), track.bounds(s, branch), {
            branch,
          }),
        );
        if (i === 0 || i === 1000) {
          assert(frames.every((f) => f.connected));
          assert(
            frames[0].seam.distanceTo(frames[1].seam) < 1e-8,
            "both endpoint halves share the same real seam",
          );
          assert.notEqual(frames[0].innerSide, frames[1].innerSide);
        }
        const [a, b] = frames[0].innerSide === 1 ? frames : frames.toReversed();
        const axis = track.frame(s).right;
        const depthA = railBackDepth(track, a, 1),
          depthB = railBackDepth(track, b, -1);
        if (Math.abs(frames[0].p.y - frames[1].p.y) > 0.05) {
          if (depthA > 1 && depthB > 1) thickCaps++;
          continue;
        }
        const left = railPoint(a, a.clipMax, 1, RAIL_PROFILE.height, depthA);
        const right = railPoint(b, b.clipMin, -1, RAIL_PROFILE.height, depthB);
        assert(
          right.sub(left).dot(axis) >= -1e-7,
          `rendered full cap overlap at ${u}`,
        );
        if (
          depthA > 1 &&
          depthB > 1 &&
          railHeight(a, 1) === RAIL_PROFILE.height &&
          railHeight(b, -1) === RAIL_PROFILE.height
        )
          thickCaps++;
      }
      assert(
        thickCaps > 0,
        "separated medians retain full-height visible cap thickness",
      );
    });

// Exact 1529002 alignments and rail bounds outside Coast's authored fork.
// Banking smoothing intentionally rotates up/right and rendered rail faces;
// preserve every other frame field, seam, rail bound and median cap depth.
// Semantic indexes survive menu reordering.
const unchangedHashes = {
  WHITEOUT: "8ab03d73a97dbf926ef04b72d0d0250c46e8b06ef591233e9d15055cc50849f0",
  CINDERLINE:
    "e01d4734e62938790caec652275db2b601b4a1c5628877dfa9b72380be97dab4",
  MONSOON: "98d081fcb422d2415ead5ba565914d2fc36f19ee2f85bd8ea12f056771bbb7f5",
  SOLAR: "4fc052727fedc5bfae8db1522f60f329046578403fa7e5fb7a7cd5c7372dc604",
  NOCTILUCENT:
    "98cf272a141ea08c81c00fcb7da7a8f7e5a7f64451ce71af18413847d5a2dbed",
  VESPER: "57fec47922658ef979762fed59ec075a8d4fae09586bf3f9a7622845b3564a6a",
};
for (const [name, hash] of Object.entries(unchangedHashes))
  test(`${name}: fork changes preserve alignment, stationing and physical rail bounds`, () => {
    const track = makeTrack(TRACK_INDEX[name]);
    const frames = Array.from({ length: 300 }, (_, i) =>
      [-1, 0, 1].map((branch) => {
        const s = (i / 300) * track.length;
        const frame = {
          ...track.frame(s, branch),
          ...track.bounds(s, branch),
          branch,
        };
        const { bank, up, right, ...alignment } = track.frame(s, branch);
        return {
          s,
          ...alignment,
          ...track.bounds(s, branch),
          branch,
          backDepth: [
            railBackDepth(track, frame, -1),
            railBackDepth(track, frame, 1),
          ],
        };
      }),
    );
    assert.equal(
      createHash("sha256")
        .update(
          JSON.stringify({
            length: track.length,
            finishS: track.finishS,
            frames,
          }),
        )
        .digest("hex"),
      hash,
    );
  });
