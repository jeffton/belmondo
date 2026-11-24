import * as THREE from "three";
import { clamp, mod, roadBounds } from "./track.ts";
import { getRoadSurface } from "./road-surface.ts";
import { getTrackPickups } from "./pickups.ts";
import { Launch } from "./launch.ts";
import {
  GRID_APPROACH_SECONDS,
  LAUNCH_COUNTDOWN_SECONDS,
} from "./start-sequence.ts";
import { SPEED_CLASSES } from "./speed-classes.ts";
import { WEAPON_HIT_DURATION } from "./weapon-hit.ts";
import {
  CRAFT,
  CRITICAL_SHIELD,
  HOVER,
  LAPS_BY_CLASS,
  angle,
} from "./race-rules.ts";
import { hullMotion } from "./race-road-contact.ts";
import { advanceRacerBodies } from "./race-motion.ts";
import { resolveRaceContacts } from "./race-collisions.ts";
import { settleFinishCrossings } from "./race-progress.ts";
import { advanceOrdnance } from "./race-ordnance.ts";
import type { Track } from "./track.ts";
import type { TrackPickup } from "./pickups.ts";
import type { RoadSurface } from "./road-surface.ts";
import type { FinishCrossing } from "./race-progress.ts";

export { SPEED_CLASSES } from "./speed-classes.ts";
export {
  AI_THROTTLE,
  CRAFT,
  CRITICAL_SHIELD,
  LAPS_BY_CLASS,
  WEAPONS,
} from "./race-rules.ts";

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
    r.shield = Math.min(100, r.shield + 10);
    if (r.id === 0) this.events.push({ kind: "scrap" });
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
    else if (weapon === "SHIELD") r.protect = 5;
    else if (weapon === "MINE") {
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
    const { pace } = this.classSpec;
    // A class traverses the same physical envelope in less real time.
    // Race/countdown clocks stay real; mechanical effects use class time.
    const classDt = dt * pace;
    const active = this.racers.filter((r) => !r.eliminated && !r.finished);
    const finishCrossings: FinishCrossing[] = [];
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
    advanceRacerBodies(this, active, previousYaw, dt, classDt, input);
    resolveRaceContacts(
      this,
      active,
      { previousPositions, previousYaw, previousPitch, previousRoute },
      dt,
      classDt,
      finishCrossings,
    );
    advanceOrdnance(this, dt, classDt);
    settleFinishCrossings(this, finishCrossings, dt);
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
