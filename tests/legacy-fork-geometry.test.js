import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { makeTrack, TRACKS, TRACK_INDEX } from "../src/track.js";
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

// Accepted d377354 physical outputs for the six circuits outside Coast's
// independently authored fork. Semantic indexes survive menu reordering.
const unchangedHashes = {
  WHITEOUT: "0fecdb74176981809c712dc0b8d592f97a58be9e70538bd2bebee553ad36211b",
  CINDERLINE:
    "d5868c73150f3ce387ca909d72fc85de11bc696c1ec7f7de7f282532143b3f45",
  MONSOON: "e2917282207d4ea64f790deedebe02ae92a0403a8ebd4dbfd07f77e2e136ddd5",
  SOLAR: "6a63d963d2e4683cd0a583969c927f0d8b997c8e0344c413d6776951c5af53d6",
  NOCTILUCENT:
    "19e4838a99fc862af4f9daaca87449301d7fa9f08eef533a70e60d87f8dac624",
  VESPER: "7da2ee746c43844b2b0b10c9525be13abc1d764b807f3c2d43ba36f418cd1cef",
};
for (const [name, hash] of Object.entries(unchangedHashes))
  test(`${name}: fork changes preserve the accepted physical road and rails`, () => {
    const index = TRACK_INDEX[name];
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
      hash,
    );
  });
