import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { makeTrack, TRACKS } from "../src/track.js";
import { railPoint, railBackDepth, railHeight } from "../src/rail-geometry.js";
import { RAIL_PROFILE } from "../src/rail-profile.js";

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

// Captured before the universal correction (724abc8), including both caps.
const biomeHashes = [
  "9f63fa6d1d41bb25a953f7e2a3be440fde1545ba210d2af02beb6e365d205649",
  "971242eef21a22d18920ea7378f723abaf09561d9563d15e7dfce5db84240586",
  "b512ddb1f42257b5c3770281974628f901576951ef9038f14c091a096758927e",
];
for (let index = 3; index < 6; index++)
  test(`biome ${index}: universal fork geometry preserves accepted physical outputs`, () => {
    const track = makeTrack(index);
    const rows = [];
    for (let i = 0; i < 300; i++)
      for (const branch of [-1, 0, 1]) {
        const s = (i / 300) * track.length;
        const frame = Object.assign(
          track.frame(s, branch),
          track.bounds(s, branch),
          { branch },
        );
        rows.push(
          frame,
          railBackDepth(track, frame, -1),
          railBackDepth(track, frame, 1),
        );
      }
    assert.equal(
      createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
      biomeHashes[index - 3],
    );
  });
