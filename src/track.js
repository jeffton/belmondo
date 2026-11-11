import * as THREE from "three";

// Smooth three-lobed circuits provide broad linked bends and genuine direction
// changes. Control-point spacing is measured against the craft's turn/grip envelope.
function circuitPoints(radius, modulation, baseHeight) {
  return Array.from({ length: 36 }, (_, i) => {
    const theta = (i / 36) * Math.PI * 2;
    const r = radius * (1 + modulation * Math.cos(3 * theta));
    return [
      r * Math.cos(theta) - radius * (1 + modulation),
      baseHeight + 12 * (1 - Math.cos(theta)) + 10 * (1 - Math.cos(2 * theta)),
      r * Math.sin(theta),
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
    points: circuitPoints(650, 0.19, 45),
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
    points: circuitPoints(740, -0.16, 65),
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
    points: circuitPoints(610, 0.22, 45),
    split: [0.28, 0.45],
    jump: 0.82,
    tunnel: [0.44, 0.53],
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
  const count = 1500;
  const runwayStart = config.jump - 0.05;
  const runwayEnd = config.jump + 0.08;
  const approachPoint = curve.getPointAt(runwayStart);
  const landingPoint = curve.getPointAt(runwayEnd);
  const base = Array.from({ length: count + 1 }, (_, i) => {
    const u = i / count;
    const p = curve.getPointAt(u);
    // An authored straight chord supports flight, with broad transitions that
    // preserve the circuit's natural large-radius bends.
    const approach = THREE.MathUtils.smoothstep(
      u,
      runwayStart - 0.07,
      runwayStart,
    );
    const departure =
      1 - THREE.MathUtils.smoothstep(u, runwayEnd, runwayEnd + 0.07);
    p.lerp(
      approachPoint
        .clone()
        .lerp(landingPoint, (u - runwayStart) / (runwayEnd - runwayStart)),
      approach * departure,
    );
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
      if (branch === 1) p.y += THREE.MathUtils.smoothstep(blend, 0.25, 1) * 12;
      return p;
    });
    routes[branch] = points.map((p, i) => {
      const previous = points[mod(i - 1, count)],
        next = points[(i + 1) % count];
      const tangent = next.clone().sub(previous).normalize();
      const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
      return {
        p,
        tangent,
        right,
        metric: next.distanceTo(previous) / ((2 * length) / count),
      };
    });
    routes[branch][count] = routes[branch][0];
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
    const right = a.right
      .clone()
      .lerp(b.right, n % 1)
      .normalize();
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    const [start, end] = config.split;
    const split = u > start && u < end;
    const phase = clamp((u - start) / (end - start), 0, 1);
    const narrowing = THREE.MathUtils.smoothstep(
      Math.sin(phase * Math.PI) ** 2,
      0,
      0.3,
    );
    // The launch ramp is part of the physical road surface.
    const ramp = clamp((u - (config.jump - 0.018)) / 0.018, 0, 1);
    if (u >= config.jump - 0.018 && u < config.jump) p.y += ramp * 8;
    return {
      p,
      tangent,
      right,
      up,
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
    return u >= config.jump && u < config.jump + 0.014;
  }
  function curvature(s, branch = 0) {
    const a = frame(s - 6, branch).tangent,
      b = frame(s + 6, branch).tangent;
    return Math.atan2(a.z * b.x - a.x * b.z, a.dot(b)) / 12;
  }
  return { config, length, frame, gap, curvature };
}
