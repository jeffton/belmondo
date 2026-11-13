import * as THREE from "three";

const CELL = 64;
const smooth = (x) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

// Road-local baked values, not screen exposure. A 3D index keeps a lower gallery
// from darkening the roof route or a deck crossing above a tunnel.
export function buildSectionalValues(track, direction) {
  const cells = new Map();
  const key = (x, y, z) => `${x}:${y}:${z}`;
  for (let s = 0; s < track.length; s += 12) {
    const u = s / track.length;
    const split = track.config.split;
    const branches = u > split[0] && u < split[1] ? [-1, 1] : [0];
    for (const branch of branches) {
      const f = track.frame(s, branch);
      const cell = key(
        Math.floor(f.p.x / CELL),
        Math.floor(f.p.y / CELL),
        Math.floor(f.p.z / CELL),
      );
      if (!cells.has(cell)) cells.set(cell, []);
      const endS = Math.min(s + 12, track.length);
      const end = track.frame(endS, branch);
      const vector = end.p.clone().sub(f.p);
      cells
        .get(cell)
        .push({ f, end, vector, lengthSq: vector.lengthSq(), s, endS, branch });
    }
  }
  // Road quads repeatedly shade vertices in the same few spatial cells. Resolve
  // the 27-cell neighbourhood once, retaining the original traversal/tie order.
  const neighborhoods = new Map();
  function neighborhood(x, y, z) {
    const cell = key(x, y, z);
    if (!neighborhoods.has(cell)) {
      const candidates = [];
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++) {
            const samples = cells.get(key(x + dx, y + dy, z + dz));
            if (samples) candidates.push(...samples);
          }
      neighborhoods.set(cell, candidates);
    }
    return neighborhoods.get(cell);
  }
  const delta = new THREE.Vector3();
  const up = new THREE.Vector3();
  const right = new THREE.Vector3();
  return function values(point) {
    const x = Math.floor(point.x / CELL);
    const y = Math.floor(point.y / CELL);
    const z = Math.floor(point.z / CELL);
    let nearest;
    let distance = Infinity;
    let fraction = 0;
    for (const sample of neighborhood(x, y, z)) {
      delta.subVectors(point, sample.f.p);
      const t = THREE.MathUtils.clamp(
        delta.dot(sample.vector) / sample.lengthSq,
        0,
        1,
      );
      const d = delta.addScaledVector(sample.vector, -t).lengthSq();
      if (d < distance) {
        distance = d;
        nearest = sample;
        fraction = t;
      }
    }
    if (!nearest) return 1;
    const { f, end, branch } = nearest;
    delta.subVectors(point, f.p).addScaledVector(nearest.vector, -fraction);
    up.lerpVectors(f.up, end.up, fraction).normalize();
    right.lerpVectors(f.right, end.right, fraction).normalize();
    const s = THREE.MathUtils.lerp(nearest.s, nearest.endS, fraction);
    const height = delta.dot(up);
    const lateral = delta.dot(right);
    const width = THREE.MathUtils.lerp(f.width, end.width, fraction);
    const roofHeight = track.config.biome === "metropolis" ? 45 : 16;
    const locality =
      (1 - smooth((Math.abs(lateral) - width - 2) / 12)) *
      smooth((height + 10) / 8) *
      (1 - smooth((height - roofHeight - 1) / 10));
    let enclosure = 0;
    let bay = 0;
    const tunnel = track.config.tunnel;
    if (tunnel && track.isTunnel(s, branch)) {
      const entry = tunnel[0] * track.length;
      const exit = tunnel[1] * track.length;
      // Sky reaches both portals; the middle retains a darker ceiling and
      // structural shoulders while the racing deck remains legible.
      enclosure = smooth((s - entry) / 60) * smooth((exit - s) / 85);
      bay = enclosure * (0.5 + 0.5 * Math.cos((s * Math.PI * 2) / 36));
    }
    if (track.config.biome === "metropolis" && branch === -1) {
      const [start, end] = track.config.split;
      const entry = (start + (end - start) * 0.23) * track.length;
      const exit = (start + (end - start) * 0.77) * track.length;
      // Match the existing 24m gallery bays and their illuminated columns.
      enclosure = smooth((s - entry) / 45) * smooth((exit - s) / 45);
      const bays = Math.ceil((exit - entry) / 24);
      bay =
        enclosure *
        (0.5 -
          0.5 * Math.cos(((s - entry) * Math.PI * 2 * bays) / (exit - entry)));
    }
    const shoulder = smooth((Math.abs(lateral) / width - 0.72) / 0.28);
    const ceiling = smooth((height - 3) / 12);
    // Subtle key-facing slope variation outside; never brighten the whole world.
    const keyFacing = Math.max(0, up.dot(direction));
    const exposed = 0.94 + keyFacing * 0.08 - shoulder * 0.06;
    const interior = 0.76 - ceiling * 0.25 - shoulder * 0.09 + bay * 0.12;
    return THREE.MathUtils.lerp(
      1,
      THREE.MathUtils.lerp(exposed, interior, enclosure),
      locality,
    );
  };
}
