import * as THREE from "three";
import type { Track } from "./track.ts";
import type { CircuitTextures, EnvironmentSurface } from "./environment.ts";
import { terrainFootprint } from "./terrain-footprint.ts";

/** A surveyed, terrain-rooted industrial foundation, shared by the two works. */
export function industrialSite(
  track: Track,
  environment: EnvironmentSurface,
  u: number,
  side: number,
  offset: number,
  width: number,
  depth: number,
  branch = 0,
  minimumDeck = -Infinity,
) {
  const f = track.frame(u * track.length, branch);
  const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  const center = f.p.clone().addScaledVector(right, side * offset);
  const contacts = terrainFootprint(
    environment.terrain,
    center,
    right,
    forward,
    width,
    depth,
  );
  const bottom = Math.min(...contacts.map((p) => p.y)) - 2;
  const deck = Math.max(minimumDeck, Math.max(...contacts.map((p) => p.y)) + 1);
  const point = (x: number, y: number, z: number) =>
    center
      .clone()
      .addScaledVector(right, x)
      .addScaledVector(forward, z)
      .setY(y);
  return {
    u,
    branch,
    center,
    right,
    forward,
    width,
    depth,
    bottom,
    deck,
    contacts,
    point,
  };
}

/** Static material batches; no update loop, lights, transparency or shadow pass. */
export function industrialMeshes(
  root: THREE.Group,
  textures: CircuitTextures,
  palette: Record<string, number>,
  fog = true,
) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const batches = new Map<
    string,
    { matrices: THREE.Matrix4[]; material: THREE.Material }
  >();
  const bodies: { name: string; matrix: THREE.Matrix4 }[] = [];
  function box(
    name: string,
    material: string,
    site: ReturnType<typeof industrialSite>,
    x: number,
    bottom: number,
    z: number,
    width: number,
    height: number,
    depth: number,
  ) {
    const position = site.point(x, bottom + height / 2, z);
    const matrix = new THREE.Matrix4().compose(
      position,
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.atan2(site.forward.x, site.forward.z),
      ),
      new THREE.Vector3(width, height, depth),
    );
    // Spatial cells keep the long harbor independently cullable.
    const key = `${material}:${Math.floor(position.x / 256)}:${Math.floor(position.z / 256)}`;
    if (!batches.has(key))
      batches.set(key, {
        matrices: [],
        material: new THREE.MeshLambertMaterial({
          color: palette[material],
          map: material === "dark" ? textures.paint : textures.concrete,
          flatShading: true,
          fog,
        }),
      });
    batches.get(key)!.matrices.push(matrix);
    bodies.push({ name, matrix });
  }
  function finish() {
    for (const [name, batch] of batches) {
      const mesh = new THREE.InstancedMesh(
        geometry,
        batch.material,
        batch.matrices.length,
      );
      batch.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.name = name;
      mesh.computeBoundingSphere();
      root.add(mesh);
    }
    root.userData.bodies = bodies;
  }
  return { box, finish };
}
