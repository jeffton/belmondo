import * as THREE from "three";
import { placeStations } from "./coast-solar-landform.ts";
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
  const root = new THREE.Group();
  root.name = coast ? "headland-and-shipyard" : "collector-landscape";
  parent.add(root);
  const colors = coast
    ? {
        wall: 0xd9d2b9,
        base: 0x6b7873,
        roof: 0x344d50,
        glass: 0x4f858c,
        accent: 0xa14a39,
        panel: 0x223d4c,
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
    const floor = marine
      ? THREE.MathUtils.lerp(
          track.frame(0.785 * track.length).p.y - 8,
          track.frame(0.895 * track.length).p.y - 8,
          (u - 0.785) / (0.895 - 0.785),
        )
      : Math.max(...heights) + 0.5;
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
      tilt = 0,
    ) => {
      transform.position
        .copy(center)
        .addScaledVector(right, x)
        .addScaledVector(forward, z)
        .setY(floor + y);
      transform.rotation.set(tilt, yaw, 0);
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
    } else {
      // Filled retaining volume, not a plate floating above a slope.
      box(0, (bottom - floor) / 2, 0, width, floor - bottom, depth, "base");
    }
    return { box, floor, near: -side, width, depth };
  }

  if (coast) {
    // Three connected-length terraces make a hillside town, with an inhabited
    // lower gallery and receding quiet masses rather than a parade of roofs.
    for (const [i, u] of placeStations(0.477, 0.685, 0.008).entries()) {
      const s = site(`HEADLAND ${i}`, u, -1, i >= 23 ? 30 : 15, 84, 102);
      if (!s) continue;
      const { box } = s;
      box(0, 2, 0, 84, 4, s.depth, "wall");
      box(21, 6, 0, 39, 8, s.depth - 5, "roof");
      box(39, 6, 0, 1.2, 4, s.depth - 9, "glass");
      const institute = i >= 10 && i < 18;
      const court = i >= 13 && i <= 15;
      const rearHeight = court ? 4 : institute ? 16 : 26;
      box(-20, 2 + rearHeight / 2, 0, 39, rearHeight, s.depth - 16, "wall");
      box(-20, rearHeight + 3, 0, 44, 2, s.depth - 10, court ? "base" : "roof");
      if (!court)
        box(
          -1,
          institute ? 12 : 18,
          0,
          1.2,
          institute ? 4 : 6,
          s.depth - 23,
          "glass",
        );
      // Deep loggia with roof slab and real piers.
      box(20, 11, 0, 42, 2, s.depth - 5, "wall");
      for (const z of [-s.depth * 0.39, 0, s.depth * 0.39])
        box(37, 5, z, 3, 10, 3, "wall");
      if (i === 20) {
        // One transit belvedere terminates the residential sequence.
        box(-12, 40, 0, 34, 20, 24, "wall");
        box(8, 32, 0, 25, 3, 45, "accent");
        box(17, 39, 0, 4, 17, 5, "accent");
        box(17, 45, 0, 4.4, 3, 13, "glass");
      }
    }
    // A working slipway at the cliff edge leads to a grounded sea wall. The
    // race jump stays entirely open; dock ribs flank, never overlay, its deck.
    for (const [i, u] of placeStations(0.699, 0.895, 0.006).entries()) {
      const hall = (u > 0.711 && u < 0.73) || (u > 0.751 && u < 0.769);
      const marine = u >= 0.785;
      const s = site(`SHIPYARD ${i}`, u, 1, 17, hall ? 68 : 36, 78, 0, marine);
      if (!s) continue;
      const { box, near } = s;
      box(0, 1, 0, s.width, 2, 78, "roof");
      if (hall) {
        box(-near * 14, 15, 0, 33, 28, 66, "wall");
        box(-near * 14, 30, 0, 39, 3, 72, "roof");
        box(near * 4, 12, 0, 1, 20, 46, "glass");
        for (const z of [-29, 29]) {
          box(near * 25, 24, z, 4, 46, 5, "accent");
          box(near * 10, 47, z, 33, 4, 5, "accent");
        }
      } else {
        box(-near * 12, 6, 0, 6, 10, 78, "wall");
        box(-near * 12, 12, 0, 8, 2, 78, "accent");
        for (const z of [-29, 0, 29]) box(near * 11, 5, z, 5, 8, 9, "wall");
      }
    }
  } else {
    // Long paired collector terraces reappear beyond the tunnel. Each plate
    // has a bearing rack, shared retaining shelf and service spine.
    for (const [i, u] of [
      ...placeStations(0.059, 0.185, 0.007),
      ...placeStations(0.291, 0.451, 0.007),
    ].entries()) {
      const s = site(
        `COLLECTOR TERRACE ${i}`,
        u,
        1,
        26,
        118,
        90,
        u > 0.2 ? 1 : 0,
      );
      if (!s) continue;
      const { box } = s;
      box(-49, 3, 0, 12, 6, 90, "wall");
      box(-49, 7, 0, 5, 2, 90, "accent");
      for (let row = 0; row < 3; row++) {
        const x = -28 + row * 31;
        box(x, 3 + row * 3, 0, 28, 6 + row * 6, 86, "base");
        // Service courts at terrace risers keep the next retaining volume
        // from burying collector plates on the lower grade.
        for (const z of [-18, 0, 18]) {
          const y = 7 + row * 6;
          box(x, y, z, 3, 4, 13, "roof");
          box(x, y + 3, z, 27, 1.2, 15, "panel", -0.22);
          box(x, y + 3.5, z - 6, 27, 0.6, 1, "wall", -0.22);
        }
      }
    }
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
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  root.userData.sites = sites;
  root.userData.rejectedSites = rejected;
  return root;
}
