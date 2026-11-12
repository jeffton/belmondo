import * as THREE from "three";
import { clamp, mod, roadBounds } from "./track.js";
import { projectRoad, roadHeight } from "./road-projection.js";
import { solveContacts, hullExtent } from "./contacts.js";
import { getTrackPickups, crossesPickup } from "./pickups.js";
import { Launch } from "./launch.js";
import { railBounds, respondToRail, RAIL_PROFILE } from "./rail-profile.js";
import { SPEED_CLASSES } from "./speed-classes.js";

export { SPEED_CLASSES } from "./speed-classes.js";

const angle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const HOVER = 2.2;
const GATES = 32;

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
export const WEAPONS = ["MISSILE", "PULSE", "MINE", "SHIELD", "TURBO"];
export const LAPS = 5;

export class Race {
  constructor(track, craft = 0, mode = "race", speedClass = 0, terrain = null) {
    this.terrain = terrain;
    this.speedClass = speedClass;
    this.classSpec = SPEED_CLASSES[speedClass];
    this.track = track;
    this.pickups = getTrackPickups(track);
    this.mode = mode;
    this.time = 0;
    this.countdown = 3.2;
    this.launch = new Launch();
    this.finished = false;
    this.events = [];
    this.shots = [];
    this.mines = [];
    this.bestLap = Infinity;
    this.lapStart = 0;
    this.laps = [];
    this.racers = Array.from({ length: mode === "trial" ? 1 : 8 }, (_, i) => ({
      id: i,
      craft: i ? i % 3 : craft,
      s: -i * 9,
      x: i % 2 ? -3 : 3,
      vx: 0,
      speed: 0,
      h: 0,
      vy: 0,
      branch: 0,
      shield: 100,
      protect: 0,
      surge: 0,
      boost: 0,
      stun: 0,
      pulseHit: 0,
      weapon: null,
      collectedPickups: new Set(),
      lap: 1,
      aiFire: 4 + i,
    }));
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
      r.contactS = r.s;
      r.gate = 1;
      r.grounded = true;
      r.checkpoint = { s: r.s, branch: 0, gate: 1 };
      r.offroad = 0;
      r.contactSound = 0;
    }
  }
  emit(kind, text) {
    this.events.push({ kind, text });
  }
  damage(r, amount, weapon = null) {
    if (r.protect > 0) return;
    if (weapon === "PULSE") r.pulseHit = 0.65;
    r.shield -= amount / CRAFT[r.craft].armor;
    r.velocity.multiplyScalar(0.78);
    r.speed = Math.hypot(r.velocity.x, r.velocity.z);
    r.stun = 0.6;
    if (r.id === 0) this.emit("hit", "IMPACT");
    if (r.shield <= 0) {
      r.shield = 65;
      this.recover(r);
      r.protect = 2;
      if (r.id === 0) this.emit("hit", "EMERGENCY REBOOT");
    }
  }
  recover(r) {
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
    r.contactS = s;
    r.s = s;
    r.branch = branch;
    r.speed = r.x = r.vx = r.h = r.vy = r.offroad = 0;
    r.grounded = true;
    r.flight = false;
    r.boost = r.surge = r.pulseHit = 0;
    r.recoveredThisStep = true;
  }
  pulsePathClear(source, target) {
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
  fire(r = this.player) {
    if (!r.weapon || this.countdown > 0 || this.finished) return;
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
        .filter((t) => t.id !== r.id)
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
  update(dt, input) {
    if (this.finished) return;
    if (this.countdown > 0) {
      const countdownStep = Math.min(dt, this.countdown);
      this.launch.update(countdownStep, input.throttle, input.launchIntent);
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
    const previousPositions = new Map(
      this.racers.map((r) => {
        r.recoveredThisStep = false;
        return [r, r.position.clone()];
      }),
    );
    const previousYaw = new Map(this.racers.map((r) => [r, r.yaw]));
    for (const r of this.racers) {
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
          track.config.night &&
          u > forkStart - 0.04 &&
          u < forkStart + (forkEnd - forkStart) * 0.3;
        const intendedBranch =
          choosingFork &&
          (!r.branch || track.bounds(r.contactS, r.branch).connected)
            ? r.id % 2
              ? -1
              : 1
            : r.branch;
        const look = track.frame(
          r.contactS + Math.max(18, (r.speed * 0.65) / pace),
          intendedBranch,
        );
        const desiredYaw = Math.atan2(
          look.p.x - r.position.x,
          look.p.z - r.position.z,
        );
        const error = angle(desiredYaw - r.yaw);
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
        // Read crests as well as plan curvature: the same body must brake
        // before negative vertical curvature exceeds its gravity/contact load.
        const crest =
          track.config.night &&
          intendedBranch === 1 &&
          u > forkStart - 0.04 &&
          u < forkEnd
            ? Math.max(
                0,
                ...[0.25, 0.6, 1].map((t) => {
                  const s = r.contactS + (r.speed * t) / pace;
                  const a = track.frame(s - 6, intendedBranch);
                  const b = track.frame(s + 6, intendedBranch);
                  return (a.tangent.y - b.tangent.y) / a.p.distanceTo(b.p);
                }),
              )
            : 0;
        const cornerSpeed = Math.min(
          Math.sqrt((82 * pace2) / Math.max(curve, 0.0001)),
          Math.sqrt((25 * pace2) / Math.max(crest, 0.0001)),
        );
        controls = {
          throttle: true,
          steer: clamp(error * 2.5 - (r.yawRate * 0.25) / pace, -1, 1),
          air: clamp(error * 0.8, -1, 1),
          brake: Math.max(
            clamp((r.speed - cornerSpeed) / (30 * pace), 0, 1),
            Math.abs(error) > 0.7 ? 1 : 0,
          ),
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
        ((controls.throttle ? spec.thrust : 0) + r.boost * 65) *
        pace2 *
        // Electrical disruption briefly attenuates engine force, not momentum
        // direction. Control and thrust return continuously; no lateral shove.
        (1 - (r.pulseHit / 0.65) * 0.6);
      const drag =
        0.02 * pace +
        Math.hypot(r.velocity.x, r.velocity.z) * 0.0024 +
        (controls.brake || 0) * 0.85 * pace +
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
      r.velocity.y -= 35 * pace2 * dt;
      r.position.addScaledVector(r.velocity, dt);
    }
    const roads = new Map(
      this.racers.map((r) => [
        r,
        projectRoad(track, r.position, r.contactS, r.branch),
      ]),
    );
    const crossesSplitter = (r, road) => {
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
      const x = previousPositions.get(r).clone().sub(f.p).dot(f.right);
      const extent = hullExtent({ yaw: previousYaw.get(r) }, f.right);
      return (
        x >= previous.wallMin + extent - 0.05 &&
        x <= previous.wallMax - extent + 0.05
      );
    };
    const constrainWall = (r) => {
      r.contactMoved = true;
      const road = roads.get(r);
      const { min, max, intersectsMin, intersectsMax } = railBounds(
        r,
        road,
        r.position,
      );
      const previousBounds = railBounds(
        { yaw: previousYaw.get(r) },
        road,
        previousPositions.get(r),
      );
      const x = r.position.clone().sub(road.point).dot(road.wallAxis);
      const oldX = previousPositions
        .get(r)
        .clone()
        .sub(road.point)
        .dot(road.wallAxis);
      if (
        track.gap(mod(road.s, track.length) / track.length) ||
        (x < min ? !intersectsMin : !intersectsMax) ||
        (!crossesSplitter(r, road) &&
          (oldX < previousBounds.min - 0.05 ||
            oldX > previousBounds.max + 0.05)) ||
        (x >= min && x <= max)
      )
        return;
      const sign = x < min ? -1 : 1;
      r.position.addScaledVector(road.right, clamp(x, min, max) - x);
      respondToRail(r, road, sign);
      r.wallTouched = true;
      r.wallSide = sign;
    };
    // Resolve static barriers before hover contact as well as between pair iterations.
    for (const r of this.racers) {
      constrainWall(r);
      r.contactMoved = r.wallTouched;
    }
    solveContacts(this.racers, constrainWall, (a, b, closing) => {
      closing /= pace;
      for (const r of [a, b]) {
        if (closing > 12 && r.protect <= 0)
          r.shield -= ((closing - 12) * 0.1) / CRAFT[r.craft].armor;
        if (closing > 4 && r.contactSound === 0) {
          if (r.id === 0) this.emit(closing > 18 ? "hit" : "scrape", "CONTACT");
          r.contactSound = 0.25;
        }
      }
    });
    for (const r of this.racers) {
      const previous = previousPositions.get(r);
      const ai = r.id !== 0;
      const road = r.contactMoved
        ? projectRoad(track, r.position, r.contactS, r.branch)
        : roads.get(r);
      const u = mod(road.s, track.length) / track.length;
      const [splitStart, splitEnd] = track.config.split;
      if (u > splitStart && u < splitEnd) r.branch = road.branch;
      else r.branch = 0;
      const splitterEntry = crossesSplitter(r, road);
      r.contactS = road.s;
      r.x = road.x;
      r.vx = r.velocity.dot(road.wallAxis);
      const gap = track.gap(u);
      let height = r.position.y - roadHeight(road, r.position) - HOVER;
      const { min, max } = railBounds(r, road, r.position);
      let onDeck = road.x >= min - 0.05 && road.x <= max + 0.05;
      const wasGrounded = r.grounded;
      // Resolve the actual deck crossing before endpoint classification. A fast
      // descending hull cannot pass through a road between two physics samples.
      const previousHeight = previous.y - roadHeight(road, previous) - HOVER;
      if (!wasGrounded && !gap && previousHeight > 0 && height <= 0) {
        const fraction = previousHeight / (previousHeight - height);
        const contact = previous.clone().lerp(r.position, fraction);
        const contactX = contact.clone().sub(road.point).dot(road.wallAxis);
        const contactBounds = railBounds(r, road, contact);
        if (contactX >= contactBounds.min && contactX <= contactBounds.max) {
          r.position.copy(contact);
          r.x = road.x = contactX;
          onDeck = true;
          const normalSpeed = r.velocity.dot(road.up);
          if (normalSpeed < 0)
            r.velocity.addScaledVector(road.up, -normalSpeed);
          height = 0;
        }
      }
      r.grounded = !gap && onDeck && height < 1.2 && height > -3;
      if (wasGrounded && !r.grounded && onDeck) r.flight = true;
      if (r.grounded) {
        r.flight = false;
        const roadVy =
          -(road.up.x * r.velocity.x + road.up.z * r.velocity.z) / road.up.y;
        const reaction =
          ((roadVy - r.velocity.y) * 18 * pace - height * 90 * pace2) * dt;
        r.velocity.y += reaction;
        // Bank support contributes inward force, never heading or velocity alignment.
        r.velocity.x += road.wallAxis.x * Math.sin(road.bank) * reaction;
        r.velocity.z += road.wallAxis.z * Math.sin(road.bank) * reaction;
        if (height < -0.35) {
          r.position.y = roadHeight(road, r.position) + HOVER - 0.35;
          r.velocity.y = Math.max(r.velocity.y, roadVy);
        }
        if (!wasGrounded && r.id === 0) this.emit("land", "TOUCHDOWN");
        r.offroad = 0;
        if (
          (u < track.config.jump - 0.025 || u > track.config.jump + 0.025) &&
          road.s >= ((r.gate - 1) * track.length) / GATES &&
          road.s < (r.gate * track.length) / GATES
        )
          r.checkpoint = { s: r.s, branch: r.branch, gate: r.gate };
      } else if (gap && wasGrounded && r.id === 0) this.emit("jump", "FLIGHT");
      if (
        !r.grounded &&
        this.terrain?.sweepSurface(previous, r.position, 1.1)
      ) {
        this.recover(r);
        r.shield = Math.max(10, r.shield - 24);
        if (!ai) this.emit("hit", "GROUND IMPACT");
        // A checkpoint return cannot sweep through gates or pickups.
        continue;
      }
      if (r.grounded || (r.flight && onDeck && height > -3)) {
        const gateS = (r.gate * track.length) / GATES;
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
                const lapTime = this.time - this.lapStart;
                this.laps.push(lapTime);
                this.bestLap = Math.min(this.bestLap, lapTime);
                this.lapStart = this.time;
                this.emit("lap", "LAP " + Math.min(LAPS, r.lap) + " / " + LAPS);
                if (r.lap > LAPS) {
                  this.finished = true;
                  this.emit("finish", "RACE COMPLETE");
                }
              }
            }
          }
        }
        r.s = clamp(
          road.s,
          r.gate === 1
            ? Math.min(0, road.s)
            : ((r.gate - 1) * track.length) / GATES,
          (r.gate * track.length) / GATES - 0.001,
        );
      }
      // Resolve a crossing from inside the barrier, never pull a remote body back to it.
      const previousBounds = railBounds(
        { yaw: previousYaw.get(r) },
        road,
        previous,
      );
      const previousX =
        road.x -
        (r.position.x - previous.x) * road.wallAxis.x -
        (r.position.z - previous.z) * road.wallAxis.z;
      if (
        r.wallTouched ||
        (!gap &&
          (road.x < min || road.x > max) &&
          (splitterEntry ||
            (previousX >= previousBounds.min - 0.05 &&
              previousX <= previousBounds.max + 0.05)) &&
          (road.x < min
            ? railBounds(r, road, r.position).intersectsMin
            : railBounds(r, road, r.position).intersectsMax))
      ) {
        const sign = r.wallTouched ? r.wallSide : road.x < min ? -1 : 1;
        if (road.x < min || road.x > max)
          r.position.addScaledVector(
            road.right,
            clamp(road.x, min, max) - road.x,
          );
        respondToRail(r, road, sign);
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
      if (height < -18 || r.offroad > 3 || r.shield <= 0) {
        const destroyed = r.shield <= 0;
        this.recover(r);
        r.shield = destroyed ? 65 : Math.max(10, r.shield - 24);
        if (destroyed) r.protect = 2;
        if (!ai) this.emit("hit", destroyed ? "EMERGENCY REBOOT" : "RESCUE");
        continue;
      }
      r.h = Math.max(0, r.position.y - roadHeight(road, r.position) - HOVER);
      r.vy = r.velocity.y;
      r.speed = Math.hypot(r.velocity.x, r.velocity.z);
      r.pitch =
        (r.grounded
          ? -Math.asin(road.tangent.y)
          : -Math.atan2(r.velocity.y, r.speed)) + r.pitchTrim;
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
      const target = this.racers[shot.target];
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
          this.damage(target, 28);
          shot.life = 0;
        }
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
    for (const mine of this.mines) {
      mine.life -= classDt;
      for (const r of this.racers)
        if (r.id !== mine.owner && r.position.distanceTo(mine.position) < 5) {
          this.damage(r, 24);
          mine.life = 0;
          break;
        }
    }
    this.mines = this.mines.filter((m) => m.life > 0);
  }
  get position() {
    return 1 + this.racers.filter((r) => r.s > this.player.s).length;
  }
}
