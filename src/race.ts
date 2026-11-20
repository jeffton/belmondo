import * as THREE from "three";
import { clamp, mod, roadBounds } from "./track.ts";
import {
  projectRoad,
  roadHeight,
  ROAD_LOOK_BEHIND,
  ROAD_LOOK_AHEAD,
} from "./road-projection.ts";
import {
  HOVER_REACH,
  hoverReaction,
  integrateHover,
  integratePitch,
} from "./hover-support.ts";
import { getRoadSurface } from "./road-surface.ts";
import type { RoadSurface, RoadSurfaceContact } from "./road-surface.ts";
import {
  solveContacts,
  hullExtent,
  craftSupport,
  contactHull,
  writeCraftVertices,
} from "./contacts.ts";
import { getTrackPickups, crossesPickup } from "./pickups.ts";
import { Launch } from "./launch.ts";
import {
  GRID_APPROACH_SECONDS,
  LAUNCH_COUNTDOWN_SECONDS,
} from "./start-sequence.ts";
import { railBounds, respondToRail, RAIL_PROFILE } from "./rail-profile.ts";
import { SPEED_CLASSES } from "./speed-classes.ts";
import { racingLine, followingBrake } from "./ai-racing-line.ts";
import { WEAPON_HIT_DURATION } from "./weapon-hit.ts";

export { SPEED_CLASSES } from "./speed-classes.ts";

import type { Track } from "./track.ts";
import type { TrackPickup } from "./pickups.ts";
import type { RoadProjection } from "./road-projection.ts";

export type Weapon = "MISSILE" | "PULSE" | "MINE" | "SHIELD" | "TURBO";
export interface RaceInput {
  throttle?: number | boolean;
  steeringKind?: "digital" | "analog";
  steer?: number;
  airLeft?: number;
  airRight?: number;
  air?: number;
  pitch?: number;
  launchIntent?: boolean;
}
export interface RaceEvent {
  kind: string;
  text?: string;
}
export interface RaceTerrain {
  sweepSurface(
    from: THREE.Vector3,
    to: THREE.Vector3,
    clearance?: number,
  ): {
    fraction: number;
    point: THREE.Vector3;
    normal: THREE.Vector3;
  } | null;
}
export interface Racer {
  id: number;
  craft: number;
  s: number;
  x: number;
  vx: number;
  speed: number;
  h: number;
  vy: number;
  branch: number;
  shield: number;
  eliminated: boolean;
  finished: boolean;
  finalPosition: number | null;
  protect: number;
  surge: number;
  boost: number;
  stun: number;
  pulseHit: number;
  weaponHit: number;
  weapon: Weapon | null;
  collectedPickups: Set<string>;
  lap: number;
  aiFire: number;
  aiLane: number;
  aiPassTime?: number;
  aiPassLane?: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  yawRate: number;
  pitchTrim: number;
  pitch: number;
  pitchRate: number;
  contactS: number;
  gate: number;
  grounded: boolean;
  checkpoint: { s: number; branch: number; gate: number };
  offroad: number;
  contactSound: number;
  flight?: boolean;
  descentFlight?: { start: number; end: number; branch: number };
  recoveredThisStep?: boolean;
  wallTouched?: boolean;
  contactMoved?: boolean;
  wallSide?: number;
  eliminationTime?: number;
  finishTime?: number;
  finishOffset?: THREE.Vector3;
}
interface ShotBase {
  s: number;
  x: number;
  branch: number;
  position: THREE.Vector3;
  owner: number;
  life: number;
}
export interface PulseShot extends ShotBase {
  type: "PULSE";
  direction: THREE.Vector3;
}
export interface MissileShot extends ShotBase {
  type: "MISSILE";
  target?: number;
  velocity: THREE.Vector3;
}
export type RaceShot = PulseShot | MissileShot;
export interface RaceMine extends ShotBase {
  type?: never;
}

const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const HOVER = 2.2;
const GATES = 32;
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

interface HullMotion {
  start: THREE.Vector3[];
  end: THREE.Vector3[];
  between: THREE.Vector3[];
}
const hullMotions = new WeakMap<Racer, HullMotion>();

function hullMotion(racer: Racer): HullMotion {
  let motion = hullMotions.get(racer);
  if (!motion) {
    const points = contactHull(racer.craft).points;
    motion = {
      start: points.map(() => new THREE.Vector3()),
      end: points.map(() => new THREE.Vector3()),
      between: points.map(() => new THREE.Vector3()),
    };
    hullMotions.set(racer, motion);
  }
  return motion;
}

function linearHullVertices(motion: HullMotion, fraction: number) {
  if (fraction === 0) return motion.start;
  if (fraction === 1) return motion.end;
  for (let i = 0; i < motion.start.length; i++)
    motion.between[i].copy(motion.start[i]).lerp(motion.end[i], fraction);
  return motion.between;
}

// Physical contact follows the intersected deck; ordered race progress does not.
function surfaceRoad(
  track: Track,
  position: THREE.Vector3,
  anchor: number,
  surface: RoadSurfaceContact,
): { road: RoadProjection; rail: RoadProjection } {
  const s =
    anchor +
    mod(surface.s - anchor + track.length / 2, track.length) -
    track.length / 2;
  const rail = projectRoad(track, position, s, surface.branch);
  const road = { ...rail, point: rail.point.clone(), up: surface.up };
  road.point.y =
    surface.point.y -
    (surface.up.x * (road.point.x - surface.point.x) +
      surface.up.z * (road.point.z - surface.point.z)) /
      surface.up.y;
  return { road, rail };
}

