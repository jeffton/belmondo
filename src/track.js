import * as THREE from "three";
import { RAIL_PROFILE } from "./rail-profile.js";
import { NEW_COURSES } from "./course-layouts.js";

// The old three circuits have individually authored plan/elevation profiles.
// Long approaches expose the tightening counterturns before their apexes;
// the final runway/home-straight shaping remains shared with the other courses.
function layoutPoints(course) {
  return {
    coast: [
      [0, 90, 0],
      [0, 100, 450],
      [-180, 160, 850],
      [80, 230, 1100],
      [-60, 290, 1370],
      [-430, 260, 1500],
      [-800, 160, 1420],
      [-1000, 90, 1120],
      [-1150, 70, 760],
      [-1550, 180, 700],
      [-1750, 260, 1000],
      [-2000, 310, 1300],
      [-2400, 240, 1300],
      [-2530, 210, 1241.42],
      [-2600.71, 190, 1170.71],
      [-2622.39, 180, 1138.27],
      [-2630, 170, 1100],
      [-2622.39, 160, 1061.73],
      [-2600.71, 150, 1029.29],
      [-2530, 130, 958.58],
      [-2459.29, 115, 887.87],
      [-2388.58, 105, 817.16],
      [-2180, 100, 580],
      [-2090, 190, 250],
      [-2350, 310, -50],
      [-2540, 360, -370],
      [-2440, 300, -730],
      [-2110, 210, -900],
      [-1920, 160, -1200],
      [-1550, 115, -1450],
      [-1100, 80, -1500],
      [-650, 90, -1420],
      [-220, 90, -1150],
      [0, 90, -700],
      [0, 90, -350],
    ],
    solar: [
      [0, 130, 0],
      [0, 160, 450],
      [-280, 240, 800],
      [-650, 350, 780],
      [-800, 420, 1100],
      [-1150, 450, 1320],
      [-1530, 350, 1200],
      [-1700, 260, 850],
      [-2050, 200, 650],
      [-2450, 250, 700],
      [-2800, 350, 900],
      [-3150, 400, 800],
      [-3300, 330, 430],
      [-3060, 240, 100],
      [-2750, 160, -100],
      [-2700, 100, -420],
      [-2420, 150, -850],
      [-1950, 220, -1100],
      [-1500, 280, -1220],
      [-1000, 300, -1150],
      [-600, 220, -900],
      [-350, 140, -550],
      [0, 180, -650],
      [300, 260, -950],
      [650, 300, -800],
      [740, 230, -450],
      [450, 150, -180],
      [0, 130, -350],
    ],
    night: [
      [550, 65, 0],
      [470, 95, -400],
      [180, 180, -720],
      [-220, 280, -800],
      [-470, 340, -620],
      [-480, 310, -340],
      [-650, 230, -160],
      [-936, 90, 0],
      [-1200, 90, 350],
      [-1500, 140, 700],
      [-1900, 230, 900],
      [-2250, 320, 850],
      [-2490, 390, 550],
      [-2530, 420, 100],
      [-2320, 370, -260],
      [-2500, 280, -600],
      [-2370, 200, -950],
      [-2000, 150, -1100],
      [-1640, 180, -850],
      [-1300, 250, -450],
      [-936, 350, 0],
      [-550, 400, 450],
      [-180, 450, 780],
      [180, 430, 900],
      [550, 350, 850],
      [820, 270, 550],
      [650, 220, 150],
    ],
  }[course];
}

export const TRACK_INDEX = Object.freeze({
  WHITEOUT: 0,
  MONSOON: 1,
  COAST: 2,
  SOLAR: 3,
  CINDERLINE: 4,
  NOCTILUCENT: 5,
  VESPER: 6,
});

