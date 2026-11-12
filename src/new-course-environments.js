import * as THREE from "three";
import { newCourseRecipe } from "./new-course-recipes.js";
import { buildHydraulicLock, LOCK_WATER_LEVEL } from "./hydraulic-lock.js";
import { terrainFootprint } from "./terrain-footprint.js";
import { groundedGeometryOffset } from "./terrain.js";
import { biomeGroundTexture } from "./biome-ground-texture.js";

/** One visible heightfield is also the collision/foundation surface. */
export function buildNewTerrainSurface(scene, track, textures, terrain) {
  const root = new THREE.Group();
  root.name = "environment";
  scene.add(root);
  const naturalMap = biomeGroundTexture(newCourseRecipe(track).biome);
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map: naturalMap,
    flatShading: true,
  });
  const ground = new THREE.Group();
  ground.name = "terrain-surface";
  terrain.geometries.forEach((geometry) =>
    ground.add(new THREE.Mesh(geometry, material)),
  );
  root.add(ground);
  return {
    heightAt: terrain.heightAt,
    naturalMap,
    group: root,
    terrain,
    bridgeAt: terrain.bridgeAt,
    supportClearAt: terrain.supportClearAt,
  };
}

/** Purpose-built settlements, opaque reservoirs and physical foundations. */
export function buildNewCourseDistricts(scene, track, textures, environment) {
  const recipe = newCourseRecipe(track);
  const root = new THREE.Group();
  root.name = `${recipe.biome}-districts`;
  scene.add(root);
  if (recipe.biome === "hydraulic")
    buildHydraulicLock(root, track, textures, environment);
  const materials = Object.fromEntries(
    [
      ["wall", recipe.wall],
      ["pale", recipe.pale],
      ["accent", recipe.accent],
      ["rock", recipe.rock],
      ["frost", recipe.pale],
      ["green", recipe.vegetation],
      ["dark", 0x203841],
      ["water", 0x34766f],
    ].map(([name, color]) => [
      name,
      new THREE.MeshLambertMaterial({
        color,
        map:
          name === "rock" || name === "frost"
            ? environment.naturalMap
            : textures.concrete,
        flatShading: true,
      }),
    ]),
  );
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
    dome: new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
    basalt: new THREE.CylinderGeometry(0.35, 0.5, 1, 6),
  };
  const batches = new Map();
  const transform = new THREE.Object3D();
  const footprints = [];
  const parts = [];
  const road = environment.terrain.samples;
  function emit(center, yaw, dims, mat, shape = "box") {
    const key = `${mat}:${shape}:${Math.floor(center.x / 256)}:${Math.floor(center.z / 256)}`;
    if (!batches.has(key)) batches.set(key, { mat, shape, matrices: [] });
    transform.position.copy(center);
    transform.rotation.set(0, yaw, 0);
    transform.scale.set(...dims);
    transform.updateMatrix();
    batches.get(key).matrices.push(transform.matrix.clone());
    parts.push({ matrix: transform.matrix.clone(), shape, material: mat });
  }
  function place(u, side, width, depth, kind, name, branch = 0) {
    const f = track.frame(u * track.length, branch);
    const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const yaw = Math.atan2(forward.x, forward.z);
    // Every complete oriented footprint clears every physical fork and bank.
    // Limited authored setbacks are placement choices, not a scatter search.
    let center;
    const lock = recipe.biome === "hydraulic" && track.config.sections.dryLock;
    const setbacks =
      kind === "pump-island"
        ? [35]
        : lock && u >= lock[0] && u <= lock[1]
          ? [130, 180]
          : [18, 36, 60, 90, 130, 180];
    for (const setback of setbacks) {
      const p = f.p
        .clone()
        .addScaledVector(right, side * (f.width + width / 2 + setback));
      if (
        road.every((r) => {
          const d = r.p.clone().sub(p);
          const x = Math.max(0, Math.abs(d.dot(right)) - width / 2);
          const z = Math.max(0, Math.abs(d.dot(forward)) - depth / 2);
          return Math.hypot(x, z) > r.width + 10;
        })
      ) {
        center = p;
        break;
      }
    }
    if (!center)
      throw new Error(`No authored footprint: ${track.config.name}/${name}`);
    const local = (x, y, z) =>
      center
        .clone()
        .addScaledVector(right, x)
        .addScaledVector(forward, z)
        .setY(y);
    const contacts = terrainFootprint(
      environment.terrain,
      center,
      right,
      forward,
      width,
      depth,
    );
    const heights = contacts.map((p) => p.y);
    const bottom = Math.min(...heights) - 1;
    const deck =
      Math.max(
        ...heights,
        kind === "pump-island" ? LOCK_WATER_LEVEL + 2 : -Infinity,
      ) + 0.6;
    const put = (mat, x, y, z, w, h, d, shape = "box") =>
      emit(local(x, y, z), yaw, [w, h, d], mat, shape);
    const geology = kind === "basalt" || kind === "iceface";
    // Architecture uses a complete foundation. Natural columns instead root
    // their actual lower silhouettes directly into the existing hillside.
    if (!geology) {
      put("rock", 0, (bottom + deck) / 2, 0, width, deck - bottom, depth);
      put("wall", 0, deck + 0.25, 0, width, 0.5, depth);
    }
    footprints.push({
      name,
      kind,
      u,
      branch,
      center: center.clone(),
      right,
      forward,
      width,
      depth,
      bottom,
      deck,
      contacts,
      foundation: !geology,
    });
    if (kind === "weather") {
      put("accent", 0, deck + 5, 12, 18, 10, 22);
      put("pale", 0, deck + 10.5, 12, 22, 1, 24);
      put("dark", 0, deck + 6, 0.8, 12, 3, 0.3);
      put("pale", 0, deck + 14, -20, 1.5, 28, 1.5);
      put("accent", 0, deck + 27, -20, 9, 1, 2);
    } else if (kind === "observatory" || kind === "survey") {
      const count = kind === "observatory" ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const x = (i - (count - 1) / 2) * 22;
        put("accent", x, deck + 5, 0, 17, 10, 22);
        put("pale", x, deck + 10.5, 0, 19, 1, 24);
        put("dark", x, deck + 6, -11.1, 12, 3, 0.3);
        put("pale", x + 7, deck + 3, -13, 3, 6, 4);
      }
      if (kind === "observatory") {
        put("pale", 0, deck + 17, 12, 18, 14, 18, "cylinder");
        put("pale", 0, deck + 24, 12, 22, 18, 22, "dome");
        put("dark", 0, deck + 29, 9, 2, 5, 15);
      } else {
        put("pale", -width / 2 + 8, deck + 14, 0, 1.5, 28, 1.5);
        put("accent", -width / 2 + 8, deck + 27, 0, 9, 1, 2);
      }
    } else if (kind === "cold-store") {
      put("pale", 0, deck + 8, 0, width - 12, 16, depth - 16);
      put("dark", 0, deck + 17, 0, width - 8, 2, depth - 12);
      for (const z of [-20, 0, 20]) {
        put("accent", -width / 2 + 5.5, deck + 6, z, 1, 12, 14);
        put("dark", -width / 2 + 4.8, deck + 4, z, 0.5, 8, 10);
      }
    } else if (kind === "pipe-yard") {
      for (const x of [-22, -7, 8, 23]) {
        put("pale", x, deck + 5, 0, 5, 5, depth - 10);
        for (const z of [-depth / 2 + 9, 0, depth / 2 - 9])
          put("wall", x, deck + 2, z, 8, 4, 4);
        put("accent", x, deck + 5, 8, 5.4, 5.4, 2);
      }
      put("wall", 0, deck + 4, -depth / 2 + 6, 62, 8, 8);
      put("pale", 0, deck + 14, depth / 2 - 10, 38, 20, 12);
      put("dark", 0, deck + 26, depth / 2 - 10, 44, 4, 18);
    } else if (kind === "reservoir") {
      // The local pool is above the nearby dry road, retained on ALL four sides.
      const water = Math.max(deck + 4, f.p.y + 18);
      const wallTop = water + 4;
      for (const x of [-1, 1])
        put(
          "wall",
          x * (width / 2 - 3),
          (deck + wallTop) / 2,
          0,
          6,
          wallTop - deck,
          depth,
        );
      for (const z of [-1, 1])
        put(
          "wall",
          0,
          (deck + wallTop) / 2,
          z * (depth / 2 - 3),
          width,
          wallTop - deck,
          6,
        );
      put("water", 0, water - 0.3, 0, width - 12, 0.6, depth - 12);
      for (const x of [-1, 1])
        put("pale", x * (width / 2 - 3), wallTop + 0.5, 0, 7, 1, depth);
      footprints.at(-1).waterLevel = water;
      footprints.at(-1).adjacentRoadY = f.p.y;
    } else if (kind === "pump-island") {
      for (const x of [-10, 10]) {
        put("pale", x, deck + 10, 0, 14, 20, 30);
        put("dark", x, deck + 15, -15.2, 9, 5, 0.4);
        put("accent", x, deck + 21, 0, 16, 2, 32);
        put("wall", x, deck + 3, -25, 6, 6, 22);
      }
      put("pale", 0, deck + 2, 27, 34, 4, 8);
    } else if (kind === "pumps") {
      for (const x of [-24, 0, 24]) {
        put("pale", x, deck + 13, 0, 18, 26, 28);
        put("dark", x, deck + 22, -14.2, 12, 5, 0.4);
        put("accent", x, deck + 28, 0, 20, 4, 30);
        put("wall", x, deck + 4, -23, 9, 8, 22);
      }
      put("wall", 0, deck + 6, 23, 70, 12, 8);
      put("pale", 0, deck + 13, 23, 74, 2, 10);
    } else if (kind === "terraces") {
      for (let i = 0; i < 4; i++) {
        put(
          "wall",
          i * 3,
          deck + i * 3 + 1,
          0,
          width - 8 - i * 12,
          6,
          depth - 8 - i * 8,
        );
        put(
          "green",
          i * 3,
          deck + i * 3 + 4.2,
          0,
          width - 10 - i * 12,
          0.5,
          depth - 10 - i * 8,
        );
      }
      put("pale", 8, deck + 19, 0, 24, 12, 16);
      put("dark", 8, deck + 26, 0, 28, 2, 20);
    } else if (kind === "basalt" || kind === "iceface") {
      // Irregular grounded columns, not floating rocks or identical red mesas.
      for (let i = 0; i < 7; i++) {
        const h = 12 + ((i * 13) % 29);
        const x = (i - 3) * 10;
        const z = Math.sin(i * 2.1) * 12;
        transform.position.copy(local(x, 0, z));
        transform.rotation.set(0, yaw, 0);
        transform.scale.set(14, h, 17);
        transform.updateMatrix();
        const y = groundedGeometryOffset(
          geometries.basalt,
          transform.matrix,
          environment.heightAt,
        );
        put(
          kind === "iceface" && i % 3 === 0 ? "frost" : "rock",
          x,
          y,
          z,
          14,
          h,
          17,
          "basalt",
        );
      }
    } else if (kind === "geothermal" || kind === "condenser") {
      // White turbine hall / condenser field; stacks are connected to the works.
      put("pale", 0, deck + 10, 0, 52, 20, 38);
      put("wall", 0, deck + 21, 0, 56, 2, 42);
      for (const x of [-18, -6, 6, 18])
        put("dark", x, deck + 11, -19.2, 7, 8, 0.4);
      for (const x of [-27, 27]) {
        put("pale", x, deck + 16, 18, 13, 32, 13, "cylinder");
        put("accent", x, deck + 30, 18, 13.5, 2, 13.5, "cylinder");
        put("wall", x, deck + 3, 0, 8, 6, depth - 6);
      }
      put("accent", 0, deck + 1.2, -depth / 2 + 6, width - 8, 0.5, 3);
      if (kind === "geothermal") {
        put("pale", -width / 2 + 8, deck + 24, 8, 8, 48, 8, "cylinder");
        put("wall", -width / 2 + 8, deck + 2, 0, 10, 4, depth - 8);
      }
    } else {
      throw new Error(`Unknown district programme: ${kind}`);
    }
  }
  for (const d of [...recipe.districts, ...recipe.approaches]) {
    const widths = {
      observatory: 84,
      survey: 66,
      weather: 28,
      reservoir: 110,
      pumps: 94,
      "pump-island": 42,
      terraces: 100,
      geothermal: 92,
      basalt: 88,
      condenser: 88,
      "cold-store": 28,
      "pipe-yard": 88,
      iceface: 88,
    };
    place(
      d.u,
      d.side,
      widths[d.kind],
      d.kind === "reservoir" ? 144 : 72,
      d.kind,
      d.name,
      d.branch ?? 0,
    );
  }
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(
      geometries[batch.shape],
      materials[batch.mat],
      batch.matrices.length,
    );
    batch.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  // Geometries/materials unused by this recipe must not escape world disposal.
  const usedShapes = new Set([...batches.values()].map((b) => b.shape));
  const usedMaterials = new Set([...batches.values()].map((b) => b.mat));
  for (const [name, geometry] of Object.entries(geometries))
    if (!usedShapes.has(name)) geometry.dispose();
  for (const [name, material] of Object.entries(materials))
    if (!usedMaterials.has(name)) material.dispose();
  root.userData.footprints = footprints;
  root.userData.parts = parts;
  root.userData.sceneryInstances = parts.length;
  return { update() {} };
}
