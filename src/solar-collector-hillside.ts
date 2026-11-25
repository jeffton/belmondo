import * as THREE from "three";
import type { Track } from "./track.ts";
import type { CircuitTextures, EnvironmentSurface } from "./environment.ts";
import { placeStations } from "./coast-solar-landform.ts";

/** One energy landscape: inclined collector bands and their earth-retaining
 * edges follow the same hillside, rather than sitting on separate plinths. */
export function buildSolarCollectorHillside(
  parent: THREE.Object3D,
  track: Track,
  textures: CircuitTextures,
  environment: EnvironmentSurface,
) {
  const root = new THREE.Group();
  root.name = "solar-collector-hillside";
  parent.add(root);
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      // One atlas tile is one collector module. A generous structural seam
      // and a broad sky-facing reflection survive the chase-view footprint.
      const glass = Math.round(193 + 36 * Math.sin((x / 63) * Math.PI));
      const value =
        x < 4 || x >= 60 || y < 5 || y >= 59
          ? 103
          : x < 8 || x >= 56
            ? 247
            : x === 31 || x === 32
              ? 151
              : glass;
      pixels.set([value, value, value, 255], (y * 64 + x) * 4);
    }
  const cells = new THREE.DataTexture(pixels, 64, 64);
  cells.name = "solar-collector-cells";
  cells.colorSpace = THREE.SRGBColorSpace;
  cells.wrapS = cells.wrapT = THREE.RepeatWrapping;
  cells.generateMipmaps = true;
  cells.minFilter = THREE.LinearMipmapLinearFilter;
  cells.magFilter = THREE.NearestFilter;
  cells.needsUpdate = true;
  const materials = {
    panel: new THREE.MeshLambertMaterial({
      color: 0x4e8d9e,
      emissive: 0x192936,
      map: cells,
      side: THREE.DoubleSide,
    }),
    edge: new THREE.MeshLambertMaterial({
      color: 0x927b60,
      map: textures.concrete,
      side: THREE.DoubleSide,
      flatShading: true,
    }),
  };
  const batches = new Map<
    string,
    { kind: keyof typeof materials; positions: number[]; uv: number[] }
  >();
  const panels: THREE.Vector3[][] = [];
  const feet: THREE.Vector3[] = [];
  function sheet(points: THREE.Vector3[], kind: keyof typeof materials) {
    const middle = points[0].clone().lerp(points[2], 0.5);
    const key = `${kind}:${Math.floor(middle.x / 256)}:${Math.floor(middle.z / 256)}`;
    if (!batches.has(key)) batches.set(key, { kind, positions: [], uv: [] });
    const batch = batches.get(key)!;
    const length = kind === "panel" ? 1 : points[0].distanceTo(points[1]) / 24;
    const uv = [
      [0, 0],
      [0, length],
      [1, length],
      [1, 0],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      batch.positions.push(...points[i].toArray());
      batch.uv.push(...uv[i]);
    }
  }
  for (const range of [
    { start: 0.055, end: 0.19, branch: 0, rows: 3, setback: 52 },
    { start: 0.285, end: 0.46, branch: 1, rows: 3, setback: 52 },
    { start: 0.669, end: 0.719, branch: 0, rows: 2, setback: 39 },
  ]) {
    const frames = placeStations(range.start, range.end, 0.004).map((u) =>
      track.frame(u * track.length, range.branch),
    );
    for (let row = 0; row < range.rows; row++) {
      const sections = frames.map((f) => {
        const forward = new THREE.Vector3(
          f.tangent.x,
          0,
          f.tangent.z,
        ).normalize();
        const right = new THREE.Vector3(forward.z, 0, -forward.x);
        const near = f.p
          .clone()
          .addScaledVector(right, f.width + range.setback + row * 50)
          .setY(f.p.y + 3 + row * 21);
        const far = f.p
          .clone()
          .addScaledVector(right, f.width + range.setback + 45 + row * 50)
          .setY(f.p.y + 27 + row * 21);
        const nearFoot = near
          .clone()
          .setY(environment.heightAt(near.x, near.z) - 1);
        const farFoot = far
          .clone()
          .setY(environment.heightAt(far.x, far.z) - 1);
        feet.push(nearFoot, farFoot);
        return { near, far, nearFoot, farFoot };
      });
      for (let i = 0; i < sections.length - 1; i++) {
        const a = sections[i],
          b = sections[i + 1];
        const panel = [a.near, b.near, b.far, a.far];
        sheet(panel, "panel");
        panels.push(panel);
        sheet([a.near, b.near, b.nearFoot, a.nearFoot], "edge");
        sheet([a.far, a.farFoot, b.farFoot, b.far], "edge");
      }
      for (const end of [sections[0], sections.at(-1)!])
        sheet([end.near, end.nearFoot, end.farFoot, end.far], "edge");
    }
  }
  for (const { kind, positions, uv } of batches.values()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials[kind]);
    mesh.name = `collector-${kind}`;
    root.add(mesh);
  }
  root.userData.panels = panels;
  root.userData.groundingContacts = feet;
  return root;
}
