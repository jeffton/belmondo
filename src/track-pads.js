import * as THREE from "three";
import { PAD_POSITIONS } from "./race.js";

// Pickup positions and the 12 × 7 m active footprint are owned by Race.
// Octagonal steel cartridges replace floating decals, without transparent glow.
export function buildTrackPads(scene, track, textures) {
  const chunks = new Map();
  const materials = {
    boost: new THREE.MeshBasicMaterial({ map: textures.boost }),
    arms: new THREE.MeshBasicMaterial({ map: textures.arms }),
    bevel: new THREE.MeshLambertMaterial({ vertexColors: true }),
  };
  const perimeter = [
    [-5.35, -3.5],
    [5.35, -3.5],
    [6, -2.75],
    [6, 2.75],
    [5.35, 3.5],
    [-5.35, 3.5],
    [-6, 2.75],
    [-6, -2.75],
  ];
  const triangle = (kind, points, coordinates, color) => {
    const key = `${kind}:${Math.floor(points[0].x / 256)}:${Math.floor(points[0].z / 256)}`;
    if (!chunks.has(key))
      chunks.set(key, { kind, positions: [], uv: [], colors: [] });
    const chunk = chunks.get(key);
    for (let i = 0; i < 3; i++) {
      chunk.positions.push(...points[i].toArray());
      chunk.uv.push(...coordinates[i]);
      if (color) chunk.colors.push(color.r, color.g, color.b);
    }
  };
  for (const [index, u] of PAD_POSITIONS.entries()) {
    const branches =
      u > track.config.split[0] && u < track.config.split[1] ? [-1, 1] : [0];
    const kind = index % 3 === 0 ? "boost" : "arms";
    for (const branch of branches) {
      const s = u * track.length;
      // Sample along the deck so the cartridge follows gradients and bends.
      const point = ([x, z], height) => {
        const frame = track.frame(s + z, branch);
        return frame.p
          .clone()
          .addScaledVector(frame.right, x)
          .addScaledVector(frame.up, height);
      };
      const uv = ([x, z]) => [0.5 - x / 12, 0.5 - z / 7];
      const center = point([0, 0], 0.14);
      for (let i = 0; i < perimeter.length; i++) {
        const a = perimeter[i];
        const b = perimeter[(i + 1) % perimeter.length];
        const topA = point(a, 0.14);
        const topB = point(b, 0.14);
        // Reversed fan winding faces up; UVs read from the approaching camera.
        triangle(kind, [center, topB, topA], [[0.5, 0.5], uv(b), uv(a)]);
        const lowerA = point(a, 0.045);
        const lowerB = point(b, 0.045);
        const steel = new THREE.Color(i % 2 ? 0x485565 : 0x71818e);
        triangle(
          "bevel",
          [lowerA, topA, topB],
          [
            [0, 0],
            [0, 1],
            [1, 1],
          ],
          steel,
        );
        triangle(
          "bevel",
          [lowerA, topB, lowerB],
          [
            [0, 0],
            [1, 1],
            [1, 0],
          ],
          steel,
        );
      }
    }
  }
  for (const chunk of chunks.values()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(chunk.positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(chunk.uv, 2));
    if (chunk.colors.length)
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(chunk.colors, 3),
      );
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials[chunk.kind]);
    mesh.name = `track-pads-${chunk.kind}`;
    scene.add(mesh);
  }
}
