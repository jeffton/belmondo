import { clamp, mod } from "./track.js";

export const CRAFT = [
  {
    name: "STRIKER",
    team: "VX / 01",
    color: 0xf04d35,
    speed: 108,
    handling: 1,
    armor: 1,
    text: "Balanced / precise / forgiving",
  },
  {
    name: "RAPTOR",
    team: "LX / 27",
    color: 0x3488ff,
    speed: 119,
    handling: 0.82,
    armor: 0.85,
    text: "High velocity / wide racing lines",
  },
  {
    name: "WRAITH",
    team: "PH / 44",
    color: 0xc4f743,
    speed: 103,
    handling: 1.23,
    armor: 1.15,
    text: "Agile / strong shields / technical",
  },
];
export const WEAPONS = ["SEEKER", "PULSE", "MINE", "SHIELD", "SURGE"];
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
      stun: 0,
      weapon: null,
      pad: -1,
      lap: 1,
      aiFire: 4 + i,
    }));
    this.player = this.racers[0];
    this.player.x = 0;
  }
  emit(kind, text) {
    this.events.push({ kind, text });
  }
  damage(r, amount) {
    if (r.protect > 0) return;
    r.shield -= amount / CRAFT[r.craft].armor;
    r.speed *= 0.78;
    r.stun = 0.6;
    if (r.id === 0) this.emit("hit", "IMPACT");
    if (r.shield <= 0) {
      r.shield = 65;
      r.speed = 25;
      r.x = 0;
      r.vx = 0;
      r.protect = 2;
      if (r.id === 0) this.emit("hit", "EMERGENCY REBOOT");
    }
  }
  fire(r = this.player) {
    if (!r.weapon || this.countdown > 0 || this.finished) return;
    const weapon = r.weapon;
    r.weapon = null;
    if (r.id === 0) this.emit("fire", weapon);
    if (weapon === "SURGE") r.surge = 2.4;
    else if (weapon === "SHIELD") {
      r.protect = 5;
      r.shield = Math.min(100, r.shield + 12);
    } else if (weapon === "MINE")
      this.mines.push({
        s: r.s - 5,
        x: r.x,
        branch: r.branch,
        owner: r.id,
        life: 14,
      });
    else {
      const target = this.racers
        .filter((t) => t.id !== r.id && t.branch === r.branch)
        .map((t) => ({ r: t, d: mod(t.s - r.s, this.track.length) }))
        .filter((t) => t.d < (weapon === "PULSE" ? 90 : 220))
        .sort((a, b) => a.d - b.d)[0];
      if (weapon === "PULSE") {
        for (const t of this.racers)
          if (
            t.id !== r.id &&
            mod(t.s - r.s, this.track.length) < 90 &&
            Math.abs(t.x - r.x) < 10 &&
            t.branch === r.branch
          )
            this.damage(t, 18);
        this.shots.push({
          s: r.s,
          x: r.x,
          branch: r.branch,
          owner: r.id,
          type: weapon,
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
    for (const r of this.racers) {
      const prev = r.s;
      const oldFrame = track.frame(r.s, r.branch);
      const spec = CRAFT[r.craft];
      const ai = r.id !== 0;
      const curve = track.curvature(r.s, r.branch);
      let steer = input.steer;
      let brake = input.brake;
      let air = input.air;
      if (ai) {
        const desired = Math.sin(this.time * 0.45 + r.id * 2) * 3;
        steer = clamp(
          (desired - r.x) * 0.23 -
            r.vx * 0.13 +
            (curve * r.speed * r.speed * 0.25) / (29 * spec.handling),
          -1,
          1,
        );
        brake = Math.abs(curve) > 0.014 && r.speed > 68;
        air = 0;
        r.aiFire -= dt;
        if (r.aiFire <= 0) {
          this.fire(r);
          r.aiFire = 4 + ((r.id * 7) % 6);
        }
      }
      r.protect = Math.max(0, r.protect - dt);
      r.surge = Math.max(0, r.surge - dt);
      r.stun = Math.max(0, r.stun - dt);
      const throttle = ai || input.throttle;
      const maxSpeed =
        spec.speed * (ai ? 0.83 + r.id * 0.018 : 1) + (r.surge > 0 ? 38 : 0);
      r.speed +=
        ((throttle ? 40 : -18) -
          r.speed * 0.13 -
          (brake ? 62 : 0) -
          Math.abs(air) * 19) *
        dt;
      r.speed = clamp(r.speed, 0, maxSpeed);
      const traction = (r.h > 1 ? 0.5 : 1) * (r.stun ? 0.4 : 1);
      r.vx +=
        ((steer * 29 * spec.handling + air * 30) * traction -
          curve * r.speed * r.speed * 0.25 -
          r.vx * (2.3 + Math.abs(air) * 1.2)) *
        dt;
      r.x += r.vx * dt;
      r.s += (r.speed * dt) / oldFrame.metric;
      const f = track.frame(r.s, r.branch);
      const [splitStart, splitEnd] = track.config.split;
      if (oldFrame.u < splitStart && f.u >= splitStart) {
        r.branch = r.x < 0 ? -1 : 1;
        if (r.id === 0)
          this.emit(
            "route",
            r.branch < 0 ? "LEFT / COASTLINE" : "RIGHT / SKYLINE",
          );
      }
      if (oldFrame.u < splitEnd && f.u >= splitEnd) r.branch = 0;
      const half = f.width - 1.8;
      if (Math.abs(r.x) > half) {
        r.x = Math.sign(r.x) * half;
        r.vx *= -0.25;
        r.speed *= Math.pow(0.72, dt * 4);
        r.shield -= dt * 4;
        if (!ai && r.stun === 0) {
          this.emit("scrape", "AIRBRAKE INTO THE TURN");
          r.stun = 0.4;
        }
      }
      if (oldFrame.u < track.config.jump && f.u >= track.config.jump) {
        r.h = 8;
        r.vy = 14 + r.speed * 0.12;
        if (!ai) this.emit("jump", "FLIGHT");
      }
      if (r.h > 0 || track.gap(f.u)) {
        r.vy -= 35 * dt;
        r.h += r.vy * dt;
        if (r.h <= 0 && !track.gap(f.u)) {
          r.h = 0;
          r.vy = 0;
          if (!ai) this.emit("land", "TOUCHDOWN");
        }
        if (r.h < -10) {
          r.s =
            (Math.floor(r.s / track.length) + track.config.jump + 0.019) *
            track.length;
          r.h = 0;
          r.vy = 0;
          r.speed = 35;
          r.x = 0;
          this.damage(r, 24);
          if (!ai) this.emit("hit", "RESCUE / INSUFFICIENT VELOCITY");
        }
      }
      r.lap = Math.floor(Math.max(0, r.s) / track.length) + 1;
      const local = mod(r.s, track.length) / track.length;
      const crossed = PAD_POSITIONS.findIndex(
        (p) => oldFrame.u < p && local >= p,
      );
      if (
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
          if (!ai) this.emit("pickup", r.weapon + " / READY");
        } else r.shield = Math.min(100, r.shield + 8);
      }
      if (
        Math.floor(prev / track.length) < Math.floor(r.s / track.length) &&
        prev > 0 &&
        !ai
      ) {
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
      r.shield = clamp(r.shield, 0, 100);
    }
    for (const shot of this.shots) {
      shot.life -= dt;
      if (shot.type !== "SEEKER") continue;
      const oldShotFrame = track.frame(shot.s, shot.branch);
      shot.s += (210 * dt) / oldShotFrame.metric;
      const target = this.racers[shot.target];
      const shotFrame = track.frame(shot.s, shot.branch);
      const [splitStart, splitEnd] = track.config.split;
      if (oldShotFrame.u < splitStart && shotFrame.u >= splitStart)
        shot.branch = target?.branch || (shot.x < 0 ? -1 : 1);
      if (oldShotFrame.u < splitEnd && shotFrame.u >= splitEnd) shot.branch = 0;
      if (target) {
        shot.x += (target.x - shot.x) * dt * 4;
        if (
          mod(target.s - shot.s, track.length) < 8 &&
          target.branch === shot.branch
        ) {
          this.damage(target, 28);
          shot.life = 0;
        }
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
    for (const mine of this.mines) {
      mine.life -= dt;
      for (const r of this.racers)
        if (
          r.id !== mine.owner &&
          Math.abs(
            mod(r.s - mine.s + track.length / 2, track.length) -
              track.length / 2,
          ) < 5 &&
          Math.abs(r.x - mine.x) < 4 &&
          r.branch === mine.branch
        ) {
          this.damage(r, 24);
          mine.life = 0;
          break;
        }
    }
    this.mines = this.mines.filter((m) => m.life > 0);
    for (const r of this.racers.slice(1))
      if (
        Math.abs(r.s - this.player.s) < 4 &&
        r.branch === this.player.branch &&
        Math.abs(r.x - this.player.x) < 3
      ) {
        const sign = this.player.x >= r.x ? 1 : -1;
        this.player.vx += sign * dt * 35;
        r.vx -= sign * dt * 35;
      }
  }
  get position() {
    return 1 + this.racers.filter((r) => r.s > this.player.s).length;
  }
}
