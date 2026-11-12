import * as THREE from "three";
import { terrainFootprint } from "./terrain-footprint.js";
import { buildDamRaceway } from "./dam-raceway.js";

export const LOCK_WATER_LEVEL = 42;

/** A continuously curved, dry racing cutting between two retained reservoirs. */
export function buildHydraulicLock(parent, track, textures, environment) {
  const [start, end] = track.config.sections.dryLock;
  const stations = Math.ceil(((end - start - 0.02) * track.length) / 14);
  const waterLevel = LOCK_WATER_LEVEL;
  const wallTop = waterLevel + 4;
  const positions = [],
    colors = [],
    uv = [];
  const groundingContacts = [];
  const waterContacts = [];
  const triangle = (a, b, c, color) => {
    const tint = new THREE.Color(color);
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      colors.push(tint.r, tint.g, tint.b);
      uv.push((p.x + p.z * 0.3) / 24, p.y / 18);
    }
  };
  const quad = (a, b, c, d, color) => {
    triangle(a, b, c, color);
    triangle(a, c, d, color);
  };
  // One retained reservoir leaves the opposite side open to the valley;
  // the racing plunge and water remain visible instead of becoming a corridor.
  for (const side of [1]) {
    const profiles = [];
    for (let i = 0; i <= stations; i++) {
      const u = start + 0.01 + ((end - start - 0.02) * i) / stations;
      const f = track.frame(u * track.length);
      const right = new THREE.Vector3(f.tangent.z, 0, -f.tangent.x).normalize();
      const at = (offset, y) =>
        f.p
          .clone()
          .addScaledVector(right, side * offset)
          .setY(y);
      const point = (offset, y) => at(f.width + offset, y);
      const inner = point(14, 0),
        outer = point(98, 0);
      inner.y = environment.heightAt(inner.x, inner.z) - 1;
      outer.y = environment.heightAt(outer.x, outer.z) - 1;
      groundingContacts.push(inner, outer);
      const waterA = point(22, waterLevel),
        waterB = point(90, waterLevel);
      waterContacts.push(waterA, waterB);
      profiles.push([
        inner,
        point(14, wallTop),
        point(22, wallTop),
        waterA,
        waterB,
        point(90, wallTop),
        point(98, wallTop),
        outer,
      ]);
    }
    // A wall's linear bottom edge must sit below every intervening land
    // triangle, including troughs between stations. Endpoint grounding alone
    // leaves real holes below the retained water on a sloping cutting.
    for (let i = 0; i < stations; i++) {
      for (const index of [0, 7]) {
        const a = profiles[i][index],
          b = profiles[i + 1][index];
        const forward = b.clone().sub(a).setY(0).normalize();
        const right = new THREE.Vector3(forward.z, 0, -forward.x);
        const center = a.clone().lerp(b, 0.5);
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        const floor =
          Math.min(
            ...terrainFootprint(
              environment.terrain,
              center,
              right,
              forward,
              1,
              length,
            ).map((p) => p.y),
          ) - 1;
        a.y = Math.min(a.y, floor);
        b.y = Math.min(b.y, floor);
      }
    }
    for (let i = 0; i < stations; i++) {
      const a = profiles[i],
        b = profiles[i + 1];
      for (let j = 0; j < a.length - 1; j++)
        quad(
          a[j],
          b[j],
          b[j + 1],
          a[j + 1],
          j === 3 ? 0x34766f : j === 1 || j === 5 ? 0xc5d8ce : 0x687f75,
        );
    }
    // Solid transverse retaining dams close both ends; no open water curtains.
    for (const index of [0, stations]) {
      const p = profiles[index];
      const low = Math.min(p[0].y, p[7].y);
      const a = p[0].clone().setY(low),
        b = p[7].clone().setY(low);
      quad(a, b, p[6], p[1], 0x687f75);
      quad(p[1], p[6], p[5], p[2], 0xc5d8ce);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: textures.concrete,
      flatShading: true,
      side: THREE.DoubleSide,
    }),
  );
  mesh.name = "curved-dry-lock-reservoirs";
  mesh.userData = {
    groundingContacts,
    waterContacts,
    waterLevel,
    reservoirSides: [1],
    range: [start + 0.01, end - 0.01],
  };
  parent.add(mesh);
  buildDamRaceway(parent, track, textures, environment);
  return mesh;
}
