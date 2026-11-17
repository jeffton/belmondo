import * as THREE from "three";
import type { Track } from "./track.ts";
import type { CircuitTextures, EnvironmentSurface } from "./environment.ts";
import {
  courseArchitecture,
  architecturalFooting,
} from "./course-architecture.ts";

export function faultlineProcessingSites(track: Track) {
  return (
    [
      [0.585, 1],
      [0.635, 1],
    ] as const
  ).map(([u, side]) => {
    const f = track.frame(u * track.length);
    const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    return {
      u,
      side,
      center: f.p.clone().addScaledVector(right, side * (f.width + 55)),
      forward,
      right,
      yaw: Math.atan2(forward.x, forward.z),
      floor: f.p.y - 7,
    };
  });
}

/** The processing floor is excavated before the shared road/terrain grading. */
export function createFaultlineWorkingCut(track: Track) {
  const sites = faultlineProcessingSites(track);
  const a = sites[0].center;
  const b = sites[1].center;
  const delta = b.clone().sub(a).setY(0);
  const length = delta.length();
  const forward = delta.divideScalar(length);
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  return (x: number, z: number, base: number) => {
    const dx = x - a.x;
    const dz = z - a.z;
    const along = dx * forward.x + dz * forward.z;
    const across = Math.abs(dx * right.x + dz * right.z);
    const lateral = 1 - THREE.MathUtils.smoothstep(across, 105, 190);
    const ends =
      THREE.MathUtils.smoothstep(along, -170, -110) *
      (1 - THREE.MathUtils.smoothstep(along, length + 110, length + 170));
    const floor = THREE.MathUtils.lerp(
      sites[0].floor - 1,
      sites[1].floor - 1,
      THREE.MathUtils.clamp(along / length, 0, 1),
    );
    return THREE.MathUtils.lerp(base, Math.min(base, floor), lateral * ends);
  };
}

/** Two processing stages and their haul belt form one working excavation. */
export function buildFaultlineProcessing(
  scene: THREE.Object3D,
  track: Track,
  textures: CircuitTextures,
  environment: EnvironmentSurface,
) {
  const arch = courseArchitecture(scene, "faultline-processing", textures, {
    ceramic: { color: 0xd4cbb0, map: "concrete" },
    steel: { color: 0x334745, map: "paint" },
    teal: { color: 0x397f7b, map: "paint" },
    glass: { color: 0x8bb1ad, map: "facade" },
    signal: { color: 0xc9d472, map: "paint" },
  });
  const sites = faultlineProcessingSites(track);
  const heads: THREE.Vector3[] = [];
  const footings = [];
  for (const site of sites) {
    const footing = architecturalFooting(
      environment,
      site.center,
      74,
      174,
      site.yaw,
    );
    const floor = footing.top;
    footings.push({ ...site, ...footing });
    const at = (x: number, y: number, z: number) =>
      site.center
        .clone()
        .addScaledVector(site.right, x)
        .addScaledVector(site.forward, z)
        .setY(floor + y);
    const box = (
      kind: string,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
    ) => arch.box(kind, at(x, y, z), [w, h, d], site.yaw);
    box(
      "ceramic",
      0,
      (footing.bottom - floor) / 2,
      0,
      74,
      floor - footing.bottom,
      174,
    );
    box("steel", 0, 0.5, 0, 74, 1, 174);
    box("ceramic", 0, 14, -15, 62, 28, 112);
    box("steel", -site.side * 31.1, 10, -15, 0.8, 20, 74);
    for (const z of [-63, -15, 33])
      box("ceramic", -site.side * 33, 14, z, 4, 28, 4);
    box("glass", -site.side * 31.6, 24, -15, 0.9, 4, 91);
    box("teal", 0, 29.5, -15, 66, 3, 116);
    for (const x of [-18, 18]) {
      for (const z of [43, 68]) box("steel", x, 16, z, 3, 32, 3);
      const matrix = new THREE.Matrix4().compose(
        at(x, 32, 55),
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          site.yaw + Math.PI / 4,
        ),
        new THREE.Vector3(1, 1, 1),
      );
      arch.add("teal", new THREE.CylinderGeometry(15, 6, 20, 4), matrix);
      box("ceramic", x, 43, 55, 23, 2, 23);
    }
    for (const x of [-11, 11])
      for (const z of [-78, -57]) box("steel", x, 27, z, 3.5, 54, 3.5);
    box("teal", 0, 51, -67, 26, 9, 29);
    box("signal", 0, 56.5, -67, 29, 2, 32);
    heads.push(at(0, 58, -67));
  }
  const beam = (
    kind: string,
    a: THREE.Vector3,
    b: THREE.Vector3,
    width: number,
    depth: number,
  ) => {
    const delta = b.clone().sub(a);
    const matrix = new THREE.Matrix4().compose(
      a.clone().add(b).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.clone().normalize(),
      ),
      new THREE.Vector3(width, delta.length(), depth),
    );
    arch.add(kind, new THREE.BoxGeometry(1, 1, 1), matrix);
  };
  beam("steel", heads[0], heads[1], 12, 3);
  const direction = heads[1].clone().sub(heads[0]).setY(0).normalize();
  const sideways = new THREE.Vector3(direction.z, 0, -direction.x);
  for (const side of [-1, 1]) {
    const a = heads[0].clone().addScaledVector(sideways, side * 6);
    const b = heads[1].clone().addScaledVector(sideways, side * 6);
    beam(
      "teal",
      a.clone().add(new THREE.Vector3(0, 5, 0)),
      b.clone().add(new THREE.Vector3(0, 5, 0)),
      1.5,
      1.5,
    );
    for (let i = 0; i < 8; i++) {
      const p = a.clone().lerp(b, i / 8);
      const q = a.clone().lerp(b, (i + 1) / 8);
      beam("teal", p, q.clone().add(new THREE.Vector3(0, 5, 0)), 0.9, 0.9);
      beam("teal", p, p.clone().add(new THREE.Vector3(0, 5, 0)), 0.9, 0.9);
    }
  }
  arch.root.userData.footings = footings;
  arch.root.userData.haulBelt = heads;
  return arch.finish();
}
