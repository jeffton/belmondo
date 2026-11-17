import * as THREE from "three";
import type { Track } from "./track.ts";
import type { CircuitTextures, EnvironmentSurface } from "./environment.ts";
import type { VesperVolume } from "./vesper-districts.ts";
import { courseArchitecture } from "./course-architecture.ts";

const START = 0.306;
const END = 0.334;

function profiles(track: Track, heightAt: EnvironmentSurface["heightAt"]) {
  return Array.from({ length: 9 }, (_, i) => {
    const u = START + ((END - START) * i) / 8;
    const lower = track.frame(u * track.length, -1);
    const upper = track.frame(u * track.length, 1);
    const center = lower.p.clone().add(upper.p).multiplyScalar(0.5);
    const gap = upper.p.z - lower.p.z;
    const halfWidth = gap / 2 - Math.max(lower.width, upper.width) - 12;
    return {
      u,
      lower,
      upper,
      center,
      halfWidth,
      bottom: heightAt(center.x, center.z) - 2,
      podium: lower.p.y - 12,
      roof: Math.max(upper.p.y + 6, lower.p.y + 46),
    };
  });
}

/** Reserve the entire connected terminal before surrounding blocks/traffic. */
export function vesperInterchangeReservations(
  track: Track,
  heightAt: EnvironmentSurface["heightAt"],
): VesperVolume[] {
  const p = profiles(track, heightAt);
  return p.slice(0, -1).map((a, i) => {
    const b = p[i + 1];
    return {
      center: a.center.clone().add(b.center).multiplyScalar(0.5),
      right: new THREE.Vector3(0, 0, 1),
      forward: new THREE.Vector3(-1, 0, 0),
      width: Math.max(a.halfWidth, b.halfWidth) * 2 + 6,
      depth: Math.abs(a.center.x - b.center.x) + 3,
      bottom: Math.min(a.bottom, b.bottom),
      top: Math.max(a.roof, b.roof),
      kind: "interchange-terminal",
    };
  });
}

/** One terminal, read from a covered concourse and its open rooftop route. */
export function buildVesperInterchange(
  parent: THREE.Object3D,
  track: Track,
  textures: CircuitTextures,
  environment: EnvironmentSurface,
) {
  const arch = courseArchitecture(parent, "vesper-interchange", textures, {
    podium: { color: 0x394b59, map: "paint" },
    ceramic: { color: 0x9ca8af, map: "concrete" },
    steel: { color: 0x36485b, map: "paint" },
    soffit: { color: 0x7c8991, map: "concrete" },
    glass: { color: 0x7b9fae, map: "facade" },
    warm: { color: 0xc6a485, map: "facade" },
  });
  const p = profiles(track, environment.heightAt);
  const arcadeParts: (VesperVolume & { branch: number; depth: number })[] = [];
  const identity = new THREE.Matrix4();
  function prism(kind: string, corners: THREE.Vector3[]) {
    const indices = [
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0,
      4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
    ];
    const vertices: number[] = [],
      uv: number[] = [];
    for (const i of indices) {
      vertices.push(...corners[i].toArray());
      uv.push((corners[i].x + corners[i].z) / 36, corners[i].y / 24);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    arch.add(kind, geometry, identity);
  }
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i],
      b = p[i + 1];
    const body = (lowA: number, lowB: number, highA: number, highB: number) => [
      new THREE.Vector3(a.center.x, lowA, a.center.z - a.halfWidth),
      new THREE.Vector3(b.center.x, lowB, b.center.z - b.halfWidth),
      new THREE.Vector3(b.center.x, lowB, b.center.z + b.halfWidth),
      new THREE.Vector3(a.center.x, lowA, a.center.z + a.halfWidth),
      new THREE.Vector3(a.center.x, highA, a.center.z - a.halfWidth),
      new THREE.Vector3(b.center.x, highB, b.center.z - b.halfWidth),
      new THREE.Vector3(b.center.x, highB, b.center.z + b.halfWidth),
      new THREE.Vector3(a.center.x, highA, a.center.z + a.halfWidth),
    ];
    prism("podium", body(a.bottom, b.bottom, a.podium, b.podium));
    prism("ceramic", body(a.podium, b.podium, a.roof, b.roof));
    // The concourse ceiling is continuous and follows the descending deck;
    // it is not a repeated row of disconnected horizontal slabs.
    const canopy = (f: typeof a, y: number, side: number) =>
      f.lower.p
        .clone()
        .addScaledVector(f.lower.right, side * (f.lower.width + 16))
        .setY(f.lower.p.y + y);
    prism("soffit", [
      canopy(a, 40, -1),
      canopy(b, 40, -1),
      canopy(b, 40, 1),
      canopy(a, 40, 1),
      canopy(a, 44, -1),
      canopy(b, 44, -1),
      canopy(b, 44, 1),
      canopy(a, 44, 1),
    ]);
    const mid = a.lower.p.clone().add(b.lower.p).multiplyScalar(0.5);
    const forward = b.lower.p.clone().sub(a.lower.p).setY(0).normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    arcadeParts.push({
      center: mid,
      right,
      forward,
      width: Math.max(a.lower.width, b.lower.width) * 2 + 32,
      depth: a.lower.p.distanceTo(b.lower.p),
      bottom: Math.min(a.lower.p.y, b.lower.p.y) + 40,
      top: Math.max(a.lower.p.y, b.lower.p.y) + 44,
      branch: -1,
      kind: "market-roof",
    });
    const center = a.center.clone().add(b.center).multiplyScalar(0.5);
    const lowerY = (a.lower.p.y + b.lower.p.y) / 2;
    const upperY = (a.upper.p.y + b.upper.p.y) / 2;
    const half = (a.halfWidth + b.halfWidth) / 2;
    const depth = Math.abs(a.center.x - b.center.x);
    // Broad occupied rooms reveal a single building at two floor levels.
    arch.box(
      i % 3 === 0 ? "warm" : "glass",
      center
        .clone()
        .setY(lowerY + 6)
        .add(new THREE.Vector3(0, 0, -half - 0.25)),
      [depth * 0.72, 6, 0.5],
    );
    arch.box(
      "glass",
      center
        .clone()
        .setY(upperY + 1)
        .add(new THREE.Vector3(0, 0, half + 0.25)),
      [depth * 0.62, 4, 0.5],
    );
    if (i % 2 === 0) {
      const column = a.lower.p
        .clone()
        .addScaledVector(a.lower.right, -a.lower.width - 13);
      const bottom = environment.heightAt(column.x, column.z) - 1;
      const top = a.lower.p.y + 40;
      arch.box(
        "steel",
        column.clone().setY((bottom + top) / 2),
        [4, top - bottom, 5],
        Math.atan2(forward.x, forward.z),
      );
      arcadeParts.push({
        center: column,
        right,
        forward,
        width: 4,
        depth: 5,
        bottom,
        top,
        branch: -1,
        kind: "market-column",
      });
    }
  }
  const root = arch.finish();
  const warm = root.getObjectByName("vesper-interchange-warm") as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshLambertMaterial
  >;
  warm.material.emissive.setHex(0x342619);
  root.userData.profiles = p;
  root.userData.arcadeParts = arcadeParts;
  root.userData.reservations = vesperInterchangeReservations(
    track,
    environment.heightAt,
  );
  return { root, arcadeParts };
}
