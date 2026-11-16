import * as THREE from "three";
import type { Track } from "./track.ts";
import type {
  CircuitTextures,
  EnvironmentSurface,
  TerrainSurface,
} from "./environment.ts";
import { mineralGroundTexture } from "./mineral-ground-texture.ts";
import { FAULTLINE_PIT, faultlineRadius } from "./faultline-landform.ts";
import { buildFaultlineMachinery } from "./faultline-machinery.ts";

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
      color: 0xcbd0b9,
      map: textures.concrete,
      flatShading: true,
    }),
    dark: new THREE.MeshLambertMaterial({ color: 0x293c3b, flatShading: true }),
    teal: new THREE.MeshLambertMaterial({
      color: 0x426e65,
      map: textures.paint,
      flatShading: true,
    }),
    lime: new THREE.MeshLambertMaterial({ color: 0xccd777, flatShading: true }),
    grass: new THREE.MeshLambertMaterial({
      color: 0x789352,
      flatShading: true,
    }),
    glass: new THREE.MeshLambertMaterial({
      color: 0x6eaaa5,
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
      for (const x of [-27, 0, 27]) {
        box("teal", at(x, 4, 0), [19, 8, 32], yaw);
        box("glass", at(x, 9, 0), [22, 2, 35], yaw);
      }
      box("pale", at(0, 3, -24), [89, 6, 7], yaw);
    }
    districts.push({ name, center, u });
  }
  district(0.075, -1, "RIDGE CONTROL", "control");
  district(0.165, -1, "HIGHLAND SEED BANK", "reclaim");
  district(0.285, 1, "WEST AGGREGATE", "crushing");
  district(0.38, -1, "TRANSFER STORES", "depot");
  district(0.57, 1, "EAST GRADING WORKS", "crushing");
  district(0.675, -1, "LOWER EXTRACTION", "depot");
  district(0.77, 1, "DRAINAGE CONTROL", "control");
  district(0.87, 1, "RECLAMATION NURSERY", "reclaim");
  district(0.94, -1, "RIDGE MAINTENANCE", "depot");

  // Above the dark enclosed race passage, a readable mineral-transfer hall.
  const hall = track.config.sections.transportHall! as [number, number];
  for (let u = hall[0]; u <= hall[1]; u += 28 / track.length) {
    const f = track.frame(u * track.length);
    const yaw = Math.atan2(f.tangent.x, f.tangent.z);
    for (const side of [-1, 1]) {
      const p = f.p.clone().addScaledVector(f.right, side * (f.width + 21));
      const base = terrain.heightAt(p.x, p.z);
      const roof = f.p.y + 51;
      box("teal", p.clone().setY((base + roof) / 2), [7, roof - base, 8], yaw);
      box("pale", p.clone().setY(roof), [14, 3, 30], yaw);
    }
    box(
      "teal",
      f.p.clone().addScaledVector(f.up, 51),
      [f.width * 2 + 55, 3, 30],
      yaw,
    );
    box(
      "lime",
      f.p.clone().addScaledVector(f.up, 54),
      [f.width * 2 + 59, 2, 3],
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

  // Small angular grass tussocks reclaim only the untouched highland shoulders.
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
  root.userData.districts = districts;
  root.userData.pit = FAULTLINE_PIT;
  return {
    group: root,
    naturalMap,
    terrain,
    heightAt: terrain.heightAt,
    bridgeAt: terrain.bridgeAt,
    supportClearAt: terrain.supportClearAt,
  };
}
