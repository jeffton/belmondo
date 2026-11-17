import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, TRACKS } from "../src/track.ts";
import { getTrackPickups } from "../src/pickups.ts";
import {
  getJumpMarkingLayout,
  applyJumpMarkings,
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
    test(`${config.name}: continuous deck has no jump paint or shader changes`, () => {
      const track = makeTrack(index);
      const material = new THREE.MeshLambertMaterial();
      const compile = material.onBeforeCompile;
      const key = material.customProgramCacheKey();
      assert.deepEqual(getJumpMarkingLayout(track), []);
      assert.equal(applyJumpMarkings(material, track), null);
      assert.equal(material.onBeforeCompile, compile);
      assert.equal(material.customProgramCacheKey(), key);
      material.dispose();
    });
    continue;
  }
  test(`${config.name}: coherent launch and receiving marks follow real jump edges and deck metres`, () => {
    const track = makeTrack(index),
      layout = getJumpMarkingLayout(track);
    const pads = getTrackPickups(track);
    for (const kind of ["approach", "landing"]) {
      const apron = layout.filter((patch) => patch.kind === kind);
      const crossbars = apron.filter(
        (patch) => patch.left < 0 && patch.right > 0,
      );
      assert.equal(
        crossbars.length,
        kind === "approach" ? 2 : 0,
        "launch has a threshold; the receiving racing surface stays unpainted",
      );
      assert.equal(
        apron.filter((patch) => patch.right < 0 || patch.left > 0).length,
        2,
        "paired shoulder finishes, without floating fragments or a connected landing frame",
      );
      const ends = apron
        .flatMap((patch) => [patch.start, patch.end])
        .sort((a, b) => a - b);
      for (let s = ends[0]; s < ends.at(-1); s += 0.5)
        assert(
          apron.some(
            (patch) => patch.start <= s + 0.001 && patch.end >= s - 0.001,
          ),
          "the apron stays continuous along the approach/receiving deck",
        );
    }
    for (const patch of layout) {
      assert(
        Math.abs(
          deckDistance(track, patch.anchor, patch.station) -
            Math.abs(patch.distance),
        ) < 0.04,
        "paint spacing measures real sloping deck metres",
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
        "markings belong to the physical launch/receiving deck",
      );
      const width = track.frame(patch.station).width;
      for (const station of [patch.start, patch.end])
        assert.equal(
          track.frame(station).width,
          width,
          "road-UV rectangles fit this constant-width runway",
        );
      for (const pad of pads) {
        if (
          pad.s + pad.length / 2 < patch.start ||
          pad.s - pad.length / 2 > patch.end
        )
          continue;
        assert(
          patch.right * width < pad.lateral - pad.width / 2 ||
            patch.left * width > pad.lateral + pad.width / 2,
          "aprons cannot overprint a real boost or weapon field",
        );
      }
    }
  });

  test(`${config.name}: jump ink uses the existing opaque road, without overlay geometry or cutout texture`, () => {
    const track = makeTrack(index);
    const material = new THREE.MeshLambertMaterial();
    const ink = applyJumpMarkings(material, track);
    assert.equal(material.map, null, "no noisy/repeating paint texture");
    assert.equal(material.transparent, false);
    assert.equal(
      material.alphaTest,
      0,
      "distant coverage must not become binary alpha-test holes",
    );
    assert.equal(
      material.polygonOffset,
      false,
      "paint has no second depth surface",
    );
    assert(
      ink.rectangles.every(
        (rectangle) => rectangle.y > rectangle.x && rectangle.w > rectangle.z,
      ),
    );
    const shader = {
      uniforms: {},
      vertexShader: "#include <uv_vertex>",
      fragmentShader: "#include <opaque_fragment>",
    };
    material.onBeforeCompile(shader, null);
    assert.equal(shader.uniforms.jumpRectangles.value, ink.rectangles);
    assert.equal(shader.uniforms.jumpColors.value, ink.colors);
    assert.equal(shader.uniforms.jumpAsphalt.value, ink.asphalt);
    for (const [i, patch] of ink.layout.entries())
      assert.equal(
        ink.asphalt[i],
        Number(patch.kind === "landing"),
        "receiving finishes preserve road texture and lighting; launch remains unchanged",
      );
    assert.equal(shader.uniforms.jumpWindow.value, ink.window);
    assert(shader.vertexShader.includes("vJumpDeck = uv * 32.0"));
    assert(
      shader.fragmentShader.includes("fwidth(vJumpDeck)"),
      "coverage adapts to actual LOWRES fragment footprint",
    );
    assert(!shader.fragmentShader.includes("discard"));
    material.dispose();
  });
}
