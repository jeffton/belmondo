import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { groundedGeometryOffset } from "./terrain.js";
import { LOCK_WATER_LEVEL } from "./hydraulic-lock.js";

// Groves belong to particular stretches of each biome, not to a world rectangle.
// Distances and clearance are measured again against the current authored route.
export const VEGETATION_PROFILES = {
  "KAISEKI COAST": {
    ranges: [
      [0.06, 0.19],
      [0.4, 0.59],
      [0.72, 0.91],
    ],
    species: ["palm", "palm", "tree", "bush"],
    spacing: 95,
    cluster: [5, 10],
    setback: [68, 155],
    waterline: -14,
    tint: 0xb4c995,
  },
  MONSOON: {
    ranges: [
      [0.055, 0.19],
      [0.57, 0.78],
      [0.83, 0.95],
    ],
    species: ["tree", "tree", "palm", "bush", "bush"],
    spacing: 80,
    cluster: [7, 13],
    setback: [72, 165],
    waterline: LOCK_WATER_LEVEL + 1,
    tint: 0x78c28f,
  },
  "SOLAR ARRAY": {
    ranges: [
      [0.21, 0.28],
      [0.54, 0.67],
      [0.85, 0.94],
    ],
    species: ["cactus", "scrub", "scrub"],
    spacing: 160,
    cluster: [2, 4],
    setback: [75, 145],
    waterline: -14,
    tint: 0xc4bb83,
  },
  NOCTILUCENT: {
    ranges: [
      [0.06, 0.13],
      [0.57, 0.67],
      [0.87, 0.94],
      // A planted quay pocket beyond the process works, outside the freight yards.
      [0.7, 0.74],
    ],
    species: ["tree", "bush", "bush"],
    spacing: 150,
    cluster: [3, 6],
    setback: [72, 120],
    waterline: -14,
    tint: 0x8eaaa8,
  },
  WHITEOUT: { ranges: [], species: [] },
  "VESPER CIRCUIT": { ranges: [], species: [] },
  CINDERLINE: {
    ranges: [
      [0.14, 0.18],
      [0.81, 0.87],
      [0.94, 0.97],
    ],
    species: ["scrub"],
    spacing: 65,
    cluster: [3, 6],
    setback: [85, 145],
    waterline: 45,
    tint: 0xb3ad7c,
  },
};

