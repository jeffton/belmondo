import * as THREE from "three";
import { RAIL_PROFILE } from "./rail-profile.js";

// Authored plan/elevation signatures, with broad physical turns rather than
// uniformly stretched copies of one circuit. The night loop crosses itself
// at two different elevations; route continuity never follows screen proximity.
function layoutPoints(course) {
  return Array.from({ length: 72 }, (_, i) => {
    const theta = (i / 72) * Math.PI * 2;
    if (course === "coast") {
      const r =
        900 * (1 + 0.07 * Math.cos(3 * theta) + 0.04 * Math.sin(2 * theta));
      return [
        r * Math.cos(theta) * 1.12 - 1000,
        55 + 25 * (1 - Math.cos(theta)) + 15 * Math.sin(2 * theta),
        r * Math.sin(theta) * 0.88,
      ];
    }
    if (course === "solar") {
      const r =
        950 * (1 + 0.13 * Math.cos(2 * theta) - 0.06 * Math.sin(3 * theta));
      return [
        r * Math.cos(theta) * 1.092 - 1000,
        120 + 65 * Math.sin(theta - 0.4) + 30 * Math.sin(2 * theta),
        r * Math.sin(theta) * 1.029,
      ];
    }
    const phase = theta + Math.PI / 2;
    const loopScale = Math.sin(phase) < 0 ? 1.15 : 1;
    return [
      936 * Math.sin(phase) * loopScale - 936,
      105 + 62 * Math.cos(phase) + 15 * Math.sin(3 * phase),
      457.6 * Math.sin(2 * phase) * loopScale,
    ];
  });
}

