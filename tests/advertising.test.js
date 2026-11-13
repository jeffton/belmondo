import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACKS } from "../src/track.js";
import { getTrackAdvertisingLayout } from "../src/advertising.js";
import { createTerrain } from "../src/terrain.js";

for (const [index, config] of TRACKS.entries()) {
  test(`${config.name}: large close campaigns remain distinct and clear every real road level`, () => {
    const track = makeTrack(index),
      terrain = createTerrain(track),
      layout = getTrackAdvertisingLayout(track);
    assert.equal(layout.length, 4, "four authored roadside landmarks per lap");
    assert.equal(layout.filter((spec) => spec.brand < 0).length, 1);
    const campaigns = layout.filter((spec) => spec.brand >= 0);
    assert.equal(
      new Set(campaigns.map((spec) => spec.brand)).size,
      campaigns.length,
      "large roadside campaigns cannot repeat the same face within a course",
    );
    const roads = [];
    for (let s = 0; s < track.length; s += 5) {
      const u = s / track.length;
      for (const branch of u > config.split[0] && u < config.split[1]
        ? [-1, 1]
        : [0])
        roads.push(track.frame(s, branch));
    }
    for (const spec of layout) {
      assert(
        !track.isTunnel(spec.u * track.length),
        "campaigns are not installed inside a mountain wall",
      );
      const [finishStart, finishEnd] = config.sections.finishStraight;
      assert(
        !(spec.u >= finishStart || spec.u <= finishEnd - 1),
        "large panels cannot intersect full-straight crowd stands",
      );
      // Sample the whole face, not just corners: an angled billboard can cross
      // a neighbouring road or cut into a ridge through its middle.
      const face = [];
      for (let x = -1; x <= 1; x += 0.125) {
        for (let y = -1; y <= 1; y += 0.5) {
          const point = spec.center
            .clone()
            .addScaledVector(spec.horizontal, x * (spec.width / 2 + 1.5));
          point.y += y * (spec.height / 2 + 1.6);
          face.push(point);
        }
      }
      for (const point of face) {
        assert(
          point.y > terrain.heightAt(point.x, point.z) + 1,
          "campaign face must remain above real land",
        );
        for (const f of roads) {
          if (point.y < f.p.y - 0.5 || point.y > f.p.y + 5) continue;
          assert(
            Math.hypot(point.x - f.p.x, point.z - f.p.z) > f.width + 2,
            "panel corners cannot cut the running hull corridor on either crossing level",
          );
        }
      }
      assert(spec.width >= 48, "readable landmark rather than a rail strip");
      assert(
        spec.height >= 18,
        "Pierre uses the full campaign proportions too",
      );
      const normal = spec.horizontal.clone().cross({ x: 0, y: 1, z: 0 });
      assert(
        normal.dot(spec.frame.tangent) < -0.7,
        "art faces approaching traffic",
      );
      for (const side of [-1, 1]) {
        const p = spec.center
          .clone()
          .addScaledVector(spec.horizontal, side * spec.width * 0.32);
        const bottom = terrain.heightAt(p.x, p.z) - 2;
        const top = spec.center.y - spec.height / 2 + 1;
        assert(top > bottom, "support feet must ground below the actual panel");
        for (const f of roads) {
          if (f.p.y + 3.3 < bottom || f.p.y > top) continue;
          assert(
            Math.hypot(p.x - f.p.x, p.z - f.p.z) > f.width + 3,
            "advertising columns cannot pierce a lower or neighbouring road",
          );
        }
      }
    }
    terrain.geometries.forEach((g) => g.dispose());
  });
}
