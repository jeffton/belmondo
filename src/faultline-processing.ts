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
    steel: { color: 0x2e4549, map: "paint" },
    teal: { color: 0x527f7e, map: "paint" },
    glass: { color: 0x829f9d, map: "facade" },
    signal: { color: 0xd2944c, map: "paint" },
  });
  const sites = faultlineProcessingSites(track);
  const heads: THREE.Vector3[] = [];
  const footings = [];
  for (const [stage, site] of sites.entries()) {
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
    const vessel = (
      kind: string,
      x: number,
      y: number,
      z: number,
      rim: number,
      base: number,
      height: number,
      sides: number,
    ) => {
      arch.add(
        kind,
        new THREE.CylinderGeometry(rim, base, height, sides),
        new THREE.Matrix4()
          .makeRotationY(site.yaw + Math.PI / sides)
          .setPosition(at(x, y, z)),
      );
    };
    if (stage === 0) {
      box("ceramic", 0, 7, 16, 62, 14, 124);
      for (const z of [-35, 3, 41, 68]) box("steel", -31.7, 7, z, 1.5, 10, 15);
      for (const z of [-24, 20, 60]) {
        for (const x of [-12, 12]) box("steel", x, 24, z, 4, 20, 4);
        vessel("teal", 0, 33, z, 23, 10, 20, 4);
        vessel("signal", 0, 44, z, 24, 24, 2, 4);
      }
      box("steel", 0, 46.5, 11, 12, 3, 118);
      for (const x of [-11, 11])
        for (const z of [-78, -57]) box("steel", x, 27, z, 4, 54, 4);
      vessel("teal", 0, 44, -67, 19, 9, 20, 4);
      box("signal", 0, 55.5, -67, 28, 3, 29);
    } else {
      box("ceramic", 0, 9, -1, 61, 18, 156);
      box("steel", -31, 8, 6, 1, 12, 132);
      for (const z of [-62, -21, 20]) {
        box("ceramic", -32, 9, z, 2, 18, 4);
        box("signal", -31, 17, z, 1, 2, 25);
      }
      for (const [z, height] of [
        [-62, 56],
        [-21, 49],
        [20, 41],
      ]) {
        vessel("teal", 0, (height + 18) / 2, z, 18, 18, height - 18, 8);
        vessel("signal", 0, height, z, 19, 19, 3, 8);
      }
      box("glass", -31.7, 15, 39, 1.1, 4, 32);
      box("steel", 0, 7.5, 77.3, 29, 12, 1);
      for (const x of [-17, 17]) box("signal", x, 8, 78, 2, 14, 1);
    }
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
