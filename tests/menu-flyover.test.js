import assert from "node:assert/strict";
import test from "node:test";
import { PerspectiveCamera, Vector3 } from "three";
import { aimMenuFlyover } from "../src/menu-flyover.ts";
import { makeTrack, TRACKS } from "../src/track.ts";

for (const [index, course] of TRACKS.entries()) {
  test(`${course.name} menu flyover stays continuous over one lap`, () => {
    const track = makeTrack(index);
    const camera = new PerspectiveCamera();
    const previousPosition = new Vector3();
    const previousDirection = new Vector3();
    const direction = new Vector3();
    // 60 Hz at menu speed, including the lap seam, both fork throats and the
    // edges of every jump (the raw race frame can snap at the takeoff lip).
    const step = 32 / 60;
    for (let station = -step; station < track.length + step; station += step) {
      aimMenuFlyover(camera, track, station);
      camera.getWorldDirection(direction);
      if (station >= 0) {
        assert.ok(
          camera.position.distanceTo(previousPosition) < 2,
          `position jumped at ${station.toFixed(2)} m`,
        );
        assert.ok(
          direction.angleTo(previousDirection) < 0.025,
          `view direction jumped at ${station.toFixed(2)} m`,
        );
      }
      previousPosition.copy(camera.position);
      previousDirection.copy(direction);
    }
  });
}