export const TRACKS = [
  {
    name: "KAISEKI COAST",
    subtitle: "01 / Coastal megastructure",
    color: 0x13d9e7,
    sky: 0x1e3859,
    fog: 0x657e9a,
    sea: 0x143b57,
    width: 18,
    branchWidths: [16, 18],
    layoutId: "coast-2",
    points: layoutPoints("coast"),
    ramp: { start: 0.802, height: 14, length: 0.018 },
    gapLength: 0.018,
    sections: {
      finishStraight: [0.955, 1.045],
      runway: [0.77, 0.9],
      longJump: [0.802, 0.9],
    },
    split: [0.285, 0.445],
    jump: 0.82,
    tunnel: [0.11, 0.19],
  },
  {
    name: "SOLAR ARRAY",
    subtitle: "02 / High desert transmission",
    color: 0xff853a,
    sky: 0x825c76,
    fog: 0xb7949b,
    sea: 0x79645f,
    width: 19,
    branchWidths: [17, 19],
    layoutId: "solar-2",
    points: layoutPoints("solar"),
    ramp: { start: 0.622, height: 8, length: 0.018 },
    gapLength: 0.014,
    sections: {
      finishStraight: [0.955, 1.045],
      runway: [0.59, 0.72],
      mountainTunnel: [0.2, 0.28],
    },
    split: [0.28, 0.46],
    jump: 0.64,
    tunnel: [0.2, 0.28],
  },
  {
    name: "NOCTILUCENT",
    subtitle: "03 / Midnight freight loop",
    color: 0xff4f9b,
    sky: 0x101b35,
    fog: 0x263652,
    sea: 0x14314d,
    width: 18,
    branchWidths: [16, 18],
    layoutId: "noctilucent-2",
    points: layoutPoints("night"),
    ramp: { start: 0.462, height: 8, length: 0.018 },
    gapLength: 0.014,
    sections: {
      finishStraight: [0.955, 1.045],
      runway: [0.46, 0.555],
      upperBridge: [0.7, 0.8],
      descent: [0.84, 0.955],
    },
    split: [0.28, 0.45],
    jump: 0.48,
    tunnel: [0.33, 0.42],
  },
];
export const mod = (n, m) => ((n % m) + m) % m;
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function makeTrack(index) {
  const config = TRACKS[index];
  const curve = new THREE.CatmullRomCurve3(
    config.points.map((p) => new THREE.Vector3(...p)),
    true,
    "catmullrom",
    0.45,
  );
  const length = curve.getLength();
  const count = Math.ceil(length / 3);
  const [runwayStart, runwayEnd] = config.sections.runway;
  const approachPoint = curve.getPointAt(runwayStart);
  const landingPoint = curve.getPointAt(runwayEnd);
  const base = Array.from({ length: count + 1 }, (_, i) => {
    const u = i / count;
    const p = curve.getPointAt(u);
    // Tangent-continuous entries/runouts preserve a real, long flight straight.
    const transition = (a, b, da, db, t) =>
      a
        .clone()
        .multiplyScalar(2 * t * t * t - 3 * t * t + 1)
        .addScaledVector(da, t * t * t - 2 * t * t + t)
        .addScaledVector(b, -2 * t * t * t + 3 * t * t)
        .addScaledVector(db, t * t * t - t * t);
    const runwayDirection = landingPoint
      .clone()
      .sub(approachPoint)
      .divideScalar(runwayEnd - runwayStart);
    const runwayFade = 0.07;
    if (u >= runwayStart && u <= runwayEnd) {
      p.copy(approachPoint).lerp(
        landingPoint,
        (u - runwayStart) / (runwayEnd - runwayStart),
      );
    } else if (u >= runwayStart - runwayFade && u < runwayStart) {
      p.copy(
        transition(
          curve.getPointAt(runwayStart - runwayFade),
          approachPoint,
          curve
            .getTangentAt(runwayStart - runwayFade)
            .multiplyScalar(length * runwayFade),
          runwayDirection.clone().multiplyScalar(runwayFade),
          (u - runwayStart + runwayFade) / runwayFade,
        ),
      );
    } else if (u > runwayEnd && u <= runwayEnd + runwayFade) {
      p.copy(
        transition(
          landingPoint,
          curve.getPointAt(runwayEnd + runwayFade),
          runwayDirection.clone().multiplyScalar(runwayFade),
          curve
            .getTangentAt(runwayEnd + runwayFade)
            .multiplyScalar(length * runwayFade),
          (u - runwayEnd) / runwayFade,
        ),
      );
    }
    // A genuine home straight spans the finish line, with generous transitions.
    const homeU = u < 0.5 ? u + 1 : u;
    const [homeStart, homeEnd] = config.sections.finishStraight;
    const homeFade = config.layoutId === "solar-2" ? 0.06 : 0.055;
    const homeOutFade = config.layoutId === "noctilucent-2" ? 0.075 : 0.1;
    const homeA = curve.getPointAt(homeStart);
    const homeB = curve.getPointAt(homeEnd - 1);
    if (config.layoutId === "noctilucent-2") {
      // A compact ~28-degree gravity drop has smooth entry and a long low runout.
      const top = curve.getPointAt(0.845).y;
      if (u >= 0.845)
        p.y = THREE.MathUtils.lerp(
          top,
          65,
          THREE.MathUtils.smoothstep(u, 0.845, 0.9),
        );
      if (u < 0.06)
        p.y = THREE.MathUtils.lerp(
          65,
          p.y,
          THREE.MathUtils.smoothstep(u, 0.025, 0.06),
        );
      homeA.y = homeB.y = 65;
    }
    const homeDirection = homeB
      .clone()
      .sub(homeA)
      .divideScalar(homeEnd - homeStart);
    if (homeU >= homeStart && homeU <= homeEnd) {
      p.copy(homeA).lerp(homeB, (homeU - homeStart) / (homeEnd - homeStart));
    } else if (homeU >= homeStart - homeFade && homeU < homeStart) {
      const outer = curve.getPointAt(homeStart - homeFade);
      const direction =
        config.layoutId === "coast-2"
          ? runwayDirection.clone()
          : curve.getTangentAt(homeStart - homeFade).multiplyScalar(length);
      if (config.layoutId === "noctilucent-2") {
        outer.y = 65;
        direction.y = 0;
      }
      p.copy(
        transition(
          outer,
          homeA,
          direction.multiplyScalar(homeFade),
          homeDirection.clone().multiplyScalar(homeFade * 1.25),
          (homeU - homeStart + homeFade) / homeFade,
        ),
      );
    } else if (homeU > homeEnd && homeU <= homeEnd + homeOutFade) {
      const outer = curve.getPointAt(homeEnd + homeOutFade - 1);
      const direction = curve
        .getTangentAt(homeEnd + homeOutFade - 1)
        .multiplyScalar(length);
      p.copy(
        transition(
          homeB,
          outer,
          homeDirection
            .clone()
            .multiplyScalar(
              homeOutFade * (config.layoutId === "noctilucent-2" ? 1.25 : 1),
            ),
          direction.multiplyScalar(homeOutFade),
          (homeU - homeEnd) / homeOutFade,
        ),
      );
    }
    if (u >= config.ramp.start && u < config.jump)
      p.y +=
        ((u - config.jump + config.ramp.length) / config.ramp.length) *
        config.ramp.height;
    const tangent = curve.getTangentAt(i / count).normalize();
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    return { p, tangent, right, up };
  });
  const routes = {};
  for (const branch of [-1, 0, 1]) {
    const points = base.map((f, i) => {
      const phase = clamp(
        (i / count - config.split[0]) / (config.split[1] - config.split[0]),
        0,
        1,
      );
      const blend = Math.sin(phase * Math.PI) ** 2;
      const p = f.p
        .clone()
        .addScaledVector(f.right, branch * (branch === 1 ? 44 : 23) * blend);
      // The fork is one level deck until its two carriageways separate.
      // Raising one half earlier creates a vertical step along the open seam.
      if (branch === 1) p.y += THREE.MathUtils.smoothstep(blend, 0.6, 1) * 12;
      return p;
    });
    routes[branch] = points.map((p, i) => {
      const previous = points[mod(i - 1, count)];
      const next = points[(i + 1) % count];
      const u = i / count;
      const beforeLaunch = u < config.jump && (i + 1) / count >= config.jump;
      const afterLaunch = u >= config.jump && (i - 1) / count < config.jump;
      const tangent = (
        beforeLaunch
          ? p.clone().sub(previous)
          : afterLaunch
            ? next.clone().sub(p)
            : next.clone().sub(previous)
      ).normalize();
      const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
      return {
        p,
        tangent,
        right,
        metric:
          (beforeLaunch
            ? p.distanceTo(previous)
            : afterLaunch
              ? next.distanceTo(p)
              : next.distanceTo(previous) / 2) /
          (length / count),
      };
    });
    routes[branch][count] = routes[branch][0];
  }
  for (const frames of Object.values(routes)) {
    for (let i = 0; i < count; i++) {
      const before = frames[mod(i - 6, count)].tangent;
      const after = frames[(i + 6) % count].tangent;
      const turn = Math.atan2(
        before.z * after.x - before.x * after.z,
        before.dot(after),
      );
      frames[i].bank = clamp(
        (turn * 65) / ((12 * length) / count),
        -0.18,
        0.18,
      );
    }
  }
  for (const frames of Object.values(routes)) {
    const bank = frames.slice(0, count).map((f) => f.bank);
    for (let i = 0; i < count; i++) {
      let value = 0,
        weight = 0;
      for (let j = -12; j <= 12; j++) {
        const w = 13 - Math.abs(j);
        value += bank[mod(i + j, count)] * w;
        weight += w;
      }
      frames[i].bank = value / weight;
    }
  }
  function frame(s, branch = 0) {
    const frames = routes[branch];
    const u = mod(s, length) / length;
    const n = u * count;
    const a = frames[Math.floor(n)],
      b = frames[Math.floor(n) + 1];
    const p = a.p.clone().lerp(b.p, n % 1);
    const tangent = a.tangent
      .clone()
      .lerp(b.tangent, n % 1)
      .normalize();
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    // Composed banking lives only in selected bends, away from forks, ramps
    // and the start/finish. Both signs follow the actual local turn direction.
    const window = (start, end, fade) =>
      THREE.MathUtils.smoothstep(u, start, start + fade) *
      (1 - THREE.MathUtils.smoothstep(u, end - fade, end));
    const envelope = Math.max(
      window(0.05, 0.22, 0.035),
      config.name === "SOLAR ARRAY"
        ? window(0.78, 0.94, 0.04)
        : config.layoutId === "noctilucent-2"
          ? window(0.76, 0.82, 0.02)
          : window(0.48, 0.69, 0.04),
    );
    const bank = THREE.MathUtils.lerp(a.bank, b.bank, n % 1) * envelope;
    right.applyAxisAngle(tangent, -bank);
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    const [start, end] = config.split;
    const split = u > start && u < end;
    const phase = clamp((u - start) / (end - start), 0, 1);
    const narrowing = THREE.MathUtils.smoothstep(
      Math.sin(phase * Math.PI) ** 2,
      0,
      0.3,
    );
    // The ramp is already in the authored points and their physical tangents.
    // Do not interpolate the last pre-lip sample down into the absent gap deck.
    if (u < config.jump && (Math.floor(n) + 1) / count >= config.jump)
      p.copy(a.p).addScaledVector(
        a.tangent,
        (u - Math.floor(n) / count) * length * a.metric,
      );
    return {
      p,
      tangent,
      right,
      up,
      bank,
      u,
      width:
        split && branch !== 0
          ? config.width -
            (config.width - config.branchWidths[branch === -1 ? 0 : 1]) *
              narrowing
          : config.width,
      metric: a.metric + (b.metric - a.metric) * (n % 1),
    };
  }
  function gap(u) {
    return u >= config.jump && u < config.jump + config.gapLength;
  }
  function curvature(s, branch = 0) {
    const a = frame(s - 6, branch).tangent,
      b = frame(s + 6, branch).tangent;
    return Math.atan2(a.z * b.x - a.x * b.z, a.dot(b)) / 12;
  }
  function isTunnel(s) {
    const u = mod(s, length) / length;
    return (
      config.name !== "KAISEKI COAST" &&
      u > config.tunnel[0] &&
      u < config.tunnel[1]
    );
  }
  const physicalLengths = Object.fromEntries(
    Object.entries(routes).map(([branch, frames]) => [
      branch,
      frames
        .slice(0, count)
        .reduce((sum, f, i) => sum + f.p.distanceTo(frames[i + 1].p), 0),
    ]),
  );
  if (config.layoutId === "noctilucent-2") {
    const candidates = routes[0]
      .slice(0, count)
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => Math.hypot(f.p.x + 936, f.p.z) < 35);
    const cross = (ax, az, bx, bz) => ax * bz - az * bx;
    const intersections = [];
    for (const a of candidates)
      for (const b of candidates) {
        if (b.i - a.i < count / 4) continue;
        const ap = a.f.p,
          aq = routes[0][a.i + 1].p;
        const bp = b.f.p,
          bq = routes[0][b.i + 1].p;
        const ax = aq.x - ap.x,
          az = aq.z - ap.z,
          bx = bq.x - bp.x,
          bz = bq.z - bp.z;
        const denominator = cross(ax, az, bx, bz);
        if (denominator === 0) continue;
        const ta = cross(bp.x - ap.x, bp.z - ap.z, bx, bz) / denominator;
        const tb = cross(bp.x - ap.x, bp.z - ap.z, ax, az) / denominator;
        if (ta < 0 || ta >= 1 || tb < 0 || tb >= 1) continue;
        const ua = (a.i + ta) / count,
          ub = (b.i + tb) / count;
        const pa = frame(ua * length).p,
          pb = frame(ub * length).p;
        const upperU = pa.y > pb.y ? ua : ub,
          lowerU = pa.y > pb.y ? ub : ua;
        intersections.push({
          upperU,
          lowerU,
          clearance: Math.abs(pa.y - pb.y),
          point: [pa.x, pa.z],
          upperSpan: [upperU - 0.05, upperU + 0.05],
        });
      }
    config.sections.crossings = intersections;
    config.sections.upperBridge = intersections[0].upperSpan;
  }
  const track = {
    config,
    length,
    physicalLengths,
    physicalLength: physicalLengths[0],
    frame,
    gap,
    curvature,
    isTunnel,
  };
  track.bounds = (s, branch = 0) => roadBounds(track, s, branch);
  return track;
}

