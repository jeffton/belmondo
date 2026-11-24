import * as THREE from "three";
import { craftSupport } from "./contacts.ts";
import {
  HOVER_REACH,
  hoverReaction,
  integrateHover,
  integratePitch,
} from "./hover-support.ts";
import { railBounds } from "./rail-profile.ts";
import {
  ROAD_LOOK_AHEAD,
  ROAD_LOOK_BEHIND,
  roadHeight,
} from "./road-projection.ts";
import { clamp, mod } from "./track.ts";
import { aiControls } from "./race-ai.ts";
import { CRAFT, HOVER, angle } from "./race-rules.ts";
import { surfaceRoad } from "./race-road-contact.ts";
import type { Race, RaceInput, Racer } from "./race.ts";
import type { RoadProjection } from "./road-projection.ts";

export function advanceRacerBodies(
  race: Race,
  active: Racer[],
  previousYaw: Map<Racer, number>,
  dt: number,
  classDt: number,
  input: RaceInput,
) {
  const { track } = race;
  const { pace } = race.classSpec;
  const pace2 = pace * pace;
  for (const r of active) {
    if (r.eliminated) continue;
    r.wallTouched = r.contactMoved = false;
    r.contactSound = Math.max(0, r.contactSound - classDt);
    const spec = CRAFT[r.craft];
    let controls = input;
    if (r.id !== 0) {
      controls = aiControls(track, r, active, spec, pace, pace2, classDt);
      r.aiFire -= classDt;
      if (r.aiFire <= 0) {
        race.fire(r);
        r.aiFire = 4 + ((r.id * 7) % 6);
      }
    }
    applyControls(r, controls, spec, dt, pace, pace2, classDt);
    advanceHover(race, r, previousYaw.get(r)!, dt, pace, pace2);
  }
}

function applyControls(
  r: Racer,
  controls: RaceInput,
  spec: (typeof CRAFT)[number],
  dt: number,
  pace: number,
  pace2: number,
  classDt: number,
) {
  r.protect = Math.max(0, r.protect - classDt);
  r.surge = Math.max(0, r.surge - classDt);
  r.stun = Math.max(0, r.stun - classDt);
  r.pulseHit = Math.max(0, r.pulseHit - classDt);
  r.weaponHit = Math.max(0, r.weaponHit - dt);
  const left = controls.airLeft ?? Math.max(0, controls.air || 0);
  const right = controls.airRight ?? Math.max(0, -(controls.air || 0));
  const air = controls.air ?? left - right;
  const airDrag = left + right;
  r.pitchTrim +=
    ((controls.pitch || 0) * 0.24 - r.pitchTrim) *
    (1 - Math.exp(-classDt / 0.16));
  const yawTarget =
    ((controls.steer || 0) * 0.9 * spec.handling + air * 0.5) *
    (r.stun ? 0.45 : 1) *
    pace;
  r.yawRate += (yawTarget - r.yawRate) * (1 - Math.exp(-classDt / 0.2));
  r.yaw += r.yawRate * dt;
  const fx = Math.sin(r.yaw),
    fz = Math.cos(r.yaw);
  const rx = fz,
    rz = -fx;
  const lateralSpeed = r.velocity.x * rx + r.velocity.z * rz;
  const grip = (r.grounded ? 110 : 4) * pace2;
  const lateralForce = clamp(-lateralSpeed * 7 * pace, -grip, grip);
  // Engines supply force; aerodynamic drag determines speed, not a velocity ceiling.
  const boostTarget = r.surge > 0 ? 1 : 0;
  r.boost +=
    (boostTarget - r.boost) *
    (1 - Math.exp(-classDt / (boostTarget ? 0.35 : 1.1)));
  const thrust =
    ((controls.throttle ? Number(controls.throttle) * spec.thrust : 0) +
      r.boost * 65) *
    pace2 *
    // Electrical disruption briefly attenuates engine force, not momentum
    // direction. Control and thrust return continuously; no lateral shove.
    (1 - (r.pulseHit / 0.65) * 0.6);
  const drag =
    0.02 * pace +
    Math.hypot(r.velocity.x, r.velocity.z) * 0.0024 +
    airDrag * 0.22 * pace;
  r.velocity.x += (fx * thrust + rx * lateralForce - r.velocity.x * drag) * dt;
  r.velocity.z += (fz * thrust + rz * lateralForce - r.velocity.z * drag) * dt;
  if (!r.grounded) {
    // Deflect momentum, not position: pulling up trades forward speed for climb.
    // Pitch authority stays below class gravity, even at extreme velocity.
    const pitchRate =
      (r.pitchTrim * 0.7 * pace) / (1 + r.velocity.length() / (120 * pace));
    r.velocity.applyAxisAngle(new THREE.Vector3(rx, 0, rz), pitchRate * dt);
  }
}

