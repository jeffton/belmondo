import * as THREE from "three";
import { crossesPickup } from "./pickups.ts";
import { GATES, HOVER, WEAPONS } from "./race-rules.ts";
import { ROAD_LOOK_AHEAD, ROAD_LOOK_BEHIND } from "./road-projection.ts";
import { clamp, roadBounds } from "./track.ts";
import type { Race, Racer } from "./race.ts";
import type { RoadProjection } from "./road-projection.ts";

export interface FinishCrossing {
  r: Racer;
  fraction: number;
}

export function advanceRaceProgress(
  race: Race,
  r: Racer,
  previous: THREE.Vector3,
  from: { s: number; branch: number },
  road: RoadProjection,
  wasGrounded: boolean,
  touchingDeck: boolean,
  onDeck: boolean,
  gap: boolean,
  height: number,
  u: number,
  dt: number,
  finishCrossings: FinishCrossing[],
) {
  const { track } = race;
  const ai = r.id !== 0;
  const gateStation = (gate: number) =>
    track.finishS + (gate * track.length) / GATES;
  if (wasGrounded && !r.grounded) {
    r.flight = true;
    const descent = track.config.sections?.descent;
    if (descent) {
      const lapStart = Math.floor(from.s / track.length) * track.length;
      const start = lapStart + descent[0] * track.length;
      const end = lapStart + descent[1] * track.length;
      // Only a flight from the earned sector can claim a descent landing.
      if (
        from.s >= Math.max(start, gateStation(r.gate - 1)) &&
        from.s < Math.min(end, gateStation(r.gate))
      )
        r.descentFlight = { start: from.s, end, branch: from.branch };
    }
  }
  let descentLanding = false;
  if (r.descentFlight) {
    const descent = r.descentFlight;
    const local =
      descent.branch === r.branch &&
      road.s >= from.s - ROAD_LOOK_BEHIND &&
      road.s < from.s + ROAD_LOOK_AHEAD;
    if (!local || road.s < descent.start || road.s > descent.end) {
      r.descentFlight = undefined;
    } else if (r.grounded) {
      // The road can fall away under the craft and its rails. A forward
      // landing on the same local descent settles its ordered sectors;
      // it cannot claim a finish, a fork transfer or an unrelated deck.
      if ((touchingDeck || onDeck) && !gap && road.s > from.s) {
        while (r.gate % GATES !== 0 && gateStation(r.gate) <= road.s) {
          r.gate++;
          descentLanding = true;
        }
      }
      r.descentFlight = undefined;
    }
  }
  if (r.grounded) {
    r.flight = false;
    if (!wasGrounded && r.id === 0) race.emit("land", "TOUCHDOWN");
    r.offroad = 0;
    if (
      (track.config.jump === null ||
        u < track.config.jump - 0.025 ||
        u > track.config.jump + 0.025) &&
      road.s >= track.finishS + ((r.gate - 1) * track.length) / GATES &&
      road.s < track.finishS + (r.gate * track.length) / GATES
    )
      r.checkpoint = {
        s: descentLanding ? road.s : r.s,
        branch: r.branch,
        gate: r.gate,
      };
  } else if (gap && wasGrounded && r.id === 0) race.emit("jump", "FLIGHT");
  // Validate the swept crossing itself, not the end-of-step deck contact.
  // A legal airborne crossing can end outside the deck beside a jump.
  if (r.grounded || r.flight) {
    const gateS = gateStation(r.gate);
    const gateFrame = track.frame(gateS, r.branch);
    const before = previous.clone().sub(gateFrame.p).dot(gateFrame.tangent);
    const after = r.position.clone().sub(gateFrame.p).dot(gateFrame.tangent);
    if (before < 0 && after >= 0) {
      const fraction = before / (before - after);
      const crossing = previous.clone().lerp(r.position, fraction);
      const bounds = roadBounds(track, gateS, r.branch);
      const lateral = crossing.clone().sub(gateFrame.p).dot(gateFrame.right);
      const normal = new THREE.Vector3()
        .crossVectors(gateFrame.tangent, gateFrame.right)
        .normalize();
      const gateHeight =
        crossing.clone().sub(gateFrame.p).dot(normal) - HOVER * normal.y;
      const drop = track.config.sections?.descent;
      const inDrop = drop && gateFrame.u >= drop[0] && gateFrame.u <= drop[1];
      const ceiling = r.flight ? (inDrop ? 140 : 48) : 4;
      if (
        lateral >= bounds.wallMin &&
        lateral <= bounds.wallMax &&
        gateHeight >= -3 &&
        gateHeight <= ceiling
      ) {
        r.gate++;
        if ((r.gate - 1) % GATES === 0 && (r.gate - 1) / GATES >= r.lap) {
          r.lap++;
          if (!ai) {
            const crossingTime = race.time - dt + fraction * dt;
            const lapTime = crossingTime - race.lapStart;
            race.laps.push(lapTime);
            race.bestLap = Math.min(race.bestLap, lapTime);
            race.lapStart = crossingTime;
            if (r.lap <= race.lapCount)
              race.emit("lap", "LAP " + r.lap + " / " + race.lapCount);
          }
          if (r.lap > race.lapCount) finishCrossings.push({ r, fraction });
        }
      }
    }
  }
  if (r.grounded || (r.flight && onDeck && height > -3)) {
    r.s = clamp(
      road.s,
      r.gate === 1
        ? Math.min(track.finishS - 18, road.s)
        : track.finishS + ((r.gate - 1) * track.length) / GATES,
      track.finishS + (r.gate * track.length) / GATES - 0.001,
    );
  }
}

export function collectRacePickups(
  race: Race,
  r: Racer,
  previous: THREE.Vector3,
) {
  const { track } = race;
  const { pace } = race.classSpec;
  const ai = r.id !== 0;
  if (r.grounded && !r.recoveredThisStep) {
    for (const [index, pad] of race.pickups.entries()) {
      const key = `${r.lap}:${pad.id}`;
      if (
        r.collectedPickups.has(key) ||
        !crossesPickup(track, pad, previous, r.position, r.branch)
      )
        continue;
      r.collectedPickups.add(key);
      if (pad.type === "boost") {
        r.surge = 1.15;
        if (!ai) race.emit("boost", "BOOST");
      } else if (race.mode === "trial") {
        r.shield = Math.min(100, r.shield + 10);
      } else if (!r.weapon) {
        r.weapon =
          WEAPONS[
            (Math.floor(race.time * pace * 13) + r.id + index) % WEAPONS.length
          ];
        if (!ai) race.emit("pickup", r.weapon);
      }
    }
  }
}

export function settleFinishCrossings(
  race: Race,
  finishCrossings: FinishCrossing[],
  dt: number,
) {
  const { track } = race;
  // Crossing fraction resolves racers crossing in the same physics step.
  // A lethal impact in that step takes precedence over a pending finish.
  finishCrossings.sort((a, b) => a.fraction - b.fraction || a.r.id - b.r.id);
  for (const { r, fraction } of finishCrossings) {
    if (r.eliminated) continue;
    r.finished = true;
    r.weaponHit = 0;
    r.finishTime = race.time - dt + fraction * dt;
    r.finalPosition = race.finishers.length + 1;
    race.finishers.push(r);
    r.weapon = null;
    const f = track.frame(r.contactS, r.branch);
    const hover = f.p.clone().addScaledVector(f.right, r.x);
    hover.y += HOVER;
    r.finishOffset = r.position.clone().sub(hover);
  }
  race.complete = race.racers.every((r) => r.eliminated || r.finished);
  race.settlePlayerResult();
  race.updateCriticalShield();
}