export function roadBounds(track, s, branch = 0) {
  const f = track.frame(s, branch);
  const result = {
    clipMin: -f.width,
    clipMax: f.width,
    wallMin: -f.width,
    wallMax: f.width,
    connected: false,
    seam: null,
    railMinHeight: RAIL_PROFILE.height,
    railMaxHeight: RAIL_PROFILE.height,
  };
  // Include authored endpoints despite modulo/division roundoff at exact mesh stations.
  const epsilon = Number.EPSILON * 4;
  if (
    !branch ||
    f.u < track.config.split[0] - epsilon ||
    f.u > track.config.split[1] + epsilon
  )
    return result;
  const other = track.frame(s, -branch);
  const left = branch === -1 ? f : other;
  const right = branch === 1 ? f : other;
  const leftInner = left.p.clone().addScaledVector(left.right, left.width);
  const rightInner = right.p.clone().addScaledVector(right.right, -right.width);
  const axis = track.frame(s, 0).right;
  result.connected =
    leftInner.clone().sub(rightInner).dot(axis) >= 0 &&
    Math.abs(leftInner.y - rightInner.y) <= 0.05;
  if (!result.connected) {
    const gap = Math.max(0, rightInner.clone().sub(leftInner).dot(axis));
    const innerHeight = Math.min(
      RAIL_PROFILE.height,
      gap / ((2 * RAIL_PROFILE.topOutset) / RAIL_PROFILE.height),
    );
    if (branch === -1) result.railMaxHeight = innerHeight;
    else result.railMinHeight = innerHeight;
    return result;
  }
  // One shared world-space vertex prevents cracks between nonparallel halves.
  // The seam lies in the actual overlap, including unequal branch widths.
  result.seam = leftInner.add(rightInner).multiplyScalar(0.5);
  const seamX = result.seam.clone().sub(f.p).dot(f.right);
  const offset = other.p.clone().sub(f.p).dot(f.right);
  const projectedWidth = other.width * other.right.dot(f.right);
  if (branch === -1) {
    result.clipMax = Math.min(f.width, seamX);
    result.wallMax = offset + projectedWidth;
  } else {
    result.clipMin = Math.max(-f.width, seamX);
    result.wallMin = offset - projectedWidth;
  }
  return result;
}
