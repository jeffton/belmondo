import { MathUtils, type PerspectiveCamera } from "three";
import { mod, type Track } from "./track.ts";

// Use the same fork as the lead demo pilot. Its authored route merges into
// the common centerline at either end, so both camera and gaze follow the fork.
const BRANCH = -1;

function flyoverFrame(track: Track, station: number) {
  const frame = track.frame(station, BRANCH);
  if (!track.gap(frame.u)) return frame;

  // The racing frame drops to landing elevation immediately after the lip.
  // Bridge the missing deck at both real elevations and match their grades,
  // so the menu camera flies over the jump instead of diving into the gap.
  const start = track.config.jump! * track.length;
  const span = track.config.gapLength! * track.length;
  const lip = track.frame(start - 0.001, BRANCH);
  const landing = track.frame(start + span, BRANCH);
  const t = (mod(station, track.length) - start) / span;
  const ease = t * t * (3 - 2 * t);
  frame.p.y =
    MathUtils.lerp(lip.p.y, landing.p.y, ease) +
    span *
      t *
      (1 - t) *
      ((1 - t) * lip.tangent.y * lip.metric -
        t * landing.tangent.y * landing.metric);
  return frame;
}

export function aimMenuFlyover(
  camera: PerspectiveCamera,
  track: Track,
  pilotStation: number,
) {
  const station = pilotStation - 12;
  const here = flyoverFrame(track, station);
  const ahead = flyoverFrame(track, station + 42);
  // A small, periodic drift keeps the shot alive without leaving the
  // front-facing corridor between the barriers, even in the narrow bores.
  const phase = (here.u * 4 + 0.25) * Math.PI * 2;
  camera.position
    .copy(here.p)
    .addScaledVector(here.right, Math.sin(phase) * 2.4)
    .addScaledVector(here.up, 7.5 + Math.cos(phase) * 1.2);
  camera.up.set(0, 1, 0).lerp(here.up, 0.28).normalize();
  camera.lookAt(ahead.p.addScaledVector(ahead.up, 4.4));
}
