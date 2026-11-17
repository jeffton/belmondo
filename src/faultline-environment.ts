import * as THREE from "three";
import type { Track } from "./track.ts";
import type {
  CircuitTextures,
  EnvironmentSurface,
  TerrainSurface,
} from "./environment.ts";
import { mineralGroundTexture } from "./mineral-ground-texture.ts";
import {
  FAULTLINE_PIT,
  faultlineRadius,
  faultlineFloodedCut,
} from "./faultline-landform.ts";
import { buildFaultlineMachinery } from "./faultline-machinery.ts";
import { buildFaultlineProcessing } from "./faultline-processing.ts";

/** Authored working quarry: road-scale infrastructure and a pit-scale landmark. */
export function buildFaultlineEnvironment(
  scene: THREE.Object3D,
  track: Track,
  textures: CircuitTextures,
  terrain: TerrainSurface,
): EnvironmentSurface {
  const root = new THREE.Group();
  root.name = "faultline-environment";
  scene.add(root);
  const naturalMap = mineralGroundTexture(
    (_u, v, fold, basin) =>
      224 + fold * 9 + basin * 6 - (Math.sin(v * 3 + fold) > 0.85 ? 14 : 0),
  );
  const groundMat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map: naturalMap,
    flatShading: true,
  });
  const surface = new THREE.Group();
  surface.name = "terrain-surface";
  for (const geometry of terrain.geometries)
    surface.add(new THREE.Mesh(geometry, groundMat));
  root.add(surface);
  const materials = {
    pale: new THREE.MeshLambertMaterial({
      color: 0xd8cfac,
      map: textures.concrete,
      flatShading: true,
    }),
    dark: new THREE.MeshLambertMaterial({ color: 0x293c3b, flatShading: true }),
    teal: new THREE.MeshLambertMaterial({
      color: 0x258f88,
      map: textures.paint,
      flatShading: true,
    }),
    lime: new THREE.MeshLambertMaterial({ color: 0xccd777, flatShading: true }),
    grass: new THREE.MeshLambertMaterial({
      color: 0x789352,
      flatShading: true,
    }),
    glass: new THREE.MeshLambertMaterial({
      color: 0x83c7cf,
      flatShading: true,
    }),
    orange: new THREE.MeshLambertMaterial({
      color: 0xd77438,
      flatShading: true,
    }),
    water: new THREE.MeshLambertMaterial({
      color: 0x2bb6ad,
      flatShading: true,
    }),
  };
  type Finish = keyof typeof materials;
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const transform = new THREE.Object3D();
  const batches = new Map<
    string,
    { finish: Finish; matrices: THREE.Matrix4[] }
  >();
  function box(
    finish: Finish,
    p: THREE.Vector3,
    size: [number, number, number],
    yaw = 0,
  ) {
    const key = `${finish}:${Math.floor(p.x / 460)}:${Math.floor(p.z / 460)}`;
    if (!batches.has(key)) batches.set(key, { finish, matrices: [] });
    transform.position.copy(p);
    transform.scale.set(...size);
    transform.rotation.set(0, yaw, 0);
    transform.updateMatrix();
    batches.get(key)!.matrices.push(transform.matrix.clone());
  }
  function beam(
    finish: Finish,
    a: THREE.Vector3,
    b: THREE.Vector3,
    width: number,
    depth = width,
  ) {
    const delta = b.clone().sub(a);
    transform.position.copy(a).lerp(b, 0.5);
    transform.scale.set(width, delta.length(), depth);
    transform.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    transform.updateMatrix();
    const key = `${finish}:${Math.floor(a.x / 460)}:${Math.floor(a.z / 460)}`;
    if (!batches.has(key)) batches.set(key, { finish, matrices: [] });
    batches.get(key)!.matrices.push(transform.matrix.clone());
  }
  const clear = (p: THREE.Vector3, radius: number) =>
    terrain.samples.every(
      (f) => Math.hypot(p.x - f.p.x, p.z - f.p.z) > f.width + radius + 13,
    );
  const districts: { name: string; center: THREE.Vector3; u: number }[] = [];
  function district(
    u: number,
    side: number,
    name: string,
    kind: "control" | "crushing" | "depot" | "reclaim",
  ) {
    const f = track.frame(u * track.length);
    const yaw = Math.atan2(f.tangent.x, f.tangent.z);
    const right = new THREE.Vector3(f.tangent.z, 0, -f.tangent.x).normalize();
    const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize();
    const center = f.p.clone().addScaledVector(right, side * (f.width + 100));
    if (!clear(center, 55)) return;
    const heights = [-46, 0, 46].flatMap((x) =>
      [-28, 28].map((z) =>
        terrain.heightAt(
          center.x + right.x * x + forward.x * z,
          center.z + right.z * x + forward.z * z,
        ),
      ),
    );
    const top = Math.max(...heights) + 0.8;
    const low = Math.min(...heights) - 2;
    center.y = top;
    const at = (x: number, y: number, z: number) =>
      center
        .clone()
        .addScaledVector(right, x)
        .addScaledVector(forward, z)
        .add(new THREE.Vector3(0, y, 0));
    box("pale", at(0, (low - top) / 2, 0), [104, top - low, 68], yaw);
    box("dark", at(0, 0.3, 0), [101, 0.6, 65], yaw);
    if (kind === "control") {
      box("pale", at(-13, 15, 0), [48, 30, 30], yaw);
      box("glass", at(-13, 24, -15.3), [42, 7, 0.8], yaw);
      box("teal", at(-13, 31, 0), [54, 2, 34], yaw);
      box("lime", at(28, 10, 0), [18, 20, 24], yaw);
      beam("dark", at(27, 21, 0), at(27, 62, 0), 1.5);
      box("pale", at(27, 56, 0), [15, 3, 3], yaw);
    } else if (kind === "crushing") {
      for (const x of [-27, 0, 27]) {
        box("pale", at(x, 20, 0), [21, 40, 25], yaw);
        box("teal", at(x, 43, 0), [25, 6, 28], yaw);
        box("dark", at(x, 7, -17), [12, 10, 10], yaw);
      }
      box("lime", at(0, 32, -13), [75, 2, 2], yaw);
    } else if (kind === "depot") {
      for (let i = 0; i < 4; i++) {
        box(i % 2 ? "teal" : "pale", at(-33 + i * 22, 6, 4), [18, 12, 43], yaw);
        box("dark", at(-33 + i * 22, 4, -18), [13, 8, 1], yaw);
      }
      box("lime", at(0, 15, 6), [98, 2, 5], yaw);
    } else {
      // Three retained settling ponds supply the reclaimed upland groves.
      // Their bright horizontal water contrasts with the vertical copper strata.
      for (const x of [-27, 0, 27]) {
        box("teal", at(x, 2, 0), [23, 4, 35], yaw);
        box("water", at(x, 4.1, 0), [21, 0.3, 33], yaw);
        for (const side of [-1, 1]) {
          box("pale", at(x + side * 11, 4, 0), [1, 3, 35], yaw);
          box("pale", at(x, 4, side * 17), [23, 3, 1], yaw);
        }
      }
      box("orange", at(0, 3, -24), [89, 3, 5], yaw);
    }
    districts.push({ name, center, u });
  }
  district(0.075, -1, "RIDGE CONTROL", "control");
  district(0.165, -1, "HIGHLAND SEED BANK", "reclaim");
  district(0.285, 1, "WEST AGGREGATE", "crushing");
  district(0.38, -1, "TRANSFER STORES", "depot");
  district(0.77, 1, "DRAINAGE CONTROL", "control");
  district(0.87, 1, "RECLAMATION NURSERY", "reclaim");
  district(0.94, -1, "RIDGE MAINTENANCE", "depot");

  // Two recognisable copper headframes belong to the actual BORE entrances.
  // The high BENCH remains open sky, not another enclosed industrial gallery.
  for (const [index, endpoint] of track.config.tunnel!.entries()) {
    const u = endpoint + (index === 0 ? -0.001 : 0.001);
    const f = track.frame(u * track.length, -1);
    const yaw = Math.atan2(f.tangent.x, f.tangent.z);
    for (const side of [-1, 1]) {
      const p = f.p.clone().addScaledVector(f.right, side * (f.width + 9));
      box("orange", p.clone().addScaledVector(f.up, 19), [9, 48, 16], yaw);
      box("teal", p.clone().addScaledVector(f.up, 9), [12, 8, 19], yaw);
      box("lime", p.clone().addScaledVector(f.up, 31), [11, 2, 18], yaw);
    }
    box(
      "orange",
      f.p.clone().addScaledVector(f.up, 44),
      [f.width * 2 + 28, 8, 18],
      yaw,
    );
    box(
      "glass",
      f.p.clone().addScaledVector(f.up, 43),
      [f.width * 1.7, 3, 19],
      yaw,
    );
  }

  // Dark belt on slim frames climbs out of the pit, physically separate from racing.
  const beltA = new THREE.Vector3(220, FAULTLINE_PIT.floor + 110, -350);
  const beltB = new THREE.Vector3(830, 185, -480);
  // One straight industrial incline must clear every intervening quarry bench.
  // Solve its terminal height from the real collision surface, not its endpoints.
  for (let i = 1; i <= 160; i++) {
    const t = i / 160;
    const x = THREE.MathUtils.lerp(beltA.x, beltB.x, t);
    const z = THREE.MathUtils.lerp(beltA.z, beltB.z, t);
    beltB.y = Math.max(
      beltB.y,
      (terrain.heightAt(x, z) + 15 - beltA.y * (1 - t)) / t,
    );
  }
  beam("dark", beltA, beltB, 12, 5);
  const delta = beltB.clone().sub(beltA);
  for (let i = 0; i <= 12; i++) {
    const p = beltA.clone().addScaledVector(delta, i / 12);
    const foot = terrain.heightAt(p.x, p.z);
    if (p.y > foot + 5) {
      if (!clear(p, 18)) {
        // A haul belt may cross the low racing cut, but its trestle cannot.
        // Span that actual lower deck on widely spaced, terrain-grounded feet.
        const road = terrain.samples.reduce((best, f) =>
          Math.hypot(p.x - f.p.x, p.z - f.p.z) <
          Math.hypot(p.x - best.p.x, p.z - best.p.z)
            ? f
            : best,
        );
        const right = new THREE.Vector3(
          road.tangent.z,
          0,
          -road.tangent.x,
        ).normalize();
        const feet = [-1, 1].map((side) =>
          road.p.clone().addScaledVector(right, side * (road.width + 42)),
        );
        if (
          feet.every(
            (q) => clear(q, 6) && terrain.heightAt(q.x, q.z) < p.y - 8,
          ) &&
          p.y > road.p.y + 32
        ) {
          for (const q of feet)
            beam(
              "orange",
              q.clone().setY(terrain.heightAt(q.x, q.z) - 2),
              q.clone().setY(p.y - 3),
              4,
            );
          beam(
            "orange",
            feet[0].clone().setY(p.y - 3),
            feet[1].clone().setY(p.y - 3),
            4,
            6,
          );
        }
        continue;
      }
      for (const side of [-1, 1])
        beam(
          "teal",
          new THREE.Vector3(p.x, foot, p.z + side * 9),
          new THREE.Vector3(p.x, p.y - 2, p.z + side * 6),
          2,
        );
      box("pale", p.clone().add(new THREE.Vector3(0, -3, 0)), [16, 2, 18]);
    }
  }
  buildFaultlineMachinery(root, terrain.heightAt(220, -350), 220, -350);
  const machine = root.getObjectByName("faultline-excavator")!;
  machine.scale.setScalar(1.4);
  const transferFoot = terrain.heightAt(beltB.x, beltB.z);
  box(
    "teal",
    new THREE.Vector3(beltB.x, (transferFoot + beltB.y) / 2, beltB.z),
    [23, beltB.y - transferFoot, 26],
  );
  box("pale", beltB.clone().add(new THREE.Vector3(0, 5, 0)), [40, 10, 36]);
  box("lime", beltB.clone().add(new THREE.Vector3(0, 12, 0)), [42, 3, 38]);

  // Working haul lanes follow real excavation benches and disappear into
  // cuttings rather than climbing vertical faces or crossing the race deck.
  const haulVertices: number[] = [];
  for (const bench of [2.35, 5.35]) {
    const steps = 220;
    const point = (a: number, lateral: number) => {
      const r =
        0.16 + bench / 9.2 - 0.024 * Math.sin(a * 5) - 0.012 * Math.cos(a * 9);
      const x =
        FAULTLINE_PIT.x + Math.cos(a) * (FAULTLINE_PIT.radiusX * r + lateral);
      const z =
        FAULTLINE_PIT.z + Math.sin(a) * (FAULTLINE_PIT.radiusZ * r + lateral);
      return new THREE.Vector3(x, terrain.heightAt(x, z) + 0.3, z);
    };
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const b = ((i + 1) / steps) * Math.PI * 2;
      const points = [point(a, -4), point(b, -4), point(b, 4), point(a, 4)];
      if (
        Math.max(...points.map((p) => p.y)) -
          Math.min(...points.map((p) => p.y)) >
          6 ||
        points.some((p) => !clear(p, 10))
      )
        continue;
      for (const corner of [0, 1, 2, 0, 2, 3])
        haulVertices.push(...points[corner].toArray());
      if (i % 13 === 0) {
        const p = point(a, 14);
        box("pale", p.clone().add(new THREE.Vector3(0, 4, 0)), [2, 8, 2]);
        box("lime", p.clone().add(new THREE.Vector3(0, 8, 0)), [5, 1, 3], a);
      }
    }
  }
  const haulGeo = new THREE.BufferGeometry();
  haulGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(haulVertices, 3),
  );
  haulGeo.computeVertexNormals();
  const haulRoad = new THREE.Mesh(haulGeo, materials.dark);
  haulRoad.name = "faultline-quarry-haul-lanes";
  root.add(haulRoad);

  buildReclaimedHighlands(root, track, terrain);
  buildQuarryWater(root, terrain);
  const reservoir = faultlineFloodedCut(track);
  buildBenchReservoir(root, terrain, reservoir);
  const pump = reservoir.center
    .clone()
    .addScaledVector(reservoir.forward, reservoir.length * 1.04);
  const pumpYaw = Math.atan2(reservoir.forward.x, reservoir.forward.z);
  const pumpFeet = [-24, 24].flatMap((x) =>
    [-20, 20].map((z) =>
      pump
        .clone()
        .addScaledVector(reservoir.right, x)
        .addScaledVector(reservoir.forward, z),
    ),
  );
  const pumpFloor =
    Math.max(...pumpFeet.map((p) => terrain.heightAt(p.x, p.z))) + 3;
  if (clear(pump, 34)) {
    const foundationBottom =
      Math.min(...pumpFeet.map((p) => terrain.heightAt(p.x, p.z))) - 4;
    box(
      "pale",
      pump.clone().setY((pumpFloor + foundationBottom) / 2),
      [54, pumpFloor - foundationBottom, 43],
      pumpYaw,
    );
    box("dark", pump.clone().setY(pumpFloor), [54, 3, 43], pumpYaw);
    box("pale", pump.clone().setY(pumpFloor + 8), [44, 16, 34], pumpYaw);
    box("teal", pump.clone().setY(pumpFloor + 17), [52, 3, 39], pumpYaw);
    box("glass", pump.clone().setY(pumpFloor + 11), [46, 6, 35], pumpYaw);
    // Paired faceted pressure vessels distinguish the reservoir pump house
    // from the orange transfer headframes elsewhere on the circuit.
    const vessel = new THREE.CylinderGeometry(9, 9, 34, 8);
    for (const side of [-1, 1]) {
      const center = pump
        .clone()
        .addScaledVector(reservoir.right, side * 12)
        .setY(pumpFloor + 35);
      const tank = new THREE.Mesh(
        vessel,
        side < 0 ? materials.orange : materials.teal,
      );
      tank.position.copy(center);
      tank.name = "faultline-reservoir-pressure-vessel";
      root.add(tank);
      box("pale", center.clone().setY(pumpFloor + 35), [19, 3, 19], pumpYaw);
    }
    const inlet = reservoir.center
      .clone()
      .addScaledVector(reservoir.forward, reservoir.length * 0.67)
      .setY(reservoir.water - 2);
    beam("teal", inlet, pump.clone().setY(pumpFloor + 18), 6);
  }
  // The launch loading crane is one long, braced assembly parallel to the ramp.
  // Its feet clear both decks at the high/low crossing rather than piercing below.
  const launch = track.frame(track.config.ramp!.start * track.length);
  const launchRight = new THREE.Vector3(
    launch.tangent.z,
    0,
    -launch.tangent.x,
  ).normalize();
  const launchForward = new THREE.Vector3(
    launch.tangent.x,
    0,
    launch.tangent.z,
  ).normalize();
  const crane = launch.p
    .clone()
    .addScaledVector(launchRight, launch.width + 95);
  const ends = [-90, 90].map((d) =>
    crane.clone().addScaledVector(launchForward, d),
  );
  if (ends.every((p) => clear(p, 20))) {
    const roof = Math.max(
      launch.p.y + 60,
      ...ends.map((p) => terrain.heightAt(p.x, p.z) + 75),
    );
    for (const end of ends) {
      const foot = end.clone().setY(terrain.heightAt(end.x, end.z) - 2);
      beam("orange", foot, end.clone().setY(roof), 9, 12);
      box("pale", end.clone().setY(foot.y + 3), [22, 8, 24]);
    }
    beam(
      "orange",
      ends[0].clone().setY(roof),
      ends[1].clone().setY(roof),
      11,
      15,
    );
    beam(
      "teal",
      ends[0].clone().setY(roof - 9),
      ends[1].clone().setY(roof - 9),
      6,
      18,
    );
    for (let i = 0; i < 6; i++) {
      const a = ends[0]
        .clone()
        .lerp(ends[1], i / 6)
        .setY(roof);
      const b = ends[0]
        .clone()
        .lerp(ends[1], (i + 0.5) / 6)
        .setY(roof - 11);
      beam("lime", a, b, 2);
    }
    box("teal", crane.clone().setY(roof - 27), [26, 30, 20]);
    box("orange", crane.clone().setY(roof - 43), [34, 3, 28]);
  }

  // Orange transfer pylons and sky-blue settling tanks are distinct silhouettes,
  // not another sequence of identical box depots around the rim.
  for (const [u, side] of [
    [0.12, -1],
    [0.7, 1],
    [0.88, -1],
  ]) {
    const f = track.frame(u * track.length);
    const right = new THREE.Vector3(f.tangent.z, 0, -f.tangent.x).normalize();
    const p = f.p.clone().addScaledVector(right, side * (f.width + 72));
    if (!clear(p, 28)) continue;
    const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize();
    const footprint = [-22, 0, 22].flatMap((x) =>
      [-17, 0, 17].map((z) =>
        p.clone().addScaledVector(right, x).addScaledVector(forward, z),
      ),
    );
    const floor =
      Math.max(...footprint.map((q) => terrain.heightAt(q.x, q.z))) + 4;
    const yaw = Math.atan2(f.tangent.x, f.tangent.z);
    for (const x of [-18, 18]) {
      const foot = p.clone().addScaledVector(right, x);
      foot.y = terrain.heightAt(foot.x, foot.z) - 2;
      beam("orange", foot, foot.clone().setY(floor + 76), 5, 7);
    }
    box("dark", p.clone().setY(floor), [42, 3, 34], yaw);
    box("orange", p.clone().setY(floor + 76), [49, 8, 13], yaw);
    box("lime", p.clone().setY(floor + 78), [30, 3, 14], yaw);
    box("teal", p.clone().setY(floor + 17), [30, 32, 27], yaw);
    box("glass", p.clone().setY(floor + 25), [32, 8, 28], yaw);
  }

  // Low angular tussocks fill the open meadow between the authored groves.
  const grassGeo = new THREE.ConeGeometry(1, 4, 3);
  grassGeo.translate(0, 1.7, 0);
  const grasses: THREE.Matrix4[] = [];
  for (let i = 0; i < 600; i++) {
    const u = (i * 0.61803398875) % 1;
    const f = track.frame(u * track.length);
    const side = i % 2 ? -1 : 1;
    const p = f.p
      .clone()
      .addScaledVector(f.right, side * (f.width + 55 + (i % 19) * 7));
    p.y = terrain.heightAt(p.x, p.z);
    if (p.y < reservoir.water + 2 && reservoirContains(reservoir, p)) continue;
    if ((faultlineRadius(p.x, p.z) < 0.96 && p.z > -1650) || !clear(p, 4))
      continue;
    const slope =
      Math.abs(
        terrain.heightAt(p.x + 3, p.z) - terrain.heightAt(p.x - 3, p.z),
      ) +
      Math.abs(terrain.heightAt(p.x, p.z + 3) - terrain.heightAt(p.x, p.z - 3));
    if (slope > 4) continue;
    transform.position.copy(p);
    transform.rotation.set(0, i * 2.4, 0);
    transform.scale.set(2 + (i % 3), 0.6 + (i % 5) * 0.25, 2 + (i % 3));
    transform.updateMatrix();
    grasses.push(transform.matrix.clone());
  }
  if (grasses.length) {
    const mesh = new THREE.InstancedMesh(
      grassGeo,
      materials.grass,
      grasses.length,
    );
    grasses.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.name = "faultline-highland-grass";
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  for (const { finish, matrices } of batches.values()) {
    const mesh = new THREE.InstancedMesh(
      cube,
      materials[finish],
      matrices.length,
    );
    mesh.name = `faultline-${finish}-infrastructure`;
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  buildFaultlineProcessing(root, track, textures, {
    group: root,
    naturalMap,
    terrain,
    heightAt: terrain.heightAt,
    bridgeAt: terrain.bridgeAt,
    supportClearAt: terrain.supportClearAt,
  });
  root.userData.districts = districts;
  root.userData.pit = FAULTLINE_PIT;
  let drawBatches = 0,
    triangles = 0,
    instances = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const count = object instanceof THREE.InstancedMesh ? object.count : 1;
    drawBatches++;
    instances += count;
    triangles +=
      ((object.geometry.index?.count ??
        object.geometry.attributes.position.count) /
        3) *
      count;
  });
  root.userData.renderBudget = { drawBatches, triangles, instances };
  return {
    group: root,
    naturalMap,
    terrain,
    heightAt: terrain.heightAt,
    bridgeAt: terrain.bridgeAt,
    supportClearAt: terrain.supportClearAt,
  };
}

