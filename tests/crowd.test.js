import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACKS } from "../src/track.js";
import { createTerrain } from "../src/terrain.js";
import { buildFinishDistrict } from "../src/finish-district.js";
import { getCrowdMix } from "../src/crowd.js";

for (const [index, config] of TRACKS.entries()) {
  test(`${config.name}: crowd follows rendered stands across the finish seam, not track phase`, () => {
    const track = makeTrack(index);
    const terrain = createTerrain(track);
    const district = buildFinishDistrict(
      new THREE.Scene(),
      track,
      Object.fromEntries(
        ["concrete", "paint", "facade", "road"].map((key) => [
          key,
          new THREE.Texture(),
        ]),
      ),
      { heightAt: terrain.heightAt },
    );
    const [start, end] = config.sections.finishStraight;
    const gains = [];
    for (let i = 0; i <= 30; i++) {
      const frame = track.frame(
        (start + ((end - start) * i) / 30) * track.length,
      );
      const mix = getCrowdMix(frame.p, frame.right, district.foundations);
      assert(mix.gain > 0.4, "stands audible over their whole actual span");
      assert(
        Math.abs(mix.pan) < 0.2,
        "two-sided stands balance on the centre line",
      );
      gains.push(mix.gain);
      assert.equal(
        getCrowdMix(
          frame.p.clone().add(new THREE.Vector3(0, 300, 0)),
          frame.right,
          district.foundations,
        ).gain,
        0,
        "another vertical layer must not inherit phase-based crowd",
      );
    }
    for (let i = 1; i < gains.length; i++)
      assert(
        Math.abs(gains[i] - gains[i - 1]) < 0.03,
        "continuous across section and lap seams",
      );
    const stand = district.foundations.find((s) => s.spectator);
    const position = stand.center.clone();
    position.y = stand.deck;
    const right = stand.right;
    const at = (distance) =>
      position.clone().addScaledVector(right, stand.width / 2 + distance);
    const near = getCrowdMix(at(10), right, [stand]);
    const medium = getCrowdMix(at(80), right, [stand]);
    const far = getCrowdMix(at(181), right, [stand]);
    assert(near.gain > medium.gain && medium.gain > far.gain);
    assert.equal(far.gain, 0);
    assert(near.pan < -0.9);
    assert(
      getCrowdMix(at(10), right.clone().negate(), [stand]).pan > 0.9,
      "pan follows listener orientation",
    );
    assert.deepEqual(
      getCrowdMix(position, right, [{ ...stand, spectator: false }]),
      { gain: 0, pan: 0 },
    );
  });
}