export const TRACKS = [
  { ...NEW_COURSES[0], subtitle: "01 / Polar observatory" },
  { ...NEW_COURSES[1], subtitle: "02 / Hydraulic city" },
  {
    name: "KAISEKI COAST",
    curveType: "centripetal",
    subtitle: "03 / Coastal megastructure",
    color: 0x13d9e7,
    sky: 0x245580,
    fog: 0x739fb2,
    sea: 0x086b83,
    width: 18,
    branchWidths: [16, 18],
    layoutId: "coast-4-finish-end",
    points: layoutPoints("coast"),
    banks: [
      [0.07, 0.27, 0.025],
      [0.46, 0.69, 0.025],
    ],
    ramp: { start: 0.811, height: 12, length: 0.009 },
    gapLength: 0.009,
    sections: {
      finishStraight: [0.955, 1.045],
      runway: [0.77, 0.9],
      longJump: [0.811, 0.9],
      cliffClimb: [0.065, 0.17],
      ravineTurns: [0.43, 0.5],
      headlandClimb: [0.53, 0.69],
    },
    split: [0.285, 0.445],
    jump: 0.82,
    tunnel: [0.11, 0.19],
  },
  {
    name: "SOLAR ARRAY",
    curveType: "centripetal",
    subtitle: "04 / High desert transmission",
    color: 0xff853a,
    sky: 0x65548d,
    fog: 0xc78d91,
    sea: 0x87535f,
    width: 19,
    branchWidths: [17, 19],
    layoutId: "solar-4-finish-end",
    points: layoutPoints("solar"),
    banks: [
      [0.08, 0.19, 0.02],
      [0.48, 0.55, 0.02],
      [0.77, 0.94, 0.025],
    ],
    ramp: { start: 0.631, height: 8, length: 0.009 },
    gapLength: 0.0075,
    sections: {
      finishStraight: [0.955, 1.045],
      runway: [0.59, 0.72],
      mountainTunnel: [0.2, 0.28],
      rockcutClimb: [0.07, 0.19],
      refinery: [0.28, 0.46],
      transmissionTurns: [0.77, 0.9],
    },
    split: [0.28, 0.46],
    jump: 0.64,
    tunnel: [0.2, 0.28],
  },
  { ...NEW_COURSES[2], subtitle: "05 / Volcanic upland" },
  {
    name: "NOCTILUCENT",
    curveType: "centripetal",
    subtitle: "06 / Midnight freight loop",
    color: 0xff4f9b,
    sky: 0x15163e,
    fog: 0x293b68,
    sea: 0x103d58,
    width: 18,
    branchWidths: [16, 18],
    layoutId: "noctilucent-4-finish-end",
    night: true,
    points: layoutPoints("night"),
    banks: [
      [0.07, 0.25, 0.025],
      [0.56, 0.83, 0.025],
    ],
    ramp: { start: 0.471, height: 8, length: 0.009 },
    gapLength: 0.008,
    sections: {
      finishStraight: [0.955, 1.045],
      runway: [0.46, 0.555],
      upperBridge: [0.7, 0.8],
      mountainTunnel: [0.34, 0.39],
      hillOverpass: [0.31, 0.425],
      descent: [0.84, 0.955],
      freightClimb: [0.065, 0.18],
      westTerraces: [0.28, 0.425],
      upperApproach: [0.57, 0.81],
    },
    split: [0.28, 0.45],
    jump: 0.48,
    tunnel: [0.34, 0.39],
  },
  { ...NEW_COURSES[3], subtitle: "07 / Vertical neon metropolis" },
];
export const mod = (n, m) => ((n % m) + m) % m;
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function makeTrack(index) {
  const config = TRACKS[index];
  const curve = new THREE.CatmullRomCurve3(
    config.points.map((p) => new THREE.Vector3(...p)),
    true,
    config.curveType,
    0.45,
  );
  const length = curve.getLength();
  const count = Math.ceil(length / 3);
  const runway = config.sections.runway;
  const runwayStart = runway?.[0];
  const runwayEnd = runway?.[1];
  const approachPoint = runway && curve.getPointAt(runwayStart);
  const landingPoint = runway && curve.getPointAt(runwayEnd);
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
    const runwayDirection =
      runway &&
      landingPoint
        .clone()
        .sub(approachPoint)
        .divideScalar(runwayEnd - runwayStart);
    const runwayFade = 0.07;
    if (runway && u >= runwayStart && u <= runwayEnd) {
      p.copy(approachPoint).lerp(
        landingPoint,
        (u - runwayStart) / (runwayEnd - runwayStart),
      );
    } else if (runway && u >= runwayStart - runwayFade && u < runwayStart) {
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
    } else if (runway && u > runwayEnd && u <= runwayEnd + runwayFade) {
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
    const homeFade = config.name === "SOLAR ARRAY" ? 0.06 : 0.055;
    const homeOutFade = config.night ? 0.075 : 0.1;
    const homeA = curve.getPointAt(homeStart);
    const homeB = curve.getPointAt(homeEnd - 1);
    if (config.night) {
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
        config.name === "KAISEKI COAST"
          ? runwayDirection.clone()
          : curve.getTangentAt(homeStart - homeFade).multiplyScalar(length);
      if (config.night) {
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
            .multiplyScalar(homeOutFade * (config.night ? 1.25 : 1)),
          direction.multiplyScalar(homeOutFade),
          (homeU - homeEnd) / homeOutFade,
        ),
      );
    }
    // Authored coastal esses and desert outcrop turns displace the real deck,
    // not the steering. Zero first/second derivatives blend into existing
    // signatures; runway and home-straight windows remain untouched.
    const tangent = curve.getTangentAt(i / count).normalize();
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    for (const bend of config.rhythm ?? []) {
      const t = (u - bend.start) / (bend.end - bend.start);
      if (t > 0 && t < 1)
        p.addScaledVector(
          right,
          bend.offset * Math.sin(Math.PI * t) ** 2 * Math.sin(2 * Math.PI * t),
        );
    }
    if (config.ramp && u >= config.ramp.start && u < config.jump)
      p.y +=
        ((u - config.jump + config.ramp.length) / config.ramp.length) *
        config.ramp.height;
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    return { p, tangent, right, up };
  });
  // Fork offsets must follow the authored deck, including the added bends.
  if (config.rhythm)
    for (let i = 0; i <= count; i++) {
      const f = base[i];
      const u = i / count;
      if (!config.rhythm.some((bend) => u > bend.start && u < bend.end))
        continue;
      f.tangent = base[(i + 1) % count].p
        .clone()
        .sub(base[mod(i - 1, count)].p)
        .normalize();
      f.right.set(f.tangent.z, 0, -f.tangent.x).normalize();
      f.up.crossVectors(f.tangent, f.right).normalize();
    }
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
      if (config.fork && branch) {
        const route = branch === -1 ? 0 : 1;
        p.copy(f.p).addScaledVector(
          f.right,
          config.fork.offsets[route] * blend,
        );
        const riseProfile = config.fork.riseProfile;
        const riseBlend = riseProfile
          ? THREE.MathUtils.smoothstep(phase, riseProfile[0], riseProfile[1]) *
            (1 -
              THREE.MathUtils.smoothstep(phase, riseProfile[2], riseProfile[3]))
          : blend;
        p.y += config.fork.rise[route] * riseBlend;
        return p;
      }
      if (config.night && branch) {
        // Identity survives the crossover: +1 is always the hill route.
        // Flat entry/exit derivatives meet the common deck without a step.
        const envelope = Math.sin(Math.PI * phase) ** 2;
        const lateral =
          branch === -1
            ? -88 * envelope * Math.cos(Math.PI * phase)
            : 92 * envelope * Math.cos(Math.PI * phase);
        p.copy(f.p).addScaledVector(f.right, lateral);
        if (branch === 1)
          p.y +=
            45 *
            THREE.MathUtils.smoothstep(phase, 0.16, 0.4) *
            (1 - THREE.MathUtils.smoothstep(phase, 0.6, 0.84));
        return p;
      }
      // The fork is one level deck until its two carriageways separate.
      // Raising one half earlier creates a vertical step along the open seam.
      if (branch === 1) p.y += THREE.MathUtils.smoothstep(blend, 0.6, 1) * 12;
      return p;
    });
    routes[branch] = points.map((p, i) => {
      const previous = points[mod(i - 1, count)];
      const next = points[(i + 1) % count];
      const u = i / count;
      const beforeLaunch =
        config.jump !== null &&
        u < config.jump &&
        (i + 1) / count >= config.jump;
      const afterLaunch =
        config.jump !== null &&
        u >= config.jump &&
        (i - 1) / count < config.jump;
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
    const envelope = config.banks
      ? Math.max(
          ...config.banks.map(([start, end, fade]) => window(start, end, fade)),
        )
      : Math.max(
          window(0.05, 0.22, 0.035),
          config.name === "SOLAR ARRAY"
            ? window(0.78, 0.94, 0.04)
            : config.night
              ? window(0.76, 0.82, 0.02)
              : window(0.48, 0.69, 0.04),
        );
    const bank = THREE.MathUtils.lerp(a.bank, b.bank, n % 1) * envelope;
    right.applyAxisAngle(tangent, -bank);
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    const [start, end] = config.split;
    const split = u > start && u < end;
    const mainWidth = config.widthSections
      ? config.widthSections.reduce((width, section) => {
          const envelope =
            THREE.MathUtils.smoothstep(u, section.start, section.fullStart) *
            (1 - THREE.MathUtils.smoothstep(u, section.fullEnd, section.end));
          return width + (section.width - config.width) * envelope;
        }, config.width)
      : config.width;
    const phase = clamp((u - start) / (end - start), 0, 1);
    const narrowing = THREE.MathUtils.smoothstep(
      Math.sin(phase * Math.PI) ** 2,
      0,
      0.3,
    );
    // The ramp is already in the authored points and their physical tangents.
    // Do not interpolate the last pre-lip sample down into the absent gap deck.
    if (
      config.jump !== null &&
      u < config.jump &&
      (Math.floor(n) + 1) / count >= config.jump
    )
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
          ? mainWidth -
            (mainWidth - config.branchWidths[branch === -1 ? 0 : 1]) * narrowing
          : mainWidth,
      metric: a.metric + (b.metric - a.metric) * (n % 1),
    };
  }
  function gap(u) {
    return (
      config.jump !== null &&
      u >= config.jump &&
      u < config.jump + config.gapLength
    );
  }
  function curvature(s, branch = 0) {
    const a = frame(s - 6, branch).tangent,
      b = frame(s + 6, branch).tangent;
    return Math.atan2(a.z * b.x - a.x * b.z, a.dot(b)) / 12;
  }
  function isTunnel(s, branch = 0) {
    const u = mod(s, length) / length;
    const enclosedBranch = config.tunnelBranches
      ? config.tunnelBranches.includes(branch)
      : config.name !== "KAISEKI COAST" && (!config.night || branch === -1);
    return (
      config.tunnel !== null &&
      enclosedBranch &&
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
  if (config.night) {
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
  // Authored stations stay fixed: scenery, forks and physical geometry do not
  // rotate when the timing origin moves to the downstream end of the straight.
  const finishS = (config.sections.finishStraight[1] - 1) * length;
  const track = {
    config,
    length,
    finishS,
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
    innerSide: -branch,
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
  const axis = track.frame(s, 0).right;
  const separation = other.p.clone().sub(f.p).dot(axis);
  // Authored forks can meet at precisely identical centres. Keep one shared
  // seam even when the branch tangents differ at that exact endpoint.
  const ownIsLeft = separation === 0 ? branch === -1 : separation >= 0;
  const left = ownIsLeft ? f : other;
  const right = ownIsLeft ? other : f;
  result.innerSide = ownIsLeft ? 1 : -1;
  const leftInner = left.p.clone().addScaledVector(left.right, left.width);
  const rightInner = right.p.clone().addScaledVector(right.right, -right.width);
  const phase =
    (f.u - track.config.split[0]) /
    (track.config.split[1] - track.config.split[0]);
  const seamRegion = !track.config.night || phase < 0.18 || phase > 0.82;
  result.connected =
    seamRegion &&
    leftInner.clone().sub(rightInner).dot(axis) >= 0 &&
    Math.abs(leftInner.y - rightInner.y) <= 0.05;
  if (!result.connected) {
    if (!seamRegion) return result;
    const gap = Math.max(0, rightInner.clone().sub(leftInner).dot(axis));
    const slope = RAIL_PROFILE.topOutset / RAIL_PROFILE.height;
    const expansion =
      left.up.dot(axis) -
      right.up.dot(axis) +
      slope * (left.right.dot(axis) + right.right.dot(axis));
    const innerHeight = Math.min(RAIL_PROFILE.height, gap / expansion);
    if (ownIsLeft) result.railMaxHeight = innerHeight;
    else result.railMinHeight = innerHeight;
    return result;
  }
  // One shared world-space vertex prevents cracks between nonparallel halves.
  // The seam lies in the actual overlap, including unequal branch widths.
  result.seam = leftInner.add(rightInner).multiplyScalar(0.5);
  const seamX = result.seam.clone().sub(f.p).dot(f.right);
  const offset = other.p.clone().sub(f.p).dot(f.right);
  const projectedWidth = other.width * other.right.dot(f.right);
  if (ownIsLeft) {
    result.clipMax = Math.min(f.width, seamX);
    result.wallMax = offset + projectedWidth;
  } else {
    result.clipMin = Math.max(-f.width, seamX);
    result.wallMin = offset - projectedWidth;
  }
  return result;
}