export const CRAFT = [
  {
    name: "STRIKER",
    team: "VX / 01",
    color: 0xf04d35,
    speed: 160,
    thrust: 64,
    handling: 1,
    armor: 1,
    text: "Balanced / precise / forgiving",
  },
  {
    name: "RAPTOR",
    team: "LX / 27",
    color: 0x3488ff,
    speed: 175,
    thrust: 76,
    handling: 0.82,
    armor: 0.85,
    text: "High velocity / wide racing lines",
  },
  {
    name: "WRAITH",
    team: "PH / 44",
    color: 0xc4f743,
    speed: 132,
    thrust: 44,
    handling: 1.23,
    armor: 1.15,
    text: "Agile / strong shields / technical",
  },
];
export const WEAPONS: Weapon[] = [
  "MISSILE",
  "PULSE",
  "MINE",
  "SHIELD",
  "TURBO",
];
export const LAPS_BY_CLASS = Object.freeze([3, 4, 5, 5]);
export const CRITICAL_SHIELD = 25;
// A small engine-input handicap offsets the player's last-place grid slot.
export const AI_THROTTLE = 0.96;

export class Race {
  declare testAccess?: boolean;
  declare terrain: RaceTerrain | null;
  declare speedClass: number;
  declare classSpec: (typeof SPEED_CLASSES)[number];
  declare lapCount: number;
  declare track: Track;
  declare surface: RoadSurface;
  declare pickups: TrackPickup[];
  declare mode: string;
  declare time: number;
  declare countdown: number;
  declare launch: Launch;
  declare finished: boolean;
  declare complete: boolean;
  declare resultPosition: number | null;
  declare resultTime: number | null | undefined;
  declare criticalShield: boolean;
  declare finishers: Racer[];
  declare eliminations: Racer[];
  declare events: RaceEvent[];
  declare shots: RaceShot[];
  declare mines: RaceMine[];
  declare bestLap: number;
  declare lapStart: number;
  declare laps: number[];
  declare racers: Racer[];
  declare player: Racer;
  constructor(
    track: Track,
    craft = 0,
    mode = "race",
    speedClass = 0,
    terrain: RaceTerrain | null = null,
  ) {
    this.terrain = terrain;
    this.speedClass = speedClass;
    this.classSpec = SPEED_CLASSES[speedClass];
    this.lapCount = LAPS_BY_CLASS[speedClass];
    this.track = track;
    this.surface = getRoadSurface(track);
    this.pickups = getTrackPickups(track);
    this.mode = mode;
    this.time = 0;
    this.countdown = GRID_APPROACH_SECONDS + LAUNCH_COUNTDOWN_SECONDS;
    this.launch = new Launch();
    this.finished = false;
    this.complete = false;
    this.resultPosition = null;
    this.resultTime = null;
    this.criticalShield = false;
    this.finishers = [];
    this.eliminations = [];
    this.events = [];
    this.shots = [];
    this.mines = [];
    this.bestLap = Infinity;
    this.lapStart = 0;
    this.laps = [];
    this.racers = Array.from(
      { length: mode === "trial" ? 1 : 8 },
      (_, i) =>
        ({
          id: i,
          craft: i ? i % 3 : craft,
          s:
            track.finishS -
            18 -
            (mode === "trial" ? 0 : i === 0 ? 7 : i - 1) * 9,
          x: i % 2 ? -3 : 3,
          vx: 0,
          speed: 0,
          h: 0,
          vy: 0,
          branch: 0,
          shield: 100,
          eliminated: false,
          finished: false,
          finalPosition: null,
          protect: 0,
          surge: 0,
          boost: 0,
          stun: 0,
          pulseHit: 0,
          weaponHit: 0,
          weapon: null,
          collectedPickups: new Set(),
          lap: 1,
          aiFire: 4 + i,
          aiLane: i % 2 ? -3 : 3,
        }) as Racer,
    );
    this.player = this.racers[0];
    this.player.x = 0;
    for (const r of this.racers) {
      const f = track.frame(r.s);
      r.position = f.p.clone().addScaledVector(f.right, r.x);
      r.position.y += HOVER;
      r.velocity = new THREE.Vector3();
      r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
      r.yawRate = 0;
      r.pitchTrim = 0;
      r.pitch = -Math.asin(f.tangent.y);
      r.pitchRate = 0;
      r.contactS = r.s;
      r.gate = 1;
      r.grounded = true;
      r.checkpoint = { s: r.s, branch: 0, gate: 1 };
      r.offroad = 0;
      r.contactSound = 0;
      // Prepare solid hulls while the race loads, not on its first active frame.
      hullMotion(r);
    }
  }
  emit(kind: string, text: string) {
    this.events.push({ kind, text });
  }
  updateCriticalShield() {
    const critical =
      !this.finished &&
      this.player.shield > 0 &&
      this.player.shield <= CRITICAL_SHIELD;
    if (critical === this.criticalShield) return;
    this.criticalShield = critical;
    this.emit(
      critical ? "critical" : "critical-clear",
      critical ? "SHIELD CRITICAL" : "",
    );
  }
  settlePlayerResult() {
    if (this.resultPosition !== null || this.player.finalPosition === null)
      return;
    this.resultPosition = this.player.finalPosition;
    this.resultTime = this.player.eliminated
      ? this.player.eliminationTime
      : this.player.finishTime;
    this.finished = true;
    this.updateCriticalShield();
    this.emit(
      "finish",
      this.player.eliminated ? "ELIMINATED" : "RACE COMPLETE",
    );
  }
  eliminate(r: Racer) {
    if (r.eliminated || r.finished) return;
    r.eliminated = true;
    r.eliminationTime = this.time;
    r.finalPosition = this.racers.length - this.eliminations.length;
    this.eliminations.push(r);
    r.shield = 0;
    r.weapon = null;
    r.protect = r.boost = r.surge = r.pulseHit = r.weaponHit = r.speed = 0;
    r.velocity.set(0, 0, 0);
    this.complete = this.racers.every(
      (racer) => racer.eliminated || racer.finished,
    );
    this.settlePlayerResult();
  }
  damage(r: Racer, amount: number, weapon: Weapon | null = null) {
    if (r.eliminated || r.finished || r.protect > 0) return;
    if (weapon === "PULSE") r.pulseHit = 0.65;
    const armedHit =
      weapon === "PULSE" || weapon === "MISSILE" || weapon === "MINE";
    r.shield -= amount / CRAFT[r.craft].armor;
    if (armedHit) {
      r.weaponHit = WEAPON_HIT_DURATION;
      // Preserve flight height, heading and pilot authority; only lose planar speed.
      r.velocity.x *= 0.68;
      r.velocity.z *= 0.68;
    } else {
      r.velocity.multiplyScalar(0.78);
      r.stun = 0.6;
    }
    r.speed = Math.hypot(r.velocity.x, r.velocity.z);
    if (r.id === 0) this.emit("hit", "IMPACT");
    if (r.shield <= 0) this.eliminate(r);
    this.updateCriticalShield();
  }
  recover(r: Racer) {
    if (r.eliminated || r.finished) return;
    if (r.shield <= 0) {
      this.eliminate(r);
      return;
    }
    const { s, branch, gate } = r.checkpoint;
    r.gate = gate;
    const f = this.track.frame(s, branch);
    r.position.copy(f.p);
    r.position.y += HOVER;
    r.velocity.set(0, 0, 0);
    r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
    r.yawRate = 0;
    r.pitchTrim = 0;
    r.pitch = -Math.asin(f.tangent.y);
    r.pitchRate = 0;
    r.contactS = s;
    r.s = s;
    r.branch = branch;
    r.speed = r.x = r.vx = r.h = r.vy = r.offroad = 0;
    r.grounded = true;
    r.flight = false;
    r.descentFlight = undefined;
    r.boost = r.surge = r.pulseHit = r.weaponHit = 0;
    r.recoveredThisStep = true;
  }
  pulsePathClear(source: Racer, target: Racer) {
    const { track } = this;
    let branch = source.branch || target.branch;
    if (source.branch && target.branch && source.branch !== target.branch) {
      if (roadBounds(track, source.contactS, source.branch).connected)
        branch = target.branch;
      else if (!roadBounds(track, target.contactS, target.branch).connected)
        return false;
    }
    // Follow the local road interval, not a nearby deck on another part of the
    // circuit. Sample at the same 4m resolution as physical road projection.
    const distance =
      mod(target.contactS - source.contactS + track.length / 2, track.length) -
      track.length / 2;
    const steps = Math.max(1, Math.ceil(Math.abs(distance) / 4));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const s = source.contactS + distance * t;
      const f = track.frame(s, branch);
      const bounds = roadBounds(track, s, branch);
      const point = source.position.clone().lerp(target.position, t);
      const offset = point.sub(f.p);
      const lateral = offset.dot(f.right);
      if (
        lateral < bounds.wallMin ||
        lateral > bounds.wallMax ||
        Math.abs(offset.dot(f.tangent)) > 4
      )
        return false;
    }
    return !this.terrain?.sweepSurface(source.position, target.position, 0);
  }
  scrapWeapon(r = this.player) {
    if (
      !r.weapon ||
      r.eliminated ||
      r.finished ||
      this.countdown > 0 ||
      this.complete
    )
      return;
    r.weapon = null;
    const before = r.shield;
    r.shield = Math.min(100, r.shield + 5);
    const gain = Math.ceil(r.shield) - Math.ceil(before);
    if (r.id === 0)
      this.emit("scrap", gain > 0 ? `SHIELD +${gain}` : "WEAPON SCRAPPED");
  }
  fire(r = this.player) {
    if (
      !r.weapon ||
      r.eliminated ||
      r.finished ||
      this.countdown > 0 ||
      this.complete
    )
      return;
    const weapon = r.weapon;
    r.weapon = null;
    if (r.id === 0) this.emit("fire", weapon);
    if (weapon === "TURBO") r.surge = 2.4;
    else if (weapon === "SHIELD") {
      r.protect = 5;
      r.shield = Math.min(100, r.shield + 12);
    } else if (weapon === "MINE") {
      const forward = new THREE.Vector3(Math.sin(r.yaw), 0, Math.cos(r.yaw));
      this.mines.push({
        s: r.s,
        x: r.x,
        branch: r.branch,
        position: r.position.clone().addScaledVector(forward, -5),
        owner: r.id,
        life: 14,
      });
    } else {
      const forward = new THREE.Vector3(Math.sin(r.yaw), 0, Math.cos(r.yaw));
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      const targets = this.racers
        .filter((t) => t.id !== r.id && !t.eliminated && !t.finished)
        .map((t) => {
          const offset = t.position.clone().sub(r.position);
          return {
            r: t,
            d: offset.dot(forward),
            side: Math.abs(offset.dot(right)),
            height: Math.abs(offset.y),
          };
        })
        .filter((t) => t.d > 0 && t.height < 12);
      const target = targets
        .filter(
          (t) => t.d < 220 && t.side < t.d * 0.6 && t.r.branch === r.branch,
        )
        .sort((a, b) => a.d - b.d)[0];
      if (weapon === "PULSE") {
        for (const target of targets)
          if (
            target.d < 90 &&
            target.side < 10 &&
            this.pulsePathClear(r, target.r)
          )
            this.damage(target.r, 18, "PULSE");
        this.shots.push({
          s: r.s,
          x: r.x,
          branch: r.branch,
          position: r.position.clone(),
          owner: r.id,
          type: weapon,
          direction: forward,
          life: 0.35,
        });
      } else {
        if (target?.r.id === 0)
          this.emit("incoming", "MISSILE LOCK / INCOMING");
        this.shots.push({
          s: r.s,
          x: r.x,
          branch: r.branch,
          owner: r.id,
          target: target?.r.id,
          position: r.position.clone(),
          velocity: forward.clone().multiplyScalar(320 * this.classSpec.pace),
          type: weapon,
          life: 3,
        });
      }
    }
  }
  advanceFinishers(dt: number) {
    const { track } = this;
    const { pace } = this.classSpec;
    for (const r of this.finishers) {
      // Cooldown laps are presentation-only: no gates, pickups, weapons or
      // hull contacts can change a result or interfere with racers still racing.
      const cruise = Math.sqrt(CRAFT[r.craft].thrust / 0.0024) * pace * 0.72;
      r.speed += (cruise - r.speed) * (1 - Math.exp(-dt / 2));
      r.s = r.contactS += r.speed * dt;
      const u = mod(r.contactS, track.length) / track.length;
      const [start, end] = track.config.split;
      if (u <= start || u >= end) r.branch = 0;
      else if (!r.branch) r.branch = r.id % 2 ? -1 : 1;
      const f = track.frame(r.contactS, r.branch);
      const bounds = roadBounds(track, r.contactS, r.branch);
      const lane = clamp(
        ((r.id % 4) - 1.5) * 2,
        bounds.wallMin + 2,
        bounds.wallMax - 2,
      );
      r.x += (lane - r.x) * (1 - Math.exp(-dt));
      r.finishOffset!.multiplyScalar(Math.exp(-dt * 3));
      const previous = r.position.clone();
      r.position.copy(f.p).addScaledVector(f.right, r.x);
      let pitch = -Math.asin(f.tangent.y);
      if (track.gap(u)) {
        // The missing deck starts below the ramp lip. Cooldown presentation
        // bridges that discontinuity instead of snapping a finished hull down
        // onto the absent road; race physics and earned results are untouched.
        const launchS = track.config.jump! * track.length;
        const landingS = launchS + track.config.gapLength! * track.length;
        const span = landingS - launchS;
        const lip = track.frame(launchS - 0.001, r.branch);
        const landing = track.frame(landingS, r.branch);
        const rise =
          ((lip.p.y - track.frame(launchS - 6, r.branch).p.y) / 5.999) * span;
        const fall =
          ((track.frame(landingS + 6, r.branch).p.y - landing.p.y) / 6) * span;
        const t = (u * track.length - launchS) / span;
        const t2 = t * t;
        const t3 = t2 * t;
        const height =
          (2 * t3 - 3 * t2 + 1) * lip.p.y +
          (t3 - 2 * t2 + t) * rise +
          (-2 * t3 + 3 * t2) * landing.p.y +
          (t3 - t2) * fall;
        const slope =
          ((6 * t2 - 6 * t) * lip.p.y +
            (3 * t2 - 4 * t + 1) * rise +
            (-6 * t2 + 6 * t) * landing.p.y +
            (3 * t2 - 2 * t) * fall) /
          span;
        r.position.y += height - f.p.y;
        pitch = -Math.atan2(
          slope,
          Math.hypot(f.tangent.x, f.tangent.z) * f.metric,
        );
      }
      r.position.y += HOVER;
      r.position.add(r.finishOffset!);
      r.velocity.copy(r.position).sub(previous).divideScalar(dt);
      const turn =
        angle(Math.atan2(f.tangent.x, f.tangent.z) - r.yaw) *
        (1 - Math.exp(-dt * 6));
      r.yaw += turn;
      r.yawRate = turn / dt;
      r.pitch += (pitch - r.pitch) * (1 - Math.exp(-dt * 6));
      r.h *= Math.exp(-dt * 3);
      r.vx = r.velocity.dot(f.right);
      r.vy = r.velocity.y;
      r.grounded = !track.gap(u);
      r.protect = Math.max(0, r.protect - dt * pace);
      r.surge = Math.max(0, r.surge - dt * pace);
      r.boost *= Math.exp(-dt * pace);
    }
  }
  update(dt: number, input: RaceInput) {
    this.advanceFinishers(dt);
    if (this.complete) return;
    for (const r of this.racers) if (r.shield <= 0) this.eliminate(r);
    this.updateCriticalShield();
    if (this.complete) return;
    if (this.countdown > 0) {
      const countdownStep = Math.min(dt, this.countdown);
      this.launch.observe(input.throttle, input.launchIntent);
      const launchStep = clamp(
        LAUNCH_COUNTDOWN_SECONDS - (this.countdown - countdownStep),
        0,
        countdownStep,
      );
      if (launchStep > 0)
        this.launch.update(launchStep, input.throttle, input.launchIntent);
      this.countdown = Math.max(0, this.countdown - countdownStep);
      if (this.countdown > 0) return;
      this.launch.resolve();
      if (this.launch.success) this.player.surge = 1.8;
      dt -= countdownStep;
      if (dt <= 0) return;
    }
    this.time += dt;
    const { track } = this;
    const { pace } = this.classSpec;
    const pace2 = pace * pace;
    // A class traverses the same physical envelope in less real time.
    // Race/countdown clocks stay real; mechanical effects use class time.
    const classDt = dt * pace;
    const active = this.racers.filter((r) => !r.eliminated && !r.finished);
    const finishCrossings: { r: Racer; fraction: number }[] = [];
    const previousPositions = new Map(
      active.map((r) => {
        r.recoveredThisStep = false;
        return [r, r.position.clone()];
      }),
    );
    const previousYaw = new Map(active.map((r) => [r, r.yaw]));
    const previousPitch = new Map(active.map((r) => [r, r.pitch]));
    const previousRoute = new Map(
      active.map((r) => [r, { s: r.contactS, branch: r.branch }]),
    );
    for (const r of active) {
      if (r.eliminated) continue;
      r.wallTouched = r.contactMoved = false;
      r.contactSound = Math.max(0, r.contactSound - classDt);
      const spec = CRAFT[r.craft];
      const ai = r.id !== 0;
      let controls = input;
      if (ai) {
        // A look-ahead driver, not a second movement model.
        const u = mod(r.contactS, track.length) / track.length;
        const [forkStart, forkEnd] = track.config.split;
        const choosingFork =
          u > forkStart - 0.04 && u < forkStart + (forkEnd - forkStart) * 0.3;
        const intendedBranch =
          choosingFork &&
          (!r.branch || track.bounds(r.contactS, r.branch).connected)
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
              track.curvature(
                r.contactS + (r.speed * t) / pace,
                intendedBranch,
              ),
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
              track.frame(r.contactS + (r.speed * t) / pace, intendedBranch)
                .tangent.y,
            ) > 0.08,
        );
        look.p.addScaledVector(
          look.right,
          racingLine(
            r,
            traffic,
            transition || steep || !r.grounded
              ? 6
              : Math.min(road.width, look.width),
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
        const air = clamp(
          (yawDemand - steer * 0.9 * spec.handling) / 0.5,
          -1,
          1,
        );
        const spacingBrake = followingBrake(traffic, lane, pace);
        const slowing = Math.max(
          spacingBrake,
          clamp((r.speed - cornerSpeed) / (30 * pace), 0, 1),
          Math.abs(error) > 0.7 ? 1 : 0,
        );
        const pairedAir = slowing * (1 - Math.abs(air));
        controls = {
          throttle:
            !spacingBrake && r.speed < cornerSpeed && Math.abs(error) < 0.7
              ? AI_THROTTLE
              : 0,
          steer,
          airLeft: pairedAir + Math.max(0, air),
          airRight: pairedAir + Math.max(0, -air),
        };
        r.aiFire -= classDt;
        if (r.aiFire <= 0) {
          this.fire(r);
          r.aiFire = 4 + ((r.id * 7) % 6);
        }
      }
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
      r.velocity.x +=
        (fx * thrust + rx * lateralForce - r.velocity.x * drag) * dt;
      r.velocity.z +=
        (fz * thrust + rz * lateralForce - r.velocity.z * drag) * dt;
      if (!r.grounded) {
        // Deflect momentum, not position: pulling up trades forward speed for climb.
        // Pitch authority stays below class gravity, even at extreme velocity.
        const pitchRate =
          (r.pitchTrim * 0.7 * pace) / (1 + r.velocity.length() / (120 * pace));
        r.velocity.applyAxisAngle(new THREE.Vector3(rx, 0, rz), pitchRate * dt);
      }
      const origin = r.position.clone();
      const initialPitch = r.pitch;
      const initialYaw = previousYaw.get(r)!;
      let fieldRoad: RoadProjection | null = null;
      let captured = false;
      const sampleHover = (time: number, y: number, vy: number) => {
        const point = new THREE.Vector3(
          origin.x + r.velocity.x * time,
          y,
          origin.z + r.velocity.z * time,
        );
        const surface = this.surface.beneath(point, 0, Infinity);
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
    const roads = new Map<Racer, RoadProjection>();
    const deckContacts = new Map<Racer, RoadSurfaceContact>();
    const terrainImpacts = new Set<Racer>();
    for (const r of active) {
      const previous = previousPositions.get(r)!;
      const oldYaw = previousYaw.get(r)!;
      const oldPitch = previousPitch.get(r)!;
      const shape = contactHull(r.craft);
      const motion = hullMotion(r);
      writeCraftVertices(
        { craft: r.craft, yaw: oldYaw, pitch: oldPitch },
        motion.start,
      );
      writeCraftVertices(r, motion.end);
      const contact = this.surface.sweep(
        previous,
        r.position,
        shape,
        (fraction) => linearHullVertices(motion, fraction),
      );
      const terrainContact = this.terrain?.sweepSurface(
        previous,
        r.position,
        craftSupport(r, UP),
      );
      if (
        terrainContact &&
        (!contact || terrainContact.fraction < contact.fraction)
      ) {
        terrainImpacts.add(r);
        roads.set(r, projectRoad(track, r.position, r.contactS, r.branch));
        continue;
      }
      if (contact) {
        const centre = previous.clone().lerp(r.position, contact.fraction);
        const normalVelocity = r.velocity.dot(contact.up);
        if (normalVelocity < 0)
          r.velocity.addScaledVector(contact.up, -normalVelocity);
        // Complete the remaining motion along the contacted surface. Landing
        // removes penetration momentum, never forward/tangential momentum.
        r.position
          .copy(centre)
          .addScaledVector(r.velocity, dt * (1 - contact.fraction));
        const { road, rail } = surfaceRoad(
          track,
          r.position,
          r.contactS,
          contact,
        );
        r.contactS = road.s;
        r.branch = road.branch;
        roads.set(r, rail);
        deckContacts.set(r, contact);
      } else roads.set(r, projectRoad(track, r.position, r.contactS, r.branch));
    }
    const crossesSplitter = (r: Racer, road: RoadProjection) => {
      if (road.connected || !road.branch) return false;
      const previous = roadBounds(track, r.contactS, road.branch);
      if (!previous.connected) {
        const side = road.innerSide;
        const previousHeight =
          side === 1 ? previous.railMaxHeight : previous.railMinHeight;
        const nextHeight = side === 1 ? road.railMaxHeight : road.railMinHeight;
        const x = r.position.clone().sub(road.point).dot(road.wallAxis);
        const edge = side === 1 ? road.wallMax : road.wallMin;
        // A low median nose can rise into the hull as it travels forward. Its
        // finite outward footprint matters; a remote car is never pulled in.
        return (
          nextHeight > previousHeight &&
          side * (x - edge) <=
            RAIL_PROFILE.topOutset + hullExtent(r, road.wallAxis)
        );
      }
      const f = track.frame(r.contactS, road.branch);
      const x = previousPositions.get(r)!.clone().sub(f.p).dot(f.right);
      const extent = hullExtent({ yaw: previousYaw.get(r)! }, f.right);
      return (
        x >= previous.wallMin + extent - 0.05 &&
        x <= previous.wallMax - extent + 0.05
      );
    };
    const previousRoads = new Map<Racer, RoadProjection>();
    const startedInsideRails = (r: Racer, next: RoadProjection) => {
      const position = previousPositions.get(r)!;
      let road = previousRoads.get(r);
      if (!road) {
        const { s, branch } = previousRoute.get(r)!;
        road = projectRoad(track, position, s, branch);
        previousRoads.set(r, road);
      }
      const offset = next.s - road.s;
      // Use the previous station on the same connected road. A wall on an
      // unrelated landing deck still requires approach from its inside face.
      if (
        offset < -ROAD_LOOK_BEHIND ||
        offset >= ROAD_LOOK_AHEAD ||
        (next.branch !== road.branch && !next.connected && !road.connected)
      )
        road = next;
      const bounds = railBounds({ yaw: previousYaw.get(r)! }, road, position);
      const x = position.clone().sub(road.point).dot(road.wallAxis);
      return x >= bounds.min - 0.05 && x <= bounds.max + 0.05;
    };
    const constrainWall = (r: Racer) => {
      if (terrainImpacts.has(r)) return;
      r.contactMoved = true;
      const road = roads.get(r)!;
      const { min, max, intersectsMin, intersectsMax } = railBounds(
        r,
        road,
        r.position,
      );
      const x = r.position.clone().sub(road.point).dot(road.wallAxis);
      if (
        (x >= min && x <= max) ||
        track.gap(mod(road.s, track.length) / track.length) ||
        (x < min ? !intersectsMin : !intersectsMax) ||
        (!crossesSplitter(r, road) && !startedInsideRails(r, road))
      )
        return;
      const sign = x < min ? -1 : 1;
      r.position.addScaledVector(road.right, clamp(x, min, max) - x);
      respondToRail(r, road, sign);
      r.wallTouched = true;
      r.wallSide = sign;
    };
    // Resolve static barriers before hover contact as well as between pair iterations.
    for (const r of active) {
      if (r.eliminated) continue;
      constrainWall(r);
      r.contactMoved = r.wallTouched;
    }
    solveContacts(
      active.filter((r) => !r.eliminated && !terrainImpacts.has(r)),
      constrainWall,
      (a, b, closing) => {
        closing /= pace;
        for (const r of [a, b]) {
          if (closing > 12 && r.protect <= 0)
            r.shield -= ((closing - 12) * 0.1) / CRAFT[r.craft].armor;
          if (closing > 4 && r.contactSound === 0) {
            if (r.id === 0)
              this.emit(closing > 18 ? "hit" : "scrape", "CONTACT");
            r.contactSound = 0.25;
          }
        }
      },
    );
    for (const r of active) {
      if (r.eliminated) continue;
      if (r.shield <= 0) {
        this.eliminate(r);
        continue;
      }
      if (terrainImpacts.has(r)) {
        r.shield -= clamp(r.shield - 10, 0, 24);
        this.recover(r);
        if (r.id === 0) this.emit("hit", "GROUND IMPACT");
        // A checkpoint return cannot sweep through gates or pickups.
        continue;
      }
      const previous = previousPositions.get(r)!;
      const ai = r.id !== 0;
      const wasGrounded = r.grounded;
      let road = r.contactMoved
        ? projectRoad(track, r.position, r.contactS, r.branch)
        : roads.get(r)!;
      let railRoad = road;
      const sweptContact = deckContacts.get(r);
      const physicalSurface =
        sweptContact ??
        this.surface.beneath(r.position, 0, HOVER + HOVER_REACH);
      let touchingDeck = sweptContact !== undefined;
      let fieldContact = false;
      if (physicalSurface) {
        const normalDistance = r.position
          .clone()
          .sub(physicalSurface.point)
          .dot(physicalSurface.up);
        let clearance: number | undefined =
          normalDistance - craftSupport(r, physicalSurface.up);
        if (clearance < 0) {
          // The lowest global vertex can be over a gap. Only hull features
          // above this finite triangle can penetrate or support the craft.
          const finite = this.surface.finiteContact(
            physicalSurface.faceId,
            r.position,
            contactHull(r.craft),
            hullMotion(r).end,
          );
          clearance = finite?.distance;
        }
        const offset =
          mod(physicalSurface.s - r.contactS + track.length / 2, track.length) -
          track.length / 2;
        const establishedContact =
          wasGrounded &&
          physicalSurface.branch === r.branch &&
          offset >= -ROAD_LOOK_BEHIND &&
          offset < ROAD_LOOK_AHEAD;
        fieldContact =
          clearance !== undefined &&
          (clearance >= 0 || touchingDeck || establishedContact);
        if (fieldContact) {
          const selected = surfaceRoad(
            track,
            r.position,
            r.contactS,
            physicalSurface,
          );
          road = selected.road;
          railRoad = selected.rail;
          if (clearance! <= 0 && (establishedContact || touchingDeck)) {
            r.position.addScaledVector(physicalSurface.up, -clearance!);
            const normalVelocity = r.velocity.dot(physicalSurface.up);
            if (normalVelocity < 0)
              r.velocity.addScaledVector(physicalSurface.up, -normalVelocity);
            touchingDeck = true;
          }
        }
      }
      const u = mod(road.s, track.length) / track.length;
      const [splitStart, splitEnd] = track.config.split;
      if (u > splitStart && u < splitEnd) r.branch = road.branch;
      else r.branch = 0;
      const splitterEntry = crossesSplitter(r, railRoad);
      r.contactS = road.s;
      r.x = road.x;
      r.vx = r.velocity.dot(road.wallAxis);
      const gap = track.gap(u);
      const height = r.position.y - roadHeight(road, r.position) - HOVER;
      // Rail faces follow the authored frame, not the triangulated deck normal.
      const { min, max } = railBounds(r, railRoad, r.position);
      const onDeck = railRoad.x >= min - 0.05 && railRoad.x <= max + 0.05;
      r.grounded =
        touchingDeck ||
        (!gap && fieldContact && onDeck && height < HOVER_REACH);
      const gateStation = (gate: number) =>
        track.finishS + (gate * track.length) / GATES;
      if (wasGrounded && !r.grounded) {
        r.flight = true;
        const from = previousRoute.get(r)!;
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
        const from = previousRoute.get(r)!;
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
        if (!wasGrounded && r.id === 0) this.emit("land", "TOUCHDOWN");
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
      } else if (gap && wasGrounded && r.id === 0) this.emit("jump", "FLIGHT");
      // Validate the swept crossing itself, not the end-of-step deck contact.
      // A legal airborne crossing can end outside the deck beside a jump.
      if (r.grounded || r.flight) {
        const gateS = gateStation(r.gate);
        const gateFrame = track.frame(gateS, r.branch);
        const before = previous.clone().sub(gateFrame.p).dot(gateFrame.tangent);
        const after = r.position
          .clone()
          .sub(gateFrame.p)
          .dot(gateFrame.tangent);
        if (before < 0 && after >= 0) {
          const fraction = before / (before - after);
          const crossing = previous.clone().lerp(r.position, fraction);
          const bounds = roadBounds(track, gateS, r.branch);
          const lateral = crossing
            .clone()
            .sub(gateFrame.p)
            .dot(gateFrame.right);
          const normal = new THREE.Vector3()
            .crossVectors(gateFrame.tangent, gateFrame.right)
            .normalize();
          const gateHeight =
            crossing.clone().sub(gateFrame.p).dot(normal) - HOVER * normal.y;
          const drop = track.config.sections?.descent;
          const inDrop =
            drop && gateFrame.u >= drop[0] && gateFrame.u <= drop[1];
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
                const crossingTime = this.time - dt + fraction * dt;
                const lapTime = crossingTime - this.lapStart;
                this.laps.push(lapTime);
                this.bestLap = Math.min(this.bestLap, lapTime);
                this.lapStart = crossingTime;
                if (r.lap <= this.lapCount)
                  this.emit("lap", "LAP " + r.lap + " / " + this.lapCount);
              }
              if (r.lap > this.lapCount) finishCrossings.push({ r, fraction });
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
      // Resolve a crossing from inside the barrier, never pull a remote body back to it.
      if (
        r.wallTouched ||
        (!gap &&
          (railRoad.x < min || railRoad.x > max) &&
          (splitterEntry || startedInsideRails(r, railRoad)) &&
          (railRoad.x < min
            ? railBounds(r, railRoad, r.position).intersectsMin
            : railBounds(r, railRoad, r.position).intersectsMax))
      ) {
        const sign = r.wallTouched ? r.wallSide! : railRoad.x < min ? -1 : 1;
        if (railRoad.x < min || railRoad.x > max)
          r.position.addScaledVector(
            railRoad.right,
            clamp(railRoad.x, min, max) - railRoad.x,
          );
        respondToRail(r, railRoad, sign);
        r.wallTouched = true;
        r.wallSide = sign;
        r.velocity.x *= Math.exp(-3 * classDt);
        r.velocity.z *= Math.exp(-3 * classDt);
        if (r.protect <= 0) r.shield -= classDt * 10;
        if (r.stun === 0) {
          r.stun = 0.3;
          if (!ai) this.emit("scrape", "IMPACT");
        }
        // Banked corrections can move the closest centreline station slightly.
        // Settle against the final rendered face, not the pre-contact plane.
        const settledRoad = projectRoad(
          track,
          r.position,
          r.contactS,
          r.branch,
        );
        const settled = railBounds(r, settledRoad, r.position);
        const settledX = r.position
          .clone()
          .sub(settledRoad.point)
          .dot(settledRoad.wallAxis);
        r.position.addScaledVector(
          settledRoad.right,
          clamp(settledX, settled.min, settled.max) - settledX,
        );
        r.contactS = settledRoad.s;
        r.x = clamp(settledX, settled.min, settled.max);
      }
      if (!r.grounded) r.offroad += classDt;
      if (r.shield <= 0) {
        this.eliminate(r);
        continue;
      }
      // An airborne body may land on another deck. Only an actual terrain hit
      // or descent entirely below every road is a lost racer, not elapsed air
      // time or distance beneath its previous route.
      if (
        !r.grounded &&
        r.velocity.y < 0 &&
        r.position.y + craftSupport(r, DOWN) < this.surface.lowestRoadY
      ) {
        r.shield -= clamp(r.shield - 10, 0, 24);
        this.recover(r);
        if (!ai) this.emit("hit", "RESCUE");
        continue;
      }
      r.h = Math.max(0, r.position.y - roadHeight(road, r.position) - HOVER);
      r.vy = r.velocity.y;
      r.speed = Math.hypot(r.velocity.x, r.velocity.z);
      if (r.grounded && !r.recoveredThisStep) {
        for (const [index, pad] of this.pickups.entries()) {
          const key = `${r.lap}:${pad.id}`;
          if (
            r.collectedPickups.has(key) ||
            !crossesPickup(track, pad, previous, r.position, r.branch)
          )
            continue;
          r.collectedPickups.add(key);
          if (pad.type === "boost") {
            r.surge = 1.15;
            if (!ai) this.emit("boost", "BOOST");
          } else if (!r.weapon && this.mode !== "trial") {
            r.weapon =
              WEAPONS[
                (Math.floor(this.time * pace * 13) + r.id + index) %
                  WEAPONS.length
              ];
            if (!ai) this.emit("pickup", r.weapon);
          } else r.shield = Math.min(100, r.shield + 8);
        }
      }
      r.shield = clamp(r.shield, 0, 100);
    }
    for (const shot of this.shots) {
      shot.life -= classDt;
      if (shot.type !== "MISSILE") continue;
      const previous = shot.position.clone();
      const candidate = this.racers[shot.target!];
      const target =
        candidate && !candidate.eliminated && !candidate.finished
          ? candidate
          : null;
      if (target) {
        const desired = target.position.clone().sub(shot.position).normalize();
        shot.velocity
          .lerp(desired.multiplyScalar(320 * pace), 1 - Math.exp(-classDt * 3))
          .normalize()
          .multiplyScalar(320 * pace);
      }
      shot.position.addScaledVector(shot.velocity, dt);
      if (target) {
        const segment = shot.position.clone().sub(previous);
        const t = clamp(
          target.position.clone().sub(previous).dot(segment) /
            segment.lengthSq(),
          0,
          1,
        );
        const closest = previous.addScaledVector(segment, t);
        if (closest.distanceTo(target.position) < 5) {
          this.damage(target, 28, "MISSILE");
          shot.life = 0;
        }
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
    for (const mine of this.mines) {
      mine.life -= classDt;
      for (const r of this.racers)
        if (
          !r.eliminated &&
          !r.finished &&
          r.id !== mine.owner &&
          r.position.distanceTo(mine.position) < 5
        ) {
          this.damage(r, 24, "MINE");
          mine.life = 0;
          break;
        }
    }
    this.mines = this.mines.filter((m) => m.life > 0);
    // Crossing fraction resolves racers crossing in the same physics step.
    // A lethal impact in that step takes precedence over a pending finish.
    finishCrossings.sort((a, b) => a.fraction - b.fraction || a.r.id - b.r.id);
    for (const { r, fraction } of finishCrossings) {
      if (r.eliminated) continue;
      r.finished = true;
      r.weaponHit = 0;
      r.finishTime = this.time - dt + fraction * dt;
      r.finalPosition = this.finishers.length + 1;
      this.finishers.push(r);
      r.weapon = null;
      const f = track.frame(r.contactS, r.branch);
      const hover = f.p.clone().addScaledVector(f.right, r.x);
      hover.y += HOVER;
      r.finishOffset = r.position.clone().sub(hover);
    }
    this.complete = this.racers.every((r) => r.eliminated || r.finished);
    this.settlePlayerResult();
    this.updateCriticalShield();
  }
  get position() {
    if (this.resultPosition !== null) return this.resultPosition;
    return (
      1 +
      this.racers.filter(
        (r) =>
          r !== this.player &&
          !r.eliminated &&
          (r.finished || r.s > this.player.s),
      ).length
    );
  }
}
