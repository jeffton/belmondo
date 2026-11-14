import { test } from "node:test";
import assert from "node:assert/strict";
import { Race, SPEED_CLASSES } from "../src/race.js";
import { makeTrack, TRACK_INDEX } from "../src/track.js";
import { createTerrain } from "../src/terrain.js";

for (let index = 0; index < 3; index++) {
  test(`off-road hulls hit the actual terrain and rescue without false progression on course ${index}`, () => {
    const track = makeTrack(index),
      terrain = createTerrain(track);
    for (let speedClass = 0; speedClass < SPEED_CLASSES.length; speedClass++) {
      const race = new Race(track, 0, "trial", speedClass, terrain);
      race.countdown = 0;
      const r = race.player,
        pace = race.classSpec.pace;
      const s = track.length * 0.055,
        f = track.frame(s);
      r.position.copy(f.p).addScaledVector(f.right, f.width + 12);
      r.position.y = terrain.heightAt(r.position.x, r.position.z) + 1.15;
      r.contactS = r.s = s;
      r.gate = Math.floor((s / track.length) * 32) + 1;
      r.grounded = false;
      r.velocity.set(0, -60 * pace, 0);
      race.update(1 / 120, { throttle: false, steer: 0, air: 0 });
      assert(
        r.recoveredThisStep,
        `class${speedClass} terrain impact must rescue`,
      );
      assert(r.grounded);
      assert.equal(r.shield, 76);
      assert.equal(r.speed, 0);
      assert.equal(r.s, r.checkpoint.s);
      assert.equal(r.gate, 1);
      assert.equal(r.lap, 1);
      assert.equal(race.laps.length, 0);
      assert.equal(r.collectedPickups.size, 0);
      assert(
        race.events.some((e) => e.kind === "hit" && e.text === "GROUND IMPACT"),
      );
      assert(
        r.position.distanceTo(
          track
            .frame(track.finishS - 18)
            .p.clone()
            .add({ x: 0, y: 2.2, z: 0 }),
        ) < 1e-8,
      );
    }
    for (const geometry of terrain.geometries) geometry.dispose();
  });
}

test("terrain sweeps cannot interfere with grounded road contact", () => {
  const track = makeTrack(TRACK_INDEX.COAST);
  const terrain = {
    sweepSurface() {
      assert.fail("grounded hull must not query land collision");
    },
  };
  for (let speedClass = 0; speedClass < 3; speedClass++) {
    const race = new Race(track, 0, "trial", speedClass, terrain);
    race.countdown = 0;
    for (let i = 0; i < 120; i++) race.update(1 / 120, { throttle: true });
    assert.equal(race.player.shield, 100);
    assert(race.player.grounded);
  }
});
