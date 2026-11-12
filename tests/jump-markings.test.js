import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACKS } from "../src/track.js";
import { getTrackPickups } from "../src/pickups.js";
import {
  getJumpMarkingLayout,
  buildJumpMarkings,
} from "../src/jump-markings.js";

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
    for (const patch of layout) {
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

  test(`${config.name}: jump paint is one worn non-emissive mesh on the actual road plane`, () => {
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
      mesh.material.isMeshLambertMaterial &&
        mesh.material.emissive.getHex() === 0,
    );
    assert(
      mesh.material.polygonOffset && mesh.material.alphaTest > 0,
      "worn ink stays flat without z-fighting",
    );
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < layout.length; i++) {
      const patch = layout[i];
      for (const [j, station, side] of [
        [0, patch.start, patch.left],
        [2, patch.start, patch.right],
        [1, patch.end, patch.right],
        [4, patch.end, patch.left],
      ]) {
        const f = track.frame(station),
          p = new THREE.Vector3().fromBufferAttribute(positions, i * 6 + j);
        const expected = f.p.clone().addScaledVector(f.right, side * f.width);
        assert(
          p.distanceTo(expected) < 0.001,
          "paint must not add a raised pad or alter the road surface",
        );
      }
    }
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