function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Solid, flat-shaded silhouettes: no alpha cards, texture fetches or animation. */
export function vegetationGeometry(species) {
  const parts = [];
  function part(geometry, color, x, y, z, sx = 1, sy = 1, sz = 1, tilt = 0) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.scale(sx, sy, sz);
    g.rotateZ(tilt);
    g.translate(x, y, z);
    const tint = new THREE.Color(color),
      colors = [];
    for (let i = 0; i < g.attributes.position.count; i++)
      colors.push(tint.r, tint.g, tint.b);
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    // Every part uses the same attributes, including handmade fronds.
    g.deleteAttribute("uv");
    parts.push(g);
  }
  const wood = 0x89745a,
    leaf = 0x658755,
    light = 0x8da967;
  const stem = (x, y, z, height, radius, tilt = 0) =>
    part(
      new THREE.CylinderGeometry(radius * 0.65, radius, height, 5),
      wood,
      x,
      y,
      z,
      1,
      1,
      1,
      tilt,
    );
  const crown = (x, y, z, sx, sy, sz, color) =>
    part(new THREE.IcosahedronGeometry(1, 0), color, x, y, z, sx, sy, sz);
  if (species === "palm") {
    stem(0, 3, 0, 6, 0.48, -0.07);
    stem(0.5, 7.2, 0, 2.8, 0.32, -0.17);
    const vertices = [],
      colors = [];
    for (let frond = 0; frond < 7; frond++) {
      const angle = (frond * Math.PI * 2) / 7;
      const p = (r, y, w) =>
        new THREE.Vector3(
          0.75 + Math.cos(angle) * r - Math.sin(angle) * w,
          y,
          Math.sin(angle) * r + Math.cos(angle) * w,
        );
      const points = [
        p(0, 8.6, 0),
        p(2.5, 9.3, -0.8),
        p(2.8, 9.65, 0),
        p(2.5, 9.3, 0.8),
        p(6.5, 7.25, 0),
      ];
      for (const i of [0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 4, 3]) {
        vertices.push(...points[i].toArray());
        const c = new THREE.Color(frond % 2 ? light : leaf);
        colors.push(c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    parts.push(g);
  } else if (species === "tree") {
    stem(0, 3.3, 0, 6.6, 0.65, 0.05);
    stem(-1.1, 5, 0, 3, 0.28, 0.6);
    crown(-1.8, 7.5, 0, 3.5, 3.2, 3, leaf);
    crown(1.7, 8.7, 0.8, 3, 3.8, 2.8, light);
    crown(0.4, 6.7, -2, 2.9, 2.5, 2.8, 0x51754f);
  } else if (species === "bush" || species === "scrub") {
    const dry = species === "scrub";
    stem(0, 0.6, 0, 1.2, 0.22);
    crown(-0.8, 1.4, 0, 1.8, dry ? 0.9 : 1.8, 1.5, dry ? 0x827c53 : leaf);
    crown(1, 1.2, 0.7, 1.4, 1.1, 1.6, dry ? 0xa09a69 : light);
    crown(0.2, 1.6, -1, 1.3, dry ? 0.8 : 1.6, 1.3, dry ? 0x777b53 : 0x51754f);
  } else if (species === "cactus") {
    part(new THREE.CylinderGeometry(0.45, 0.6, 5.5, 6), leaf, 0, 2.75, 0);
    part(
      new THREE.CylinderGeometry(0.25, 0.35, 2.2, 5),
      light,
      -1,
      2.8,
      0,
      1,
      1,
      1,
      1.1,
    );
    part(new THREE.CylinderGeometry(0.22, 0.32, 2.8, 5), leaf, -1.9, 4.1, 0);
    part(
      new THREE.CylinderGeometry(0.23, 0.32, 1.8, 5),
      light,
      0.8,
      1.8,
      0,
      1,
      1,
      1,
      -1.1,
    );
  } else throw new Error(`Unknown vegetation: ${species}`);
  const geometry = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Existing scenery, including water/portals, retains ownership of its footprint.
 * Triangle boxes avoid treating a curved/merged district as one enormous solid.
 * Instanced scenery is tested per instance, never by a whole-batch bounding box.
 */
export function vegetationObstacles(scene) {
  scene.updateMatrixWorld(true);
  const cells = new Map(),
    size = 48;
  function insert(box) {
    for (
      let x = Math.floor(box.min.x / size);
      x <= Math.floor(box.max.x / size);
      x++
    )
      for (
        let z = Math.floor(box.min.z / size);
        z <= Math.floor(box.max.z / size);
        z++
      ) {
        const key = `${x}:${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(box);
      }
  }
  const matrix = new THREE.Matrix4(),
    vertex = new THREE.Vector3();
  function visit(object) {
    if (object.name === "terrain-surface") return;
    if (object.isMesh) {
      const g = object.geometry;
      g.computeBoundingBox();
      if (object.isInstancedMesh) {
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, matrix);
          matrix.premultiply(object.matrixWorld);
          insert(g.boundingBox.clone().applyMatrix4(matrix));
        }
      } else {
        const index = g.index,
          positions = g.attributes.position;
        for (let i = 0; i < (index ? index.count : positions.count); i += 3) {
          const box = new THREE.Box3();
          for (let j = 0; j < 3; j++)
            box.expandByPoint(
              vertex
                .fromBufferAttribute(
                  positions,
                  index ? index.getX(i + j) : i + j,
                )
                .applyMatrix4(object.matrixWorld),
            );
          insert(box);
        }
      }
    }
    object.children.forEach(visit);
  }
  visit(scene);
  return {
    intersects(box) {
      for (
        let x = Math.floor(box.min.x / size);
        x <= Math.floor(box.max.x / size);
        x++
      )
        for (
          let z = Math.floor(box.min.z / size);
          z <= Math.floor(box.max.z / size);
          z++
        )
          if (cells.get(`${x}:${z}`)?.some((b) => b.intersectsBox(box)))
            return true;
      return false;
    },
  };
}

// Whole crown + 30m protects rails, fork/hull clearance, landing approaches and
// the driver's view of upcoming corner signage, including across nearby turns.
export function vegetationRoadClear(box, samples) {
  return samples.every((f) => {
    const x = THREE.MathUtils.clamp(f.p.x, box.min.x, box.max.x);
    const z = THREE.MathUtils.clamp(f.p.z, box.min.z, box.max.z);
    return Math.hypot(f.p.x - x, f.p.z - z) > f.width + 30;
  });
}

export function buildVegetation(scene, track, environment) {
  const profile = VEGETATION_PROFILES[track.config.name];
  if (!profile)
    throw new Error(`Unknown vegetation biome: ${track.config.name}`);
  const root = new THREE.Group();
  root.name = "terrain-vegetation";
  root.userData.plants = [];
  if (!profile.ranges.length) {
    scene.add(root);
    return root;
  }
  const obstacles = vegetationObstacles(scene);
  const geometries = new Map(
    [...new Set(profile.species)].map((s) => [s, vegetationGeometry(s)]),
  );
  const batches = new Map([...geometries.keys()].map((s) => [s, []]));
  const rng = random(
    [...track.config.name].reduce((seed, c) => seed * 31 + c.charCodeAt(0), 17),
  );
  const lerp = (a, b) => a + (b - a) * rng();
  const transform = new THREE.Object3D();
  const terrain = environment.terrain;
  for (const [start, end] of profile.ranges) {
    for (
      let s = start * track.length;
      s < end * track.length;
      s += profile.spacing * lerp(0.7, 1.6)
    ) {
      if (rng() < 0.24) continue; // Open vistas between uneven groves.
      const f = track.frame(s);
      const right = new THREE.Vector3(f.tangent.z, 0, -f.tangent.x).normalize();
      const forward = new THREE.Vector3(
        f.tangent.x,
        0,
        f.tangent.z,
      ).normalize();
      const center = f.p
        .clone()
        .addScaledVector(
          right,
          (rng() < 0.5 ? -1 : 1) * (f.width + lerp(...profile.setback)),
        );
      const count = Math.floor(lerp(...profile.cluster));
      for (let i = 0; i < count; i++) {
        const species =
          profile.species[Math.floor(rng() * profile.species.length)];
        const geometry = geometries.get(species);
        const p = center
          .clone()
          .addScaledVector(right, lerp(-24, 24))
          .addScaledVector(forward, lerp(-36, 36));
        const h = terrain.heightAt(p.x, p.z);
        if (h <= profile.waterline) continue;
        if (
          track.config.name === "CINDERLINE" &&
          Math.sin(p.x * 0.013 + p.z * 0.009) > 0.8
        )
          continue;
        const heights = [
          [-2, 0],
          [2, 0],
          [0, -2],
          [0, 2],
        ].map(([x, z]) => terrain.heightAt(p.x + x, p.z + z));
        if (Math.max(...heights) - Math.min(...heights) > 2.4) continue;
        const scale = lerp(0.7, 1.45);
        transform.position.set(p.x, h - 0.18, p.z);
        transform.rotation.set(0, lerp(0, Math.PI * 2), 0);
        transform.scale.set(
          scale * lerp(0.8, 1.15),
          scale * lerp(0.85, 1.2),
          scale,
        );
        transform.updateMatrix();
        transform.position.y += groundedGeometryOffset(
          geometry,
          transform.matrix,
          terrain.heightAt,
          0.18,
        );
        transform.updateMatrix();
        const box = geometry.boundingBox.clone().applyMatrix4(transform.matrix);
        if (!vegetationRoadClear(box, terrain.samples)) continue;
        if (obstacles.intersects(box.clone().expandByScalar(3))) continue;
        // Low crowns must clear the land, not disappear into a bank. Trunk roots
        // deliberately embed 18cm; the wide canopy is not a terrain foundation.
        const vertices = geometry.attributes.position;
        const vertex = new THREE.Vector3();
        let buriedCrown = false;
        for (let j = 0; j < vertices.count; j++) {
          vertex
            .fromBufferAttribute(vertices, j)
            .applyMatrix4(transform.matrix);
          if (
            vertex.y > box.min.y + (box.max.y - box.min.y) * 0.35 &&
            terrain.heightAt(vertex.x, vertex.z) > vertex.y - 0.1
          ) {
            buriedCrown = true;
            break;
          }
        }
        if (buriedCrown) continue;
        const plant = {
          species,
          matrix: transform.matrix.clone(),
          box,
          root: transform.position.clone(),
          u: s / track.length,
        };
        root.userData.plants.push(plant);
        batches.get(species).push(plant.matrix);
      }
    }
  }
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  for (const [species, matrices] of batches) {
    const geometry = geometries.get(species);
    if (!matrices.length) {
      geometry.dispose();
      continue;
    }
    // At most one draw per species. Each specimen is under 150 triangles;
    // drawing whole groves avoids hundreds of tiny draw calls on mobile.
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    mesh.name = `vegetation-${species}`;
    matrices.forEach((matrix, i) => {
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(
        i,
        new THREE.Color(profile.tint).multiplyScalar(lerp(0.85, 1.15)),
      );
    });
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  if (!root.children.length) material.dispose();
  scene.add(root);
  return root;
}
