import { playerPilot } from "./player-pilot.js";

export const descentStep = 1 / 120;

// Seed a viable approach at the edge of NOCTILUCENT's steep final descent.
// After this point all travel, including flight, uses the real race solver.
export function startNightDescent(race, gate = 26) {
  const { track, player } = race;
  const s = 0.843 * track.length;
  const frame = track.frame(s);
  race.countdown = 0;
  player.contactS = s;
  player.s = s;
  player.gate = gate;
  player.checkpoint = { s, branch: 0, gate };
  player.yaw = Math.atan2(frame.tangent.x, frame.tangent.z) - 0.22;
  player.pitch = -Math.asin(frame.tangent.y);
  player.position.copy(frame.p).addScaledVector(frame.right, -16);
  player.position.y += 2.2;
  player.velocity.set(
    Math.sin(player.yaw) * 175,
    175 * frame.tangent.y,
    Math.cos(player.yaw) * 175,
  );
}

export function advanceNightDescent(race) {
  const { track, player } = race;
  race.update(descentStep, playerPilot(track, player, -1, 0));
}
