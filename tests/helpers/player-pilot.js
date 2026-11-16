import { CRAFT, SPEED_CLASSES } from "../../src/race.ts";
import { pilotInputs } from "../pilot-inputs.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function curvature(track, s, branch) {
  const a = track.frame(s - 6, branch);
  const b = track.frame(s + 6, branch);
  return (
    Math.atan2(
      a.tangent.z * b.tangent.x - a.tangent.x * b.tangent.z,
      a.tangent.dot(b.tangent),
    ) / a.p.distanceTo(b.p)
  );
}

// Independent feedback pilot: reads the body and course and returns only legal
// player inputs. It never invokes the NPC driver or changes racer state.
export function playerPilot(track, racer, branch, speedClass) {
  const pace = SPEED_CLASSES[speedClass].pace;
  const s = racer.contactS;
  const u = (((s / track.length) % 1) + 1) % 1;
  const selected =
    u > track.config.split[0] - 0.04 && u < track.config.split[1] + 0.01
      ? branch
      : 0;
  const speed = Math.hypot(racer.velocity.x, racer.velocity.z);
  const look = Math.max(24, (speed / pace) * 0.5);
  const targetPoint = track.frame(s + look, selected).p;
  const yaw = Math.atan2(
    targetPoint.x - racer.position.x,
    targetPoint.z - racer.position.z,
  );
  const error = Math.atan2(
    Math.sin(yaw - racer.yaw),
    Math.cos(yaw - racer.yaw),
  );
  const demand = error * 5 - (racer.yawRate / pace) * 0.4;
  const steeringRate = 0.9 * CRAFT[racer.craft].handling;
  const steer = clamp(demand / steeringRate, -1, 1);
  const air = clamp((demand - steer * steeringRate) / 0.5, -1, 1);
  let target = 145 * pace;
  for (let ahead = 0; ahead <= 180; ahead += 15) {
    const corner =
      Math.sqrt(
        80 / Math.max(Math.abs(curvature(track, s + ahead, selected)), 0.0001),
      ) * pace;
    target = Math.min(
      target,
      Math.sqrt(corner ** 2 + 65 * pace * pace * ahead),
    );
  }
  return pilotInputs({
    throttle: speed < target + 3 * pace,
    steer,
    air,
    slowing: clamp((speed - target) / (18 * pace), 0, 1),
  });
}
