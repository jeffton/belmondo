import * as THREE from "three";
import { applyArchitectureInstanceUV } from "./architecture-uv.ts";
import {
  placeStations,
  coastYardStations,
  coastSlipwayStation,
  createCoastQuayProfile,
} from "./coast-solar-landform.ts";
import { buildSolarCollectorHillside } from "./solar-collector-hillside.ts";
import { buildCoastInstituteSlipway } from "./coast-institute-slipway.ts";
import type { Track } from "./track.ts";
import type { CircuitTextures, EnvironmentSurface } from "./environment.ts";

/** Buildings are grounded in the existing landform. Nothing here changes a race surface. */
export function buildCoastSolarPlaces(
  parent: THREE.Object3D,
  track: Track,
  textures: CircuitTextures,
  environment: EnvironmentSurface,
) {
  const coast = track.config.name === "KAISEKI COAST";
  if (!coast && track.config.name !== "SOLAR ARRAY") return;
  const quayHeight = coast ? createCoastQuayProfile(track) : null;
  const root = new THREE.Group();
  root.name = coast ? "headland-and-shipyard" : "collector-landscape";
  parent.add(root);
  const colors = coast
    ? {
        wall: 0xeee3c9,
        base: 0x667d7e,
        roof: 0x314d50,
        glass: 0x56939d,
        accent: 0x9c4636,
        panel: 0x254451,
      }
    : {
        wall: 0xd0bc9a,
        base: 0x92775e,
        roof: 0x43515a,
        glass: 0x526e77,
        accent: 0xab5334,
        panel: 0x253e51,
      };
  type Material = keyof typeof colors;
  const materials = {
    concrete: new THREE.MeshLambertMaterial({
      map: textures.concrete,
      flatShading: true,
    }),
    paint: new THREE.MeshLambertMaterial({
      map: textures.paint,
      flatShading: true,
    }),
  };
  const batches = new Map<
    string,
    {
      material: keyof typeof materials;
      matrices: THREE.Matrix4[];
      colors: THREE.Color[];
    }
  >();
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const transform = new THREE.Object3D();
  const sites: {
    name: string;
    u: number;
    center: number[];
    right: number[];
    forward: number[];
    width: number;
    depth: number;
    floor: number;
    bottom: number;
  }[] = [];
  const rejected: string[] = [];

  function site(
    name: string,
    u: number,
    side: number,
    setback: number,
    width: number,
    depth: number,
    branch = 0,
    marine = false,
    openCourt = false,
  ) {
    const f = track.frame(u * track.length, branch);
    const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const center = f.p
      .clone()
      .addScaledVector(right, side * (f.width + setback + width / 2));
    // Full oriented rectangle against every route, including the other fork.
    if (
      !environment.terrain.samples.every((r) => {
        const delta = r.p.clone().sub(center);
        const x = Math.max(0, Math.abs(delta.dot(right)) - width / 2);
        const z = Math.max(0, Math.abs(delta.dot(forward)) - depth / 2);
        return Math.hypot(x, z) > r.width + 8;
      })
    ) {
      rejected.push(name);
      return;
    }
    const heights: number[] = [];
    for (
      let x = -width / 2;
      x <= width / 2 + 0.01;
      x += width / Math.ceil(width / 8)
    )
      for (
        let z = -depth / 2;
        z <= depth / 2 + 0.01;
        z += depth / Math.ceil(depth / 8)
      ) {
        const p = center
          .clone()
          .addScaledVector(right, x)
          .addScaledVector(forward, z);
        heights.push(environment.heightAt(p.x, p.z));
      }
    // A harbour quay follows the shore-to-receiving grade, never the race
    // launch hump. Its thick adjoining segments therefore meet continuously.
    const floor = marine ? quayHeight!(u) : Math.max(...heights) + 0.5;
    const bottom = Math.min(...heights) - 2;
    sites.push({
      name,
      u,
      center: center.toArray(),
      right: right.toArray(),
      forward: forward.toArray(),
      width,
      depth,
      floor,
      bottom,
    });
    const yaw = Math.atan2(forward.x, forward.z);
    const box = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      material: Material,
    ) => {
      transform.position
        .copy(center)
        .addScaledVector(right, x)
        .addScaledVector(forward, z)
        .setY(floor + y);
      transform.rotation.set(0, yaw, 0);
      transform.scale.set(w, h, d);
      transform.updateMatrix();
      const family = material === "base" ? "concrete" : "paint";
      const key = `${family}:${Math.floor(transform.position.x / 256)}:${Math.floor(transform.position.z / 256)}`;
      if (!batches.has(key))
        batches.set(key, { material: family, matrices: [], colors: [] });
      batches.get(key)!.matrices.push(transform.matrix.clone());
      batches.get(key)!.colors.push(new THREE.Color(colors[material]));
    };
    if (marine) {
      // The two receiving moles stand on actual seabed-bearing caissons.
      for (const x of [-width * 0.32, width * 0.32])
        for (const z of [-depth * 0.35, depth * 0.35])
          box(x, (bottom - floor) / 2, z, 7, floor - bottom, 9, "base");
      box(0, -2, 0, width, 4, depth, "wall");
    } else if (!openCourt) {
      // Filled retaining volume, not a plate floating above a slope.
      box(0, (bottom - floor) / 2, 0, width, floor - bottom, depth, "base");
    }
    return { box, floor, bottom, near: -side, width, depth };
  }

  if (coast) {
    // Three connected-length terraces make a hillside town, with an inhabited
    // lower gallery and receding quiet masses rather than a parade of roofs.
    for (const [i, u] of placeStations(0.477, 0.685, 0.008).entries()) {
      const precinct = u > 0.545 && u < 0.642;
      const s = site(
        `HEADLAND ${i}`,
        u,
        -1,
        precinct ? 20 : i >= 23 ? 30 : 15,
        precinct ? 142 : 84,
        102,
        0,
        false,
        precinct,
      );
      if (!s) continue;
      const { box } = s;
      if (precinct) {
        if (u > 0.57 && u < 0.61) {
          box(
            -43,
            (s.bottom - s.floor) / 2,
            0,
            50,
            s.floor - s.bottom,
            82,
            "base",
          );
          box(-43, 18, 0, 50, 36, 82, "wall");
          box(-43, 37, 0, 56, 2, 88, "roof");
          box(-17.5, 20, 0, 1, 12, 70, "glass");
          box(-9, 9, 0, 18, 2, 86, "accent");
          for (const z of [-33, 0, 33]) box(-1, 4, z, 3, 8, 4, "wall");
        }
        if (i === 19) {
          box(
            45,
            (s.bottom - s.floor) / 2,
            0,
            52,
            s.floor - s.bottom,
            48,
            "base",
          );
          // One lift core and a sea-facing cantilevered balcony, not a roofed gate.
          box(28, 20, 0, 18, 40, 26, "wall");
          box(62, 20, 0, 4, 40, 12, "wall");
          box(45, 42, 0, 52, 4, 48, "accent");
          box(29, 50, 0, 26, 12, 32, "glass");
          box(29, 57, 0, 32, 2, 38, "roof");
          box(69, 46, 0, 2, 2, 48, "wall");
          for (const z of [-23, 23]) box(45, 46, z, 52, 2, 1, "glass");
        }
        continue;
      }
      box(0, 2, 0, 84, 4, s.depth, "wall");
      box(21, 6, 0, 39, 8, s.depth - 5, "roof");
      box(39, 6, 0, 1.2, 4, s.depth - 9, "glass");
      box(-20, 15, 0, 39, 26, s.depth - 16, "wall");
      box(-20, 29, 0, 44, 2, s.depth - 10, "roof");
      box(-1, 18, 0, 1.2, 6, s.depth - 23, "glass");
      // Deep loggia with roof slab and real piers.
      box(20, 11, 0, 42, 2, s.depth - 5, "wall");
      for (const z of [-s.depth * 0.39, 0, s.depth * 0.39])
        box(37, 5, z, 3, 10, 3, "wall");
    }
    // A working slipway at the cliff edge leads to a grounded sea wall. The
    // race jump stays entirely open; dock ribs flank, never overlay, its deck.
    const yardStations = coastYardStations();
    const slipU = coastSlipwayStation();
    for (const [i, u] of yardStations.entries()) {
      const mouth = Math.abs(u - slipU) < 0.008;
      const hall = !mouth && (u < 0.711 || (u > 0.751 && u < 0.769));
      const marine = u >= 0.785;
      const s = site(
        `SHIPYARD ${i}`,
        u,
        1,
        17,
        mouth && u !== slipU ? 26 : hall ? 68 : 36,
        78,
        0,
        marine,
      );
      if (!s) continue;
      const { box, near } = s;
      box(0, 1, 0, s.width, 2, 78, "roof");
      if (hall) {
        box(-near * 14, 15, 0, 33, 28, 66, "wall");
        box(-near * 14, 30, 0, 39, 3, 72, "roof");
        box(near * 4, 12, 0, 1, 20, 46, "glass");
      } else {
        if (u < 0.711 || u > 0.751) {
          box(-near * 12, 6, 0, 6, 10, 78, "wall");
          box(-near * 12, 12, 0, 8, 2, 78, "accent");
        }
        for (const z of [-29, 0, 29]) box(near * 11, 5, z, 5, 8, 9, "wall");
      }
    }
    const slipSite = sites.find(
      (site) => site.name.startsWith("SHIPYARD") && site.u === slipU,
    )!;
    buildCoastInstituteSlipway(root, track, textures, environment, {
      u: slipSite.u,
      height: slipSite.floor + 2,
    });
  } else {
    buildSolarCollectorHillside(root, track, textures, environment);
    // Readable connected process volumes: low exchanger plinth, tall pressure
    // house, transfer gallery and grounded transmission shoulders.
    const processStations = [
      0.177,
      0.367,
      ...placeStations(0.749, 0.928, 0.006),
    ];
    const transmissionU = processStations.reduce((a, b) =>
      Math.abs(a - 0.9) < Math.abs(b - 0.9) ? a : b,
    );
    for (const [i, u] of processStations.entries()) {
      const process = u < 0.81;
      const pressureHouse =
        u < 0.4 || (u > 0.754 && u < 0.778) || (u > 0.79 && u < 0.803);
      const s = site(
        `PROCESS ${i}`,
        u,
        -1,
        u > 0.89 && u < 0.91 ? 34 : 18,
        process ? 80 : 36,
        80,
        i === 1 ? -1 : 0,
      );
      if (!s) continue;
      const { box, near } = s;
      if (process) {
        box(0, 8, 0, 80, 16, s.depth, "wall");
        box(near * 27, 20, 0, 21, 8, s.depth - 4, "roof");
        box(near * 38, 20, 0, 1, 4, s.depth - 10, "glass");
        if (pressureHouse) {
          box(-near * 17, 33, 0, 41, 50, s.depth, "wall");
          box(-near * 17, 59, 0, 45, 3, s.depth, "roof");
          for (const z of [-s.depth * 0.32, s.depth * 0.32]) {
            box(near * 10, 36, z, 8, 40, 9, "accent");
            box(0, 55, z, 64, 4, 9, "roof");
          }
        }
      } else {
        // The same transfer spine survives the rock passage at low level, then
        // emerges beside one transmission station. It does not become a hall.
        box(0, 3, 0, 36, 6, 80, "wall");
        box(-near * 9, 8, 0, 8, 4, 80, "accent");
        box(near * 9, 7, 0, 6, 2, 80, "roof");
        if (u === transmissionU) {
          box(0, 37, 0, 12, 68, 12, "wall");
          box(0, 72, 0, 34, 5, 10, "accent");
          box(0, 69, 0, 30, 1, 8, "panel");
        }
      }
    }
  }
  for (const { material, matrices, colors } of batches.values()) {
    const mesh = new THREE.InstancedMesh(
      cube,
      materials[material],
      matrices.length,
    );
    matrices.forEach((matrix, i) => {
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, colors[i]);
    });
    applyArchitectureInstanceUV(mesh, material);
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  cube.dispose();
  root.userData.sites = sites;
  root.userData.rejectedSites = rejected;
  return root;
}
