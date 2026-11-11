import * as THREE from "three";

export const TRACKS = [
  {
    name: "KAISEKI COAST",
    subtitle: "01 / Coastal megastructure",
    color: 0x13d9e7,
    sky: 0xb7c7d5,
    fog: 0x9cbbc7,
    sea: 0x326b80,
    points: [
      [0, 30, 0],
      [0, 32, 260],
      [-140, 65, 450],
      [-420, 75, 400],
      [-540, 40, 120],
      [-400, 25, -180],
      [-130, 62, -270],
      [170, 95, -460],
      [410, 65, -290],
      [380, 30, 60],
      [0, 30, -150],
    ],
    split: [0.28, 0.43],
    jump: 0.66,
    tunnel: [0.11, 0.19],
  },
  {
    name: "SOLAR ARRAY",
    subtitle: "02 / High desert transmission",
    color: 0xff853a,
    sky: 0xe0c0a2,
    fog: 0xd3aa8c,
    sea: 0xa77f68,
    points: [
      [0, 65, 0],
      [80, 80, 300],
      [-160, 110, 520],
      [-480, 90, 420],
      [-550, 40, 80],
      [-320, 65, -150],
      [-500, 120, -400],
      [-130, 150, -550],
      [210, 95, -370],
      [380, 65, -100],
      [0, 65, -150],
    ],
    split: [0.36, 0.51],
    jump: 0.72,
    tunnel: [0.2, 0.28],
  },
  {
    name: "NOCTILUCENT",
    subtitle: "03 / Midnight freight loop",
    color: 0xc5ff33,
    sky: 0x141d36,
    fog: 0x273752,
    sea: 0x142a40,
    points: [
      [0, 45, 0],
      [-50, 60, 300],
      [-300, 110, 410],
      [-510, 100, 150],
      [-400, 55, -150],
      [-160, 65, -200],
      [-240, 120, -470],
      [100, 135, -540],
      [360, 65, -270],
      [450, 40, 80],
      [0, 45, -150],
    ],
    split: [0.23, 0.4],
    jump: 0.64,
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
  const base = Array.from({ length: count + 1 }, (_, i) => {
    const p = curve.getPointAt(i / count);
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
          ? 16 - (16 - (branch === -1 ? 7 : 9)) * narrowing
          : 16,
      metric: a.metric + (b.metric - a.metric) * (n % 1),
    };
  }
  function gap(u) {
    return u >= config.jump && u < config.jump + 0.016;
  }
  function curvature(s, branch = 0) {
    const a = frame(s - 6, branch).tangent,
      b = frame(s + 6, branch).tangent;
    return Math.atan2(a.z * b.x - a.x * b.z, a.dot(b)) / 12;
  }
  return { config, length, frame, gap, curvature };
}