function advanceHover(
  race: Race,
  r: Racer,
  initialYaw: number,
  dt: number,
  pace: number,
  pace2: number,
) {
  const { track } = race;
  const origin = r.position.clone();
  const initialPitch = r.pitch;
  let fieldRoad: RoadProjection | null = null;
  let captured = false;
  const sampleHover = (time: number, y: number, vy: number) => {
    const point = new THREE.Vector3(
      origin.x + r.velocity.x * time,
      y,
      origin.z + r.velocity.z * time,
    );
    const surface = race.surface.beneath(point, Infinity);
    fieldRoad = null;
    captured = false;
    if (!surface) return 0;
    const { road, rail } = surfaceRoad(track, point, r.contactS, surface);
    const bounds = railBounds(r, rail, point);
    if (rail.x < bounds.min || rail.x > bounds.max) return 0;
    const offset =
      mod(surface.s - r.contactS + track.length / 2, track.length) -
      track.length / 2;
    const establishedContact =
      r.grounded &&
      surface.branch === r.branch &&
      offset >= -ROAD_LOOK_BEHIND &&
      offset < ROAD_LOOK_AHEAD;
    const phase = time === 0 ? 0 : time / dt;
    const support = craftSupport(
      {
        craft: r.craft,
        yaw: initialYaw + angle(r.yaw - initialYaw) * phase,
        pitch: initialPitch + (r.pitch - initialPitch) * phase,
      },
      surface.up,
    );
    if (
      !establishedContact &&
      point.clone().sub(surface.point).dot(surface.up) < support
    )
      return 0;
    const height = point.y - roadHeight(road, point) - HOVER;
    const roadVy =
      -(road.up.x * r.velocity.x + road.up.z * r.velocity.z) / road.up.y;
    fieldRoad = road;
    captured = height < HOVER_REACH;
    return hoverReaction(height, vy - roadVy, pace);
  };
  const initialReaction = sampleHover(0, r.position.y, r.velocity.y);
  const initialRoad = fieldRoad as RoadProjection | null;
  const initiallyCaptured = captured;
  const attitude = integratePitch(
    r.pitch,
    r.pitchRate,
    (initiallyCaptured
      ? Math.atan2(
          initialRoad!.up.x * Math.sin(r.yaw) +
            initialRoad!.up.z * Math.cos(r.yaw),
          initialRoad!.up.y,
        )
      : -Math.atan2(r.velocity.y, Math.hypot(r.velocity.x, r.velocity.z))) +
      r.pitchTrim,
    dt,
    pace,
  );
  r.pitch = attitude.pitch;
  r.pitchRate = attitude.pitchRate;
  const suspension = integrateHover(
    r.position.y,
    r.velocity.y,
    dt,
    35 * pace2,
    (time, y, vy) => {
      if (time === 0) return initialReaction;
      return sampleHover(time, y, vy);
    },
  );
  r.position.addScaledVector(r.velocity, dt);
  r.position.y = suspension.height;
  r.velocity.y = suspension.velocity;
  const contactedRoad = fieldRoad as RoadProjection | null;
  if (captured && contactedRoad) {
    r.contactS = contactedRoad.s;
    r.branch = contactedRoad.branch;
    // Preserve the existing near-road bank support and horizontal handling.
    r.velocity.x +=
      contactedRoad.wallAxis.x *
      Math.sin(contactedRoad.bank) *
      suspension.reactionDelta;
    r.velocity.z +=
      contactedRoad.wallAxis.z *
      Math.sin(contactedRoad.bank) *
      suspension.reactionDelta;
  }
}