/** Cool-climate reclamation: wind-shaped birch, ridge pine and golden gorse.
 * Clusters occupy real graded shoulders and ledges rather than uniform rows.
 */
function buildReclaimedHighlands(
  root: THREE.Group,
  track: Track,
  terrain: TerrainSurface,
) {
  const geometries = {
    crown: new THREE.IcosahedronGeometry(1, 0),
    trunk: new THREE.CylinderGeometry(0.65, 1, 1, 5),
    pine: new THREE.ConeGeometry(1, 1, 5),
    rock: new THREE.DodecahedronGeometry(1, 0),
  };
  const materials = {
    leaf: new THREE.MeshLambertMaterial({ color: 0x548f40, flatShading: true }),
    light: new THREE.MeshLambertMaterial({
      color: 0x98b954,
      flatShading: true,
    }),
    pine: new THREE.MeshLambertMaterial({ color: 0x285b47, flatShading: true }),
    bark: new THREE.MeshLambertMaterial({ color: 0xc7c7a1, flatShading: true }),
    gorse: new THREE.MeshLambertMaterial({
      color: 0xbaa34c,
      flatShading: true,
    }),
    rock: new THREE.MeshLambertMaterial({ color: 0xa57759, flatShading: true }),
  };
  type Shape = keyof typeof geometries;
  type Finish = keyof typeof materials;
  const batches = new Map<
    string,
    { shape: Shape; finish: Finish; matrices: THREE.Matrix4[] }
  >();
  const transform = new THREE.Object3D();
  function part(
    shape: Shape,
    finish: Finish,
    p: THREE.Vector3,
    size: [number, number, number],
    angle: number,
  ) {
    // Plants are low-poly; coarse regional batches save far more submissions
    // than fine per-shoulder culling saves triangles.
    const key = `${shape}:${finish}:${Math.floor(p.x / 1500)}:${Math.floor(p.z / 1500)}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = { shape, finish, matrices: [] };
      batches.set(key, batch);
    }
    transform.position.copy(p);
    transform.scale.set(...size);
    transform.rotation.set(0, angle, 0);
    transform.updateMatrix();
    batch.matrices.push(transform.matrix.clone());
  }
  const clear = (p: THREE.Vector3, radius: number) =>
    terrain.samples.every(
      (f) => Math.hypot(p.x - f.p.x, p.z - f.p.z) > f.width + radius + 14,
    );
  // Each grove has its own broad envelope and a deliberate break to preserve
  // long views into the canyon. The deep working shelves remain more exposed.
  const floodedCut = faultlineFloodedCut(track);
  const groves = [
    0.045, 0.105, 0.16, 0.23, 0.315, 0.39, 0.62, 0.74, 0.81, 0.87, 0.935,
  ];
  let trees = 0,
    shrubs = 0,
    rocks = 0;
  for (let site = 0; site < groves.length; site++) {
    const population = site === 1 || site === 2 || site === 3 ? 130 : 78;
    for (let i = 0; i < population; i++) {
      const u = (groves[site] + Math.sin(i * 2.399) * 0.023 + 1) % 1;
      const branch =
        u > track.config.split[0] && u < track.config.split[1]
          ? i % 2
            ? -1
            : 1
          : 0;
      const f = track.frame(u * track.length, branch);
      const right = new THREE.Vector3(f.tangent.z, 0, -f.tangent.x).normalize();
      const side = i % 2 ? -1 : 1;
      // Most trees colonise the real, narrow graded shoulder. Broad random
      // offsets mostly land on the steep excavation face and leave the road bare.
      const distance =
        f.width +
        31 +
        (i % 3 === 0 ? (i * 37 + site * 19) % 160 : (i * 7 + site) % 21);
      const p = f.p.clone().addScaledVector(right, side * distance);
      p.y = terrain.heightAt(p.x, p.z);
      if (p.y < floodedCut.water + 2 && reservoirContains(floodedCut, p))
        continue;
      const slope =
        Math.hypot(
          terrain.heightAt(p.x + 5, p.z) - terrain.heightAt(p.x - 5, p.z),
          terrain.heightAt(p.x, p.z + 5) - terrain.heightAt(p.x, p.z - 5),
        ) / 10;
      if (!clear(p, 13) || slope > 0.82 || p.y < -80) continue;
      const angle = i * 2.399;
      const size = 0.72 + ((i * 13) % 11) * 0.065;
      if (i % 5 === 0) {
        part(
          "rock",
          "rock",
          p.clone().add(new THREE.Vector3(0, 3 * size, 0)),
          [10 * size, 6 * size, 7 * size],
          angle,
        );
        rocks++;
      } else if (i % 3 === 0 || (site === 6 && i % 2 === 0)) {
        part(
          "crown",
          "leaf",
          p.clone().add(new THREE.Vector3(0, 3.3, 0)),
          [7 * size, 4.5 * size, 6 * size],
          angle,
        );
        part(
          "crown",
          "gorse",
          p.clone().add(new THREE.Vector3(2, 6.0 * size, 1)),
          [4 * size, 2.5 * size, 4 * size],
          angle,
        );
        shrubs++;
      } else {
        const height = (site % 3 === 1 ? 32 : 23) * size;
        part(
          "trunk",
          "bark",
          p.clone().add(new THREE.Vector3(0, height * 0.37, 0)),
          [1.7 * size, height * 0.78, 1.7 * size],
          angle,
        );
        if (site % 3 === 1) {
          for (let tier = 0; tier < 3; tier++) {
            part(
              "pine",
              "pine",
              p
                .clone()
                .add(new THREE.Vector3(0, height * (0.55 + tier * 0.19), 0)),
              [(10 - tier * 2) * size, height * 0.55, (10 - tier * 2) * size],
              angle + tier,
            );
          }
        } else {
          part(
            "crown",
            "leaf",
            p.clone().add(new THREE.Vector3(2 * size, height * 0.8, 0)),
            [10 * size, 10 * size, 8 * size],
            angle,
          );
          part(
            "crown",
            "light",
            p.clone().add(new THREE.Vector3(-4 * size, height, 2 * size)),
            [7 * size, 8 * size, 6 * size],
            angle + 1,
          );
        }
        trees++;
      }
    }
  }
  for (const { shape, finish, matrices } of batches.values()) {
    const mesh = new THREE.InstancedMesh(
      geometries[shape],
      materials[finish],
      matrices.length,
    );
    mesh.name = `faultline-reclaimed-${finish}`;
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  root.userData.reclamation = { trees, shrubs, rocks, batches: batches.size };
}

function reservoirContains(
  cut: ReturnType<typeof faultlineFloodedCut>,
  p: THREE.Vector3,
) {
  const dx = p.x - cut.center.x,
    dz = p.z - cut.center.z;
  return (
    Math.abs(dx * cut.right.x + dz * cut.right.z) < cut.width * 1.05 &&
    Math.abs(dx * cut.forward.x + dz * cut.forward.z) < cut.length * 1.05
  );
}

/** Broad turquoise cut follows the BENCH; terrain.ts excavates this same footprint. */
function buildBenchReservoir(
  root: THREE.Group,
  terrain: TerrainSurface,
  cut: ReturnType<typeof faultlineFloodedCut>,
) {
  const vertices: number[] = [];
  const point = (x: number, z: number) =>
    cut.center
      .clone()
      .addScaledVector(cut.right, x)
      .addScaledVector(cut.forward, z)
      .setY(cut.water);
  const step = 12;
  const cells = new Map<
    string,
    { x: number; z: number; corners: THREE.Vector3[] }
  >();
  for (let x = -cut.width; x < cut.width; x += step) {
    for (let z = -cut.length; z < cut.length; z += step) {
      const corners = [
        point(x, z),
        point(x, z + step),
        point(x + step, z + step),
        point(x + step, z),
      ];
      if (
        corners.some(
          (p) =>
            terrain.heightAt(p.x, p.z) > cut.water - 0.5 ||
            terrain.samples.some(
              (f) => Math.hypot(p.x - f.p.x, p.z - f.p.z) < f.width + 18,
            ),
        )
      )
        continue;
      cells.set(`${x}:${z}`, { x, z, corners });
      for (const i of [0, 1, 2, 0, 2, 3])
        vertices.push(...corners[i].toArray());
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.computeVertexNormals();
  const water = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ color: 0x2ac2bd, side: THREE.DoubleSide }),
  );
  water.name = "faultline-bench-reservoir";
  root.add(water);
  const shore: number[] = [];
  for (const { x, z, corners } of cells.values()) {
    const neighbors = [
      [x - step, z],
      [x, z + step],
      [x + step, z],
      [x, z - step],
    ];
    for (let edge = 0; edge < 4; edge++) {
      if (cells.has(`${neighbors[edge][0]}:${neighbors[edge][1]}`)) continue;
      const a = corners[edge].clone().setY(cut.water + 0.65);
      const b = corners[(edge + 1) % 4].clone().setY(cut.water + 0.65);
      const footA = a.clone().setY(terrain.heightAt(a.x, a.z) - 1.5);
      const footB = b.clone().setY(terrain.heightAt(b.x, b.z) - 1.5);
      for (const p of [a, b, footB, a, footB, footA])
        shore.push(...p.toArray());
      const inset = new THREE.Vector3(b.z - a.z, 0, a.x - b.x)
        .normalize()
        .multiplyScalar(1.3);
      const c = a.clone().add(inset),
        d = b.clone().add(inset);
      for (const p of [a, c, d, a, d, b]) shore.push(...p.toArray());
    }
  }
  const retainingGeometry = new THREE.BufferGeometry();
  retainingGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(shore, 3),
  );
  retainingGeometry.computeVertexNormals();
  const retainingWall = new THREE.Mesh(
    retainingGeometry,
    new THREE.MeshLambertMaterial({
      color: 0xb7ac88,
      side: THREE.DoubleSide,
      flatShading: true,
    }),
  );
  retainingWall.name = "faultline-reservoir-retaining-bank";
  root.add(retainingWall);
  root.userData.benchReservoir = {
    center: cut.center.toArray(),
    water: cut.water,
    triangles: vertices.length / 9,
  };
}

/** Retained turquoise sump, clipped to the same triangulated land as the road. */
function buildQuarryWater(root: THREE.Group, terrain: TerrainSurface) {
  const y = -132;
  const vertices: number[] = [];
  for (let x = -470; x < 90; x += 14) {
    for (let z = -280; z < 230; z += 14) {
      const corners = [
        [x, z],
        [x, z + 14],
        [x + 14, z + 14],
        [x + 14, z],
      ];
      // The lake never crosses a bank, a working apron, or the actual road.
      if (
        corners.some(
          ([px, pz]) =>
            terrain.heightAt(px, pz) > y - 1 ||
            terrain.samples.some(
              (f) => Math.hypot(px - f.p.x, pz - f.p.z) < f.width + 24,
            ),
        )
      )
        continue;
      for (const index of [0, 1, 2, 0, 2, 3])
        vertices.push(corners[index][0], y, corners[index][1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.computeVertexNormals();
  const water = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ color: 0x239f9b, side: THREE.DoubleSide }),
  );
  water.name = "faultline-copper-sump";
  root.add(water);
}
