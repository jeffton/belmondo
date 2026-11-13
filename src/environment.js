import * as THREE from "three";
import { createTerrain } from "./terrain.js";
import { buildForkEnvironments } from "./fork-environments.js";
import { buildCourseGeography } from "./course-geography.js";
import { newCourseRecipe } from "./new-course-recipes.js";
import { buildNewTerrainSurface } from "./new-course-environments.js";

const SEA_LEVEL = -16;

/** Authored land, earthworks and ground infrastructure share the visible surface. */
export function buildEnvironment(scene, track, textures, preparedTerrain) {
  if (newCourseRecipe(track))
    return buildNewTerrainSurface(
      scene,
      track,
      textures,
      createTerrain(track, preparedTerrain),
    );
  const desert = track.config.name === "SOLAR ARRAY";
  const harbor = track.config.name === "NOCTILUCENT";
  const terrain = createTerrain(track, preparedTerrain);
  const { heightAt } = terrain;
  const group = new THREE.Group();
  group.name = "environment";
  scene.add(group);
  const material = (color, map) =>
    new THREE.MeshLambertMaterial({ color, map, flatShading: true });
  const concrete = material(harbor ? 0x707f89 : 0xaaa997, textures.concrete);
  const asphalt = material(desert ? 0x756858 : 0x56656a, textures.road);
  const metal = material(harbor ? 0x44586a : 0x73868a, textures.facade);
  const paint = material(track.config.color, textures.paint);
  const vegetated = !desert && !harbor;
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const u = (x / 64) * Math.PI * 2;
      const v = (y / 64) * Math.PI * 2;
      const fold = Math.sin(u + Math.sin(v) * 0.7);
      const basin = Math.cos(v + Math.sin(u) * 0.5);
      // Authored mineral beds and wet/dry masses, not per-pixel gravel.
      const stratum = Math.sin(v * (desert ? 3 : 2) + fold);
      const value = Math.round(
        (vegetated ? 222 : 219) +
          fold * (vegetated ? 16 : 6) +
          basin * (vegetated ? 14 : 7) -
          (desert && stratum > 0.92 ? 17 : 0) -
          (!desert && basin + fold * 0.4 < -0.5 ? (vegetated ? 20 : 8) : 0),
      );
      pixels.set([value, value, value, 255], (y * 64 + x) * 4);
    }
  const groundMap = new THREE.DataTexture(pixels, 64, 64);
  groundMap.wrapS = groundMap.wrapT = THREE.RepeatWrapping;
  groundMap.magFilter = THREE.NearestFilter;
  groundMap.needsUpdate = true;
  const groundMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map: groundMap,
    flatShading: true,
  });
  const ground = new THREE.Group();
  ground.name = "terrain-surface";
  for (const geometry of terrain.geometries)
    ground.add(new THREE.Mesh(geometry, groundMaterial));
  group.add(ground);

  const batches = new Map();
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const transform = new THREE.Object3D();
  function box(mat, x, y, z, w, h, d, rotation = 0) {
    const key = `${mat.id}:${Math.floor(x / 256)}:${Math.floor(z / 256)}`;
    if (!batches.has(key)) batches.set(key, { mat, matrices: [] });
    transform.position.set(x, y, z);
    transform.scale.set(w, h, d);
    transform.rotation.set(0, rotation, 0);
    transform.updateMatrix();
    batches.get(key).matrices.push(transform.matrix.clone());
  }
  const clearOfRoad = (x, z, radius) =>
    terrain.samples.every(
      (f) => Math.hypot(x - f.p.x, z - f.p.z) > f.width + radius + 8,
    );

  // Infrastructure belongs to the actual districts, not a second floating city
  // arranged around the world origin. Small pads embed into the visible land.
  function pad(x, z, w, d) {
    const corners = [-w / 2, w / 2].flatMap((dx) =>
      [-d / 2, d / 2].map((dz) => heightAt(x + dx, z + dz)),
    );
    const low = Math.min(...corners) - 1;
    const top = Math.max(...corners, heightAt(x, z)) + 0.5;
    if (low < SEA_LEVEL + 2 || !clearOfRoad(x, z, Math.hypot(w, d) / 2))
      return null;
    box(concrete, x, (low + top) / 2, z, w, top - low, d);
    box(asphalt, x, top + 0.1, z, w - 1, 0.2, d - 1);
    return top + 0.2;
  }
  if (desert) {
    const panels = material(0x263e52, textures.facade);
    // Two differently aligned fields occupy graded shelves beside the basin.
    for (const [u, side, columns, rows] of [
      [0.17, -1, 7, 5],
      [0.72, 1, 5, 8],
    ]) {
      const f = track.frame(u * track.length);
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < columns; col++) {
          const p = f.p
            .clone()
            .addScaledVector(f.right, side * (155 + col * 27))
            .addScaledVector(f.tangent, (row - rows / 2) * 30);
          const y = pad(p.x, p.z, 22, 19);
          if (y === null) continue;
          box(metal, p.x, y + 1.1, p.z, 2, 2.2, 2);
          box(
            panels,
            p.x,
            y + 2.5,
            p.z,
            20,
            0.8,
            16,
            Math.atan2(f.tangent.x, f.tangent.z),
          );
        }
    }
  } else if (harbor) {
    // Waterfront walls follow the two real canal crossings. Their tops touch
    // reclaimed land; the water stays open beneath the short race bridges.
    for (const u of [0.135, 0.5]) {
      const f = track.frame(u * track.length);
      const yaw = Math.atan2(f.tangent.x, f.tangent.z);
      for (const bank of [-1, 1])
        for (let i = -6; i <= 6; i++) {
          const p = f.p
            .clone()
            .addScaledVector(f.tangent, bank * 64)
            .addScaledVector(f.right, i * 24);
          if (!clearOfRoad(p.x, p.z, 16)) continue;
          const y = heightAt(p.x, p.z);
          const bottom = -26;
          box(concrete, p.x, (bottom + y) / 2, p.z, 24.5, y - bottom, 6, yaw);
          box(paint, p.x, y + 0.25, p.z, 22, 0.5, 6.3, yaw);
        }
    }
  }

  for (const { mat, matrices } of batches.values()) {
    const mesh = new THREE.InstancedMesh(boxGeometry, mat, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  function buildingPosition(p) {
    const bound = terrain.extent - 60;
    const searchExtent = Math.hypot(
      Math.abs(p.x) + bound,
      Math.abs(p.z) + bound,
    );
    for (let radius = 0; radius <= searchExtent + 50; radius += 50) {
      const steps = radius === 0 ? 1 : Math.ceil((radius * Math.PI * 2) / 50);
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const x = p.x + Math.cos(angle) * radius,
          z = p.z + Math.sin(angle) * radius;
        if (Math.abs(x) > bound || Math.abs(z) > bound) continue;
        if (!clearOfRoad(x, z, 45)) continue;
        const corners = [-30, 0, 30].flatMap((dx) =>
          [-30, 0, 30].map((dz) => heightAt(x + dx, z + dz)),
        );
        if (
          Math.min(...corners) < 0 ||
          Math.max(...corners) - Math.min(...corners) > 12
        )
          continue;
        return new THREE.Vector3(x, Math.max(...corners), z);
      }
    }
    throw new Error("No land footprint available for building placement");
  }
  buildCourseGeography(
    group,
    track,
    { ...textures, rock: groundMap },
    { heightAt, supportClearAt: terrain.supportClearAt },
  );
  buildForkEnvironments(
    group,
    track,
    { ...textures, rock: groundMap },
    terrain,
  );
  return {
    heightAt,
    buildingPosition,
    group,
    terrain,
    bridgeAt: terrain.bridgeAt,
    supportClearAt: terrain.supportClearAt,
  };
}
