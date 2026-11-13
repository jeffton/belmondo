import * as THREE from "three";
import { getTrackAdvertisingLayout } from "./advertising.js";

// Only these approach landmarks receive relief. The running barrier is untouched.
const SERVICE_SITES = {
  "KAISEKI COAST": [
    [0.16, -1],
    [0.57, 1],
  ],
  "SOLAR ARRAY": [[0.49, -1]],
  NOCTILUCENT: [[0.68, 1]],
  WHITEOUT: [[0.63, -1]],
  MONSOON: [[0.49, 1]],
  CINDERLINE: [[0.58, -1]],
  "VESPER CIRCUIT": [
    [0.475, -1],
    [0.555, 1],
    [0.745, 1],
  ],
};

function basis(frame) {
  const forward = new THREE.Vector3(
    frame.tangent.x,
    0,
    frame.tangent.z,
  ).normalize();
  return { forward, right: new THREE.Vector3(forward.z, 0, -forward.x) };
}

/** Dense branch-complete spatial index; includes the upper route over Night's tunnel. */
export function infrastructureCorridors(track) {
  const cells = new Map();
  const cellSize = 64;
  for (const branch of [-1, 0, 1]) {
    const count = Math.ceil(track.length / 3);
    for (let i = 0; i < count; i++) {
      const frame = track.frame((i / count) * track.length, branch);
      const key = `${Math.floor(frame.p.x / cellSize)}:${Math.floor(frame.p.z / cellSize)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(frame);
    }
  }
  return (p) => {
    const x = Math.floor(p.x / cellSize),
      z = Math.floor(p.z / cellSize);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const frame of cells.get(`${x + dx}:${z + dz}`) || []) {
          // A 6 m shoulder includes physical rails, sampling error and banking.
          if (
            Math.hypot(p.x - frame.p.x, p.z - frame.p.z) < frame.width + 6 &&
            p.y > frame.p.y - 9 &&
            p.y < frame.p.y + 17
          )
            return false;
        }
    return true;
  };
}

function chamferGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.5);
  shape.lineTo(0.5, -0.5);
  shape.lineTo(0.5, 0.24);
  shape.lineTo(0.24, 0.5);
  shape.lineTo(-0.24, 0.5);
  shape.lineTo(-0.5, 0.24);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    bevelEnabled: false,
    steps: 1,
  });
  geometry.translate(0, 0, -0.5);
  return geometry;
}

function surfaceSamples(part, spacing = 2) {
  const samples = [];
  const n = part.size.map((v) => Math.ceil(v / spacing));
  for (let axis = 0; axis < 3; axis++) {
    const a = (axis + 1) % 3,
      b = (axis + 2) % 3;
    for (const sign of [-1, 1])
      for (let i = 0; i <= n[a]; i++)
        for (let j = 0; j <= n[b]; j++) {
          const p = [0, 0, 0];
          p[axis] = sign * 0.5;
          p[a] = i / n[a] - 0.5;
          p[b] = j / n[b] - 0.5;
          samples.push(new THREE.Vector3(...p).applyMatrix4(part.matrix));
        }
  }
  return samples;
}

/** Reserve the board envelope and its center/corner sight rays at 120 m. */
export function infrastructureAdClear(parts, ads, track) {
  const inverse = new THREE.Matrix4();
  const bounds = new THREE.Box3(
    new THREE.Vector3(-0.5, -0.5, -0.5),
    new THREE.Vector3(0.5, 0.5, 0.5),
  );
  for (const ad of ads) {
    const eye = track.frame(ad.u * track.length - 120, ad.branch).p.clone();
    eye.y += 5;
    for (const part of parts) {
      inverse.copy(part.matrix).invert();
      // Expanded envelope protects the physical board as well as sightlines.
      if (
        ad.corners.some((p) =>
          bounds
            .clone()
            .expandByScalar(0.2)
            .containsPoint(p.clone().applyMatrix4(inverse)),
        )
      )
        return false;
      for (const target of [ad.center, ...ad.corners]) {
        const a = eye.clone().applyMatrix4(inverse);
        const b = target.clone().applyMatrix4(inverse);
        const direction = b.clone().sub(a);
        const length = direction.length();
        const hit = new THREE.Ray(a, direction.normalize()).intersectBox(
          bounds,
          new THREE.Vector3(),
        );
        if (hit && hit.distanceTo(a) < length) return false;
      }
    }
  }
  return true;
}

export function buildRacingInfrastructure(scene, track, textures, environment) {
  const root = new THREE.Group();
  root.name = "racing-infrastructure";
  const clear = infrastructureCorridors(track);
  const ads = getTrackAdvertisingLayout(track);
  const assemblies = [];
  const transform = new THREE.Object3D();

  function assembly(kind, frame, side, make) {
    const { right, forward } = basis(frame);
    const parts = [];
    function part(material, x, y, z, w, h, d, shape = "box") {
      transform.position
        .copy(frame.p)
        .addScaledVector(right, x)
        .addScaledVector(forward, z);
      transform.position.y += y;
      transform.rotation.set(0, Math.atan2(forward.x, forward.z), 0);
      transform.scale.set(w, h, d);
      transform.updateMatrix();
      parts.push({
        material,
        shape,
        size: [w, h, d],
        matrix: transform.matrix.clone(),
      });
    }
    make(part);
    // Fail visibly if a route edit invalidates an authored structure; do not
    // silently remove a member or move a landmark into another district.
    if (
      !parts.every((p) => surfaceSamples(p).every(clear)) ||
      !infrastructureAdClear(parts, ads, track)
    ) {
      throw new Error(
        `Infrastructure intersects a reserved corridor: ${track.config.name} / ${kind} / ${frame.u}`,
      );
    }
    assemblies.push({ kind, u: frame.u, side, parts });
  }

  const tunnel = track.config.sections.mountainTunnel;
  // Night's adjacent over-route leaves no room for a full collar: retain its
  // existing rock threshold and articulate the freight service wall instead.
  if (tunnel && !track.config.night) {
    const branch = 0;
    for (const [index, u] of tunnel.entries()) {
      const frame = track.frame(u * track.length + (index ? 6 : -6), branch);
      assembly("paired-tunnel-threshold", frame, 0, (part) => {
        for (const side of [-1, 1]) {
          const x = side * (frame.width + 15);
          part("stone", x, 0, 0, 10, 8, 12, "chamfer");
          part("stone", x, 15, 1, 7, 26, 8);
          // Dark inset between proud cheeks reads as a cut, not painted detail.
          part("recess", x, 10, -3.2, 4.3, 10, 0.8);
          for (const edge of [-1, 1])
            part("stone", x + edge * 2.9, 10, -4, 1.2, 14, 3);
          part("accent", x, 25.5, -4.5, 6.8, 1.2, 2);
        }
        // Two substantial ribs, above (not lowering) the existing 16 m ceiling.
        for (const z of [-3.5, 3.5])
          part("stone", 0, 29, z, 2 * frame.width + 37, 4, 2.5);
      });
    }
  }

  for (const [u, side] of SERVICE_SITES[track.config.name]) {
    const frame = track.frame(u * track.length);
    assembly("recessed-service-abutment", frame, side, (part) => {
      const x = side * (frame.width + 14);
      const p = frame.p.clone().addScaledVector(basis(frame).right, x);
      const ground = environment.heightAt(p.x, p.z) - frame.p.y;
      const bottom = Math.min(-7, ground - 1);
      const top = Math.max(12, ground + 7);
      part("stone", x, bottom + 2, 0, 13, 4, 26, "chamfer");
      // The back wall faces the driver; empty recess is real 3D negative space.
      part(
        "recess",
        x + side * 4,
        (bottom + top) / 2,
        0,
        1.5,
        top - bottom,
        21,
      );
      for (const z of [-11, 11]) {
        part("stone", x, (bottom + top) / 2, z, 10, top - bottom, 3);
        part("stone", x - side * 2, bottom + 5, z, 10, 8, 4, "chamfer");
      }
      part("stone", x, top, 0, 12, 3, 27);
      part("accent", x - side * 5.8, top - 2, 0, 0.7, 1, 22);
      // One inner shelf makes the bay legible without a bank of repeated grilles.
      part("stone", x + side * 1.5, bottom + 4.5, 0, 5, 1.3, 19);
    });
  }

  const materials = {
    stone: new THREE.MeshLambertMaterial({
      color: track.config.night ? 0x88939d : 0xbfc5bd,
      map: textures.concrete,
      flatShading: true,
    }),
    recess: new THREE.MeshLambertMaterial({
      color: 0x283542,
      map: textures.facade,
      flatShading: true,
    }),
    accent: new THREE.MeshLambertMaterial({
      color: track.config.color,
      map: textures.paint,
      flatShading: true,
    }),
  };
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    chamfer: chamferGeometry(),
  };
  const batches = new Map();
  for (const item of assemblies)
    for (const part of item.parts) {
      const p = new THREE.Vector3().setFromMatrixPosition(part.matrix);
      const key = `${part.material}:${part.shape}:${Math.floor(p.x / 256)}:${Math.floor(p.z / 256)}`;
      if (!batches.has(key))
        batches.set(key, {
          material: part.material,
          shape: part.shape,
          parts: [],
        });
      batches.get(key).parts.push(part);
    }
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(
      geometries[batch.shape],
      materials[batch.material],
      batch.parts.length,
    );
    batch.parts.forEach((part, i) => mesh.setMatrixAt(i, part.matrix));
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  // Dispose unused resources too: World owns resources reachable from the scene.
  for (const [key, geometry] of Object.entries(geometries))
    if (![...batches.values()].some((b) => b.shape === key)) geometry.dispose();
  for (const [key, material] of Object.entries(materials))
    if (![...batches.values()].some((b) => b.material === key))
      material.dispose();
  scene.add(root);
  return { group: root, assemblies };
}
