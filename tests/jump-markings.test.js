import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACKS } from "../src/track.ts";
import { getTrackPickups } from "../src/pickups.ts";
import {
  getJumpMarkingLayout,
  buildJumpMarkings,
} from "../src/jump-markings.ts";

function deckDistance(track, start, end) {
  const steps = Math.ceil(Math.abs(end - start) / 0.5);
  let distance = 0,
    previous = track.frame(start).p;
  for (let i = 1; i <= steps; i++) {
    const p = track.frame(start + ((end - start) * i) / steps).p;
    distance += p.distanceTo(previous);
    previous = p;
  }
  return distance;
}

for (const [index, config] of TRACKS.entries()) {
  if (config.jump === null) {
    test(`${config.name}: continuous deck has no jump paint or paint resources`, () => {
      const track = makeTrack(index);
      const scene = new THREE.Scene();
      assert.deepEqual(getJumpMarkingLayout(track), []);
      assert.deepEqual(buildJumpMarkings(scene, track, null), {
        mesh: null,
        layout: [],
      });
      assert.equal(scene.children.length, 0);
    });
    continue;
  }
  test(`${config.name}: approach and landing paint follows real jump edges and deck metres`, () => {
    const track = makeTrack(index),
      layout = getJumpMarkingLayout(track);
    const pads = getTrackPickups(track);
    assert(
      layout.some((patch) => patch.kind === "approach") &&
        layout.some((patch) => patch.kind === "landing"),
    );
    for (const [i, patch] of layout.entries()) {
      for (const other of layout.slice(i + 1))
        assert(
          patch.end <= other.start ||
            patch.start >= other.end ||
            patch.right <= other.left ||
            patch.left >= other.right,
          "paint layers must not overlap and flicker on the same deck",
        );
      assert(
        Math.abs(
          deckDistance(track, patch.anchor, patch.station) -
            Math.abs(patch.distance),
        ) < 0.04,
        "paint spacing must measure the real sloping deck, not a fixed percentage of the lap",
      );
      const u0 = patch.start / track.length,
        u1 = patch.end / track.length;
      assert(
        !track.gap(u0) && !track.gap(u1),
        "paint cannot bridge missing track",
      );
      if (patch.kind === "approach")
        assert(patch.end < config.jump * track.length);
      else
        assert(patch.start > (config.jump + config.gapLength) * track.length);
      assert(
        u0 >= config.sections.runway[0] && u1 <= config.sections.runway[1],
        "markings belong to the actual launch/receiving straight, not an unrelated corner",
      );
      assert(
        patch.right < 0 || patch.left > 0,
        "the central racing line must not become an arrow or socket",
      );
      for (const pad of pads) {
        if (
          pad.s + pad.length / 2 < patch.start ||
          pad.s - pad.length / 2 > patch.end
        )
          continue;
        const f = track.frame(patch.station);
        assert(
          patch.right * f.width < pad.lateral - pad.width / 2 ||
            patch.left * f.width > pad.lateral + pad.width / 2,
          "runway graphics cannot overprint a real boost or weapon field",
        );
      }
    }
  });

  test(`${config.name}: reflective jump ink is batched and follows the curved deck without raised pads`, () => {
    const track = makeTrack(index),
      scene = new THREE.Scene();
    const { mesh, layout } = buildJumpMarkings(scene, track, {
      shade: (_p, color) => color,
    });
    assert.equal(
      scene.children.length,
      1,
      "runway paint should add one batched draw, not per-stripe objects",
    );
    assert(
      mesh.material.isMeshBasicMaterial,
      "reflective ink stays legible at night without lights or bloom",
    );
    assert(
      mesh.material.polygonOffset && mesh.material.alphaTest > 0,
      "worn ink stays flat without z-fighting",
    );
    const positions = mesh.geometry.attributes.position;
    let vertex = 0;
    for (const patch of layout) {
      const slices = Math.ceil((patch.end - patch.start) / 5);
      for (let slice = 0; slice < slices; slice++) {
        const start =
          patch.start + ((patch.end - patch.start) * slice) / slices;
        const end =
          patch.start + ((patch.end - patch.start) * (slice + 1)) / slices;
        for (const [j, station, side] of [
          [0, start, patch.left],
          [2, start, patch.right],
          [1, end, patch.right],
          [3, start, patch.left],
          [4, end, patch.left],
          [5, end, patch.right],
        ]) {
          const f = track.frame(station),
            p = new THREE.Vector3().fromBufferAttribute(positions, vertex + j);
          const expected = f.p.clone().addScaledVector(f.right, side * f.width);
          assert(
            Math.abs(p.clone().sub(expected).dot(f.up) - 0.04) < 0.001 &&
              p.distanceTo(expected) < 0.041,
            "only a four-centimetre render bias separates ink from its deck; no raised insert",
          );
        }
        vertex += 6;
      }
    }
    assert.equal(positions.count, vertex);
    const data = mesh.material.map.image.data;
    let chipped = 0,
      painted = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) chipped++;
      else painted++;
    }
    assert(
      chipped > 0 && painted > chipped,
      "paint has holes revealing the original road texture",
    );
    mesh.geometry.dispose();
    mesh.material.map.dispose();
    mesh.material.dispose();
  });
}
