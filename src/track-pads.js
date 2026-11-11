import * as THREE from "three";
import { getTrackPickups, pickupOutline, pickupPoint } from "./pickups.js";

// Opaque road inserts and side-mounted approach marks share spatial batches.
export function buildTrackPads(scene, track, textures) {
  const chunks = new Map();
  const materials = {
    boost: new THREE.MeshBasicMaterial({ map: textures.boost }),
    weapon: new THREE.MeshBasicMaterial({ map: textures.arms }),
    trim: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  const triangle = (
    kind,
    points,
    coordinates,
    color = new THREE.Color(0xffffff),
  ) => {
    const key = `${kind}:${Math.floor(points[0].x / 256)}:${Math.floor(points[0].z / 256)}`;
    if (!chunks.has(key))
      chunks.set(key, { kind, positions: [], uv: [], colors: [] });
    const chunk = chunks.get(key);
    for (let i = 0; i < 3; i++) {
      chunk.positions.push(...points[i].toArray());
      chunk.uv.push(...coordinates[i]);
      chunk.colors.push(color.r, color.g, color.b);
    }
  };
  for (const pad of getTrackPickups(track)) {
    const point = (xz, height) => pickupPoint(track, pad, ...xz, height);
    const uv = ([x, z]) => [0.5 - x / pad.width, 0.5 - z / pad.length];
    const perimeter = pickupOutline(pad);
    const center = point([0, 0], 0.14);
    for (let i = 0; i < perimeter.length; i++) {
      const a = perimeter[i],
        b = perimeter[(i + 1) % perimeter.length];
      const topA = point(a, 0.14),
        topB = point(b, 0.14);
      triangle(pad.type, [center, topB, topA], [[0.5, 0.5], uv(b), uv(a)]);
      const lowerA = point(a, 0.045),
        lowerB = point(b, 0.045);
      const steel = new THREE.Color(i % 2 ? 0x485565 : 0x71818e);
      triangle(
        "trim",
        [lowerA, topA, topB],
        [
          [0, 0],
          [0, 1],
          [1, 1],
        ],
        steel,
      );
      triangle(
        "trim",
        [lowerA, topB, lowerB],
        [
          [0, 0],
          [1, 1],
          [1, 0],
        ],
        steel,
      );
    }
    const mark = (polygon, color) => {
      const vertices = polygon.map((xz) => point(xz, 0.075));
      for (let i = 1; i < vertices.length - 1; i++)
        triangle(
          "trim",
          [vertices[0], vertices[i + 1], vertices[i]],
          [
            [0, 0],
            [1, 1],
            [1, 0],
          ],
          new THREE.Color(color),
        );
    };
    for (const side of [-1, 1]) {
      const x = side * (pad.width / 2 + 0.8);
      if (pad.type === "boost") {
        // Two continuous icy guide rails lead only to the long induction lane.
        mark(
          [
            [x - 0.18, -45],
            [x + 0.18, -45],
            [x + 0.18, -14],
            [x - 0.18, -14],
          ],
          0x74faff,
        );
        mark(
          [
            [x - 0.35, -15],
            [x + 0.35, -15],
            [x + 0.35, -12],
            [x - 0.35, -12],
          ],
          0xdcffff,
        );
      } else {
        // Discrete amber diamonds sit beside the socket, never in the racing line.
        for (const z of [-36, -25, -14])
          mark(
            [
              [x, z - 1.5],
              [x + 0.7, z],
              [x, z + 1.5],
              [x - 0.7, z],
            ],
            0xffac3d,
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
