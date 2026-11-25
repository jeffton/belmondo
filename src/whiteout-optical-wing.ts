import * as THREE from "three";
import type { Track } from "./track.ts";
import type { CircuitTextures, EnvironmentSurface } from "./environment.ts";
import {
  architecturalFooting,
  courseArchitecture,
} from "./course-architecture.ts";

/** One high instrument house cantilevers from the basin caisson over a bend. */
export function buildWhiteoutOpticalWing(
  parent: THREE.Object3D,
  track: Track,
  textures: CircuitTextures,
  environment: EnvironmentSurface,
) {
  const site = courseArchitecture(parent, "whiteout-optical-wing", textures, {
    shell: { color: 0xe0f4f4, map: "paint" },
    structure: { color: 0x416378, map: "paint" },
    glazing: { color: 0x153852, map: null },
    seal: { color: 0xf58e43, map: "paint" },
  });
  const f = track.frame(0.336 * track.length);
  const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  const yaw = Math.atan2(forward.x, forward.z);
  const center = f.p.clone().addScaledVector(right, 22);
  let highestRoad = -Infinity;
  for (let u = 0.312; u <= 0.36; u += 0.0003) {
    const frame = track.frame(u * track.length);
    for (const side of [-1, 1])
      highestRoad = Math.max(
        highestRoad,
        frame.p.y + side * frame.right.y * frame.width,
      );
  }
  const floor = highestRoad + 46;
  const local = (x: number, y: number, z: number) =>
    center
      .clone()
      .addScaledVector(right, x)
      .addScaledVector(forward, z)
      .setY(y);
  const box = (
    kind: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) => site.box(kind, local(x, y, z), [w, h, d], yaw);
  // The caisson intersects the existing inner-rim gallery, never the road.
  // Its full grounded footprint visibly carries both the house and its trusses.
  const caisson = local(38, 0, 0);
  const footing = architecturalFooting(environment, caisson, 44, 128, yaw);
  site.box(
    "structure",
    caisson.clone().setY((footing.bottom + floor) / 2),
    [44, floor - footing.bottom, 128],
    yaw,
  );
  for (const z of [-56, -18, 20, 58]) {
    box("structure", -7, floor - 2, z, 118, 4, 8);
    box("shell", -33, floor - 5, z, 50, 2, 7);
    box("seal", -55, floor - 5.8, z, 6, 0.8, 7);
  }
  box("structure", -43, floor - 1, 0, 12, 4, 149);
  box("seal", -50.5, floor + 3.6, 0, 4, 3, 151);
  for (const z of [-56, -18, 20, 58]) {
    const edge = local(-51, floor + 9, z);
    const flange = new THREE.CylinderGeometry(3, 7, 12, 4, 1);
    site.add(
      "shell",
      flange,
      new THREE.Matrix4().makeRotationY(yaw + Math.PI / 4).setPosition(edge),
    );
  }
  box("shell", 0, floor + 1, 0, 104, 2, 160);
  box("shell", 0, floor + 15, 0, 104, 2, 160);
  for (const x of [-50, 50]) box("shell", x, floor + 8, 0, 4, 12, 160);
  box("shell", 0, floor + 8, 78, 96, 12, 4);
  // The approaching pilot sees a broad recessed instrument window before
  // entering the high undercroft; this is a building facade, not a road portal.
  box("glazing", 0, floor + 8, -77.5, 94, 9, 0.6);
  for (const x of [-48, -16, 16, 48]) box("shell", x, floor + 8, -79, 3, 12, 3);
  box("seal", 0, floor + 3.4, -79.5, 97, 3, 2);
  for (const z of [-72, 72]) {
    box("seal", 0, floor + 15, z, 104, 3, 5);
    box("structure", -51.5, floor + 9.5, z, 3, 9, 5);
  }
  const vertices: number[] = [];
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
    vertices.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  const profile = (z: number) =>
    Array.from({ length: 17 }, (_, i) =>
      local(
        Math.cos((i * Math.PI) / 16) * 52,
        floor + 16 + Math.sin((i * Math.PI) / 16) * 22,
        z,
      ),
    );
  const a = profile(-80),
    b = profile(80);
  for (let i = 0; i < 16; i++) {
    triangle(a[i], b[i + 1], b[i]);
    triangle(a[i], a[i + 1], b[i + 1]);
    triangle(local(0, floor + 16, -80), a[i + 1], a[i]);
    triangle(local(0, floor + 16, 80), b[i], b[i + 1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  const uv: number[] = [];
  for (let i = 0; i < vertices.length; i += 3)
    uv.push(vertices[i] / 24, vertices[i + 2] / 24);
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(Array.from({ length: vertices.length / 3 }, (_, i) => i));
  geometry.computeVertexNormals();
  site.add("shell", geometry, new THREE.Matrix4());
  site.root.userData.footing = footing;
  site.root.userData.floor = floor;
  site.root.userData.range = [0.312, 0.36];
  return site.finish();
}
