import * as THREE from "three";
import { clamp, mod, roadBounds } from "./track.js";
import { projectRoad } from "./road-projection.js";
import { solveContacts, hullExtent } from "./contacts.js";

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
export const PAD_POSITIONS = [0.065, 0.21, 0.46, 0.58, 0.79, 0.91];

export class Race {
  constructor(track, craft = 0, mode = "race") {
    this.track = track;
    this.mode = mode;
    this.time = 0;
    this.countdown = 3.2;
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
      weapon: null,
      pad: -1,
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
  damage(r, amount) {
    if (r.protect > 0) return;
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
    r.boost = r.surge = 0;
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
          if (target.d < 90 && target.side < 10) this.damage(target.r, 18);
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
          velocity: forward.clone().multiplyScalar(320),
          type: weapon,
          life: 3,
        });
      }
    }
  }
  update(dt, input) {
    if (this.finished) return;
    if (this.countdown > 0) {
      this.countdown -= dt;
      return;
    }
    this.time += dt;
    const { track } = this;
    const previousPositions = new Map(
      this.racers.map((r) => [r, r.position.clone()]),
    );
    const previousProgress = new Map(this.racers.map((r) => [r, r.s]));
    const previousYaw = new Map(this.racers.map((r) => [r, r.yaw]));
    for (const r of this.racers) {
      r.wallTouched = r.contactMoved = false;
      r.contactSound = Math.max(0, r.contactSound - dt);
      const spec = CRAFT[r.craft];
      const ai = r.id !== 0;
      let controls = input;
      if (ai) {
        // A look-ahead driver, not a second movement model.
        const look = track.frame(
          r.contactS + Math.max(18, r.speed * 0.65),
          r.branch,
        );
        const desiredYaw = Math.atan2(
          look.p.x - r.position.x,
          look.p.z - r.position.z,
        );
        const error = angle(desiredYaw - r.yaw);
        const curve = Math.max(
          ...[0.25, 0.6, 1].map((t) =>
            Math.abs(track.curvature(r.contactS + r.speed * t, r.branch)),
          ),
        );
        const cornerSpeed = Math.sqrt(82 / Math.max(curve, 0.0001));
        controls = {
          throttle: true,
          steer: clamp(error * 2.5 - r.yawRate * 0.25, -1, 1),
          air: clamp(error * 0.8, -1, 1),
          brake: Math.max(
            clamp((r.speed - cornerSpeed) / 30, 0, 1),
            Math.abs(error) > 0.7 ? 1 : 0,
          ),
        };
        r.aiFire -= dt;
        if (r.aiFire <= 0) {
          this.fire(r);
          r.aiFire = 4 + ((r.id * 7) % 6);
        }
      }
      r.protect = Math.max(0, r.protect - dt);
      r.surge = Math.max(0, r.surge - dt);
      r.stun = Math.max(0, r.stun - dt);
      const left = controls.airLeft ?? Math.max(0, controls.air || 0);
      const right = controls.airRight ?? Math.max(0, -(controls.air || 0));
      const air = controls.air ?? left - right;
      const airDrag = left + right;
      r.pitchTrim +=
        ((controls.pitch || 0) * 0.24 - r.pitchTrim) *
        (1 - Math.exp(-dt / 0.16));
      const yawTarget =
        ((controls.steer || 0) * 0.9 * spec.handling + air * 0.5) *
        (r.stun ? 0.45 : 1);
      r.yawRate += (yawTarget - r.yawRate) * (1 - Math.exp(-dt / 0.2));
      r.yaw += r.yawRate * dt;
      const fx = Math.sin(r.yaw),
        fz = Math.cos(r.yaw);
      const rx = fz,
        rz = -fx;
      const lateralSpeed = r.velocity.x * rx + r.velocity.z * rz;
      const grip = r.grounded ? 110 : 4;
      const lateralForce = clamp(-lateralSpeed * 7, -grip, grip);
      // Engines supply force; aerodynamic drag determines speed, not a velocity ceiling.
      const boostTarget = r.surge > 0 ? 1 : 0;
      r.boost +=
        (boostTarget - r.boost) *
        (1 - Math.exp(-dt / (boostTarget ? 0.35 : 1.1)));
      const thrust = (controls.throttle ? spec.thrust : 0) + r.boost * 65;
      const drag =
        0.02 +
        Math.hypot(r.velocity.x, r.velocity.z) * 0.0024 +
        (controls.brake || 0) * 0.85 +
        airDrag * 0.22;
      r.velocity.x +=
        (fx * thrust + rx * lateralForce - r.velocity.x * drag) * dt;
      r.velocity.z +=
        (fz * thrust + rz * lateralForce - r.velocity.z * drag) * dt;
      if (!r.grounded) {
        // Deflect momentum, not position: pulling up trades forward speed for climb.
        // Authority tends to 20.16 m/s², below gravity, even at extreme velocity.
        const pitchRate = (r.pitchTrim * 0.7) / (1 + r.velocity.length() / 120);
        r.velocity.applyAxisAngle(new THREE.Vector3(rx, 0, rz), pitchRate * dt);
      }
      r.velocity.y -= 35 * dt;
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
      if (!previous.connected) return false;
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
      const extent = hullExtent(r, road.right);
      const min = road.wallMin + extent,
        max = road.wallMax - extent;
      const previousExtent = hullExtent(
        { yaw: previousYaw.get(r) },
        road.right,
      );
      const x = r.position.clone().sub(road.point).dot(road.right);
      const oldX = previousPositions
        .get(r)
        .clone()
        .sub(road.point)
        .dot(road.right);
      const height = r.position.y - road.point.y - HOVER;
      if (
        track.gap(mod(road.s, track.length) / track.length) ||
        height <= -3 ||
        height >= 4 ||
        (!crossesSplitter(r, road) &&
          (oldX < road.wallMin + previousExtent - 0.05 ||
            oldX > road.wallMax - previousExtent + 0.05)) ||
        (x >= min && x <= max)
      )
        return;
      const sign = x < min ? -1 : 1;
      r.position.addScaledVector(road.right, clamp(x, min, max) - x);
      const outward = r.velocity.dot(road.right) * sign;
      if (outward > 0)
        r.velocity.addScaledVector(road.right, -sign * outward * 1.25);
      r.wallTouched = true;
      r.wallSide = sign;
    };
    // Resolve static barriers before hover contact as well as between pair iterations.
    for (const r of this.racers) {
      constrainWall(r);
      r.contactMoved = r.wallTouched;
    }
    solveContacts(this.racers, constrainWall, (a, b, closing) => {
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
      const oldS = previousProgress.get(r);
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
      r.vx = r.velocity.dot(road.right);
      const gap = track.gap(u);
      const height = r.position.y - road.point.y - HOVER;
      const extent = hullExtent(r, road.right);
      const min = road.wallMin + extent,
        max = road.wallMax - extent;
      const onDeck = road.x >= min - 0.05 && road.x <= max + 0.05;
      const wasGrounded = r.grounded;
      r.grounded = !gap && onDeck && height < 1.2 && height > -3;
      if (wasGrounded && !r.grounded && onDeck) r.flight = true;
      if (r.grounded) {
        r.flight = false;
        // Contact supplies road height/vertical reaction only, never heading or XZ motion.
        const slope =
          road.tangent.y / Math.hypot(road.tangent.x, road.tangent.z);
        const along =
          r.velocity.x * road.tangent.x + r.velocity.z * road.tangent.z;
        const roadVy = slope * along;
        r.velocity.y += ((roadVy - r.velocity.y) * 18 - height * 90) * dt;
        if (height < -0.35) {
          r.position.y = road.point.y + HOVER - 0.35;
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
      if (r.grounded || (r.flight && onDeck && height > -3)) {
        const gateS = (r.gate * track.length) / GATES;
        const gateFrame = track.frame(gateS, r.branch);
        const before = previous.clone().sub(gateFrame.p).dot(gateFrame.tangent);
        const after = r.position
          .clone()
          .sub(gateFrame.p)
          .dot(gateFrame.tangent);
        if (before < 0 && after >= 0 && Math.abs(road.s - gateS) < 12) {
          r.gate++;
          if ((r.gate - 1) % GATES === 0 && (r.gate - 1) / GATES >= r.lap) {
            r.lap++;
            if (!ai) {
              const lapTime = this.time - this.lapStart;
              this.laps.push(lapTime);
              this.bestLap = Math.min(this.bestLap, lapTime);
              this.lapStart = this.time;
              this.emit("lap", "LAP " + Math.min(3, r.lap) + " / 3");
              if (r.lap > 3) {
                this.finished = true;
                this.emit("finish", "RACE COMPLETE");
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
      const previousExtent = hullExtent(
        { yaw: previousYaw.get(r) },
        road.right,
      );
      const previousX =
        road.x -
        (r.position.x - previous.x) * road.right.x -
        (r.position.z - previous.z) * road.right.z;
      if (
        r.wallTouched ||
        (!gap &&
          (road.x < min || road.x > max) &&
          (splitterEntry ||
            (previousX >= road.wallMin + previousExtent - 0.05 &&
              previousX <= road.wallMax - previousExtent + 0.05)) &&
          height > -3 &&
          height < 4)
      ) {
        const sign = r.wallTouched ? r.wallSide : road.x < min ? -1 : 1;
        if (road.x < min || road.x > max)
          r.position.addScaledVector(
            road.right,
            clamp(road.x, min, max) - road.x,
          );
        const outward = r.velocity.dot(road.right) * sign;
        if (outward > 0)
          r.velocity.addScaledVector(road.right, -sign * outward * 1.25);
        r.velocity.x *= Math.exp(-3 * dt);
        r.velocity.z *= Math.exp(-3 * dt);
        if (r.protect <= 0) r.shield -= dt * 10;
        if (r.stun === 0) {
          r.stun = 0.3;
          if (!ai) this.emit("scrape", "IMPACT");
        }
      }
      if (!r.grounded) r.offroad += dt;
      if (height < -18 || r.offroad > 3 || r.shield <= 0) {
        const destroyed = r.shield <= 0;
        this.recover(r);
        r.shield = destroyed ? 65 : Math.max(10, r.shield - 24);
        if (destroyed) r.protect = 2;
        if (!ai) this.emit("hit", destroyed ? "EMERGENCY REBOOT" : "RESCUE");
        continue;
      }
      r.h = Math.max(0, r.position.y - road.point.y - HOVER);
      r.vy = r.velocity.y;
      r.speed = Math.hypot(r.velocity.x, r.velocity.z);
      r.pitch =
        (r.grounded
          ? -Math.asin(road.tangent.y)
          : -Math.atan2(r.velocity.y, r.speed)) + r.pitchTrim;
      const crossed = PAD_POSITIONS.findIndex(
        (p) =>
          oldS < (Math.floor(r.s / track.length) + p) * track.length &&
          r.s >= (Math.floor(r.s / track.length) + p) * track.length,
      );
      if (
        r.grounded &&
        crossed >= 0 &&
        r.pad !== Math.floor(r.s / track.length) * 10 + crossed &&
        Math.abs(r.x) < 7
      ) {
        r.pad = Math.floor(r.s / track.length) * 10 + crossed;
        if (crossed % 3 === 0) {
          r.surge = 1.15;
          if (!ai) this.emit("boost", "BOOST");
        } else if (!r.weapon && this.mode !== "trial") {
          r.weapon =
            WEAPONS[
              (Math.floor(this.time * 13) + r.id + crossed) % WEAPONS.length
            ];
          if (!ai) this.emit("pickup", r.weapon);
        } else r.shield = Math.min(100, r.shield + 8);
      }
      r.shield = clamp(r.shield, 0, 100);
    }
    for (const shot of this.shots) {
      shot.life -= dt;
      if (shot.type !== "MISSILE") continue;
      const previous = shot.position.clone();
      const target = this.racers[shot.target];
      if (target) {
        const desired = target.position.clone().sub(shot.position).normalize();
        shot.velocity
          .lerp(desired.multiplyScalar(320), 1 - Math.exp(-dt * 3))
          .normalize()
          .multiplyScalar(320);
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
      mine.life -= dt;
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
