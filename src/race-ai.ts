import { followingBrake, racingLine } from "./ai-racing-line.ts";
import { HOVER_REACH } from "./hover-support.ts";
import { AI_THROTTLE, CRAFT, angle } from "./race-rules.ts";
import { clamp, mod } from "./track.ts";
import type { RaceInput, Racer } from "./race.ts";
import type { Track } from "./track.ts";

export function aiControls(
  track: Track,
  r: Racer,
  active: Racer[],
  spec: (typeof CRAFT)[number],
  pace: number,
  pace2: number,
  classDt: number,
): RaceInput {
  // A look-ahead driver, not a second movement model.
  const u = mod(r.contactS, track.length) / track.length;
  const [forkStart, forkEnd] = track.config.split;
  const choosingFork =
    u > forkStart - 0.04 && u < forkStart + (forkEnd - forkStart) * 0.3;
  const intendedBranch =
    choosingFork && (!r.branch || track.bounds(r.contactS, r.branch).connected)
      ? r.id % 2
        ? -1
        : 1
      : r.branch;
  const look = track.frame(
    r.contactS + Math.max(18, (r.speed * 0.5) / pace),
    intendedBranch,
  );
  const road = track.frame(r.contactS, r.branch);
  const lane = r.position.clone().sub(road.p).dot(road.right);
  const traffic = active
    .filter(
      (other) =>
        other !== r &&
        (other.branch === r.branch ||
          (track.bounds(r.contactS, r.branch).connected &&
            track.bounds(other.contactS, other.branch).connected)) &&
        Math.abs(other.position.y - r.position.y) < 10,
    )
    .map((other) => {
      const delta = other.position.clone().sub(r.position);
      return {
        front: delta.dot(road.tangent),
        lane: lane + delta.dot(road.right),
        closing: r.velocity.clone().sub(other.velocity).dot(road.tangent),
      };
    });
  const curve = Math.max(
    ...[0.25, 0.6, 1].map((t) =>
      Math.abs(
        track.curvature(r.contactS + (r.speed * t) / pace, intendedBranch),
      ),
    ),
  );
  // Keep the proven centre approach through splitter tips and merges.
  const transition =
    Math.abs(u - forkStart) < 0.04 || Math.abs(u - forkEnd) < 0.04;
  // Aerial and steep-grade approaches need the established centre line:
  // a passing offset must not become an unintended jump trajectory.
  const steep = [0, 0.5, 1].some(
    (t) =>
      Math.abs(
        track.frame(r.contactS + (r.speed * t) / pace, intendedBranch).tangent
          .y,
      ) > 0.08,
  );
  look.p.addScaledVector(
    look.right,
    racingLine(
      r,
      traffic,
      transition || steep || !r.grounded ? 6 : Math.min(road.width, look.width),
      curve,
      classDt,
      lane,
    ),
  );
  const desiredYaw = Math.atan2(
    look.p.x - r.position.x,
    look.p.z - r.position.z,
  );
  const error = angle(desiredYaw - r.yaw);
  // Read crests as well as plan curvature: the same body must brake
  // before negative vertical curvature exceeds its gravity/contact load.
  const strictNightCrest =
    track.config.night &&
    intendedBranch === 1 &&
    u > forkStart - 0.04 &&
    u < forkEnd;
  const crest = Math.max(
    0,
    ...[0.25, 0.6, 1].map((t) => {
      const s = r.contactS + (r.speed * t) / pace;
      if (
        !strictNightCrest &&
        [-6, 0, 6].some((offset) =>
          track.gap(mod(s + offset, track.length) / track.length),
        )
      )
        return 0;
      const a = track.frame(s - 6, intendedBranch);
      const b = track.frame(s + 6, intendedBranch);
      return (a.tangent.y - b.tangent.y) / a.p.distanceTo(b.p);
    }),
  );
  // Powered hover can sustain h_eq = (v²κ - 35pace²) / (90pace²)
  // up to its existing reach. The authored night descent keeps its policy.
  const cornerSpeed = Math.min(
    Math.sqrt((110 * pace2) / Math.max(curve, 0.0001)),
    (0.9 * spec.handling * pace) / Math.max(curve, 0.0001),
    Math.sqrt(
      ((strictNightCrest ? 25 : 35 + 90 * HOVER_REACH) * pace2) /
        Math.max(crest, 0.0001),
    ),
  );
  // Heading correction requests yaw, not a craft-independent stick angle.
  // Differential airbrakes supply rotation beyond the ordinary stick;
  // paired airbrakes shed speed without inventing a separate AI brake.
  const yawDemand = error * 6 - (r.yawRate * 0.25) / pace;
  const steer = clamp(yawDemand / (0.9 * spec.handling), -1, 1);
  const air = clamp((yawDemand - steer * 0.9 * spec.handling) / 0.5, -1, 1);
  const spacingBrake = followingBrake(traffic, lane, pace);
  const slowing = Math.max(
    spacingBrake,
    clamp((r.speed - cornerSpeed) / (30 * pace), 0, 1),
    Math.abs(error) > 0.7 ? 1 : 0,
  );
  const pairedAir = slowing * (1 - Math.abs(air));
  return {
    throttle:
      !spacingBrake && r.speed < cornerSpeed && Math.abs(error) < 0.7
        ? AI_THROTTLE
        : 0,
    steer,
    airLeft: pairedAir + Math.max(0, air),
    airRight: pairedAir + Math.max(0, -air),
  };
}
