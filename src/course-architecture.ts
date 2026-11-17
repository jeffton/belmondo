import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { CircuitTextures, EnvironmentSurface } from "./environment.ts";
import { terrainFootprint } from "./terrain-footprint.ts";

export interface ArchitecturalMaterial {
  color: THREE.ColorRepresentation;
  map: "concrete" | "paint" | "facade" | "water" | "rock" | null;
}

/** Opaque architectural masses, merged by explicit material role per site. */
export function courseArchitecture(
  parent: THREE.Object3D,
  name: string,
  textures: CircuitTextures,
  palette: Record<string, ArchitecturalMaterial>,
) {
  const root = new THREE.Group();
  root.name = name;
  parent.add(root);
  const batches = new Map<string, THREE.BufferGeometry[]>();
  const parts: { kind: string; bounds: THREE.Box3 }[] = [];
  function add(
    kind: string,
    geometry: THREE.BufferGeometry,
    matrix: THREE.Matrix4,
  ) {
    geometry.applyMatrix4(matrix);
    geometry.computeBoundingBox();
    parts.push({ kind, bounds: geometry.boundingBox!.clone() });
    if (!batches.has(kind)) batches.set(kind, []);
    batches.get(kind)!.push(geometry);
  }
  function box(
    kind: string,
    center: THREE.Vector3,
    dimensions: [number, number, number],
    yaw = 0,
  ) {
    const matrix = new THREE.Matrix4().compose(
      center,
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      new THREE.Vector3(...dimensions),
    );
    add(kind, new THREE.BoxGeometry(1, 1, 1), matrix);
  }
  function finish() {
    for (const [kind, geometries] of batches) {
      const geometry = mergeGeometries(geometries);
      geometries.forEach((g) => g.dispose());
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshLambertMaterial({
          color: palette[kind].color,
          map: palette[kind].map === null ? null : textures[palette[kind].map],
          flatShading: true,
        }),
      );
      mesh.name = `${name}-${kind}`;
      root.add(mesh);
    }
    root.userData.parts = parts;
    return root;
  }
  return { root, box, add, finish };
}

/** Actual footprint samples anchor foundations into the shared collision land. */
export function architecturalFooting(
  environment: EnvironmentSurface,
  center: THREE.Vector3,
  width: number,
  depth: number,
  yaw = 0,
) {
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const contacts = terrainFootprint(
    environment.terrain,
    center,
    right,
    forward,
    width,
    depth,
  );
  return {
    bottom: Math.min(...contacts.map((p) => p.y)) - 2,
    top: Math.max(...contacts.map((p) => p.y)) + 1,
    contacts,
  };
}
