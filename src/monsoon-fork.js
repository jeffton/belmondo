import * as THREE from "three";
import { terrainFootprint } from "./terrain-footprint.js";

/** Fork-side hydraulic infrastructure; the world owns the actual tunnel shell. */
export function buildMonsoonFork(parent, track, textures, environment) {
  const root = new THREE.Group();
  root.name = "monsoon-hydraulic-fork";
  parent.add(root);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const batches = new Map();
  const transform = new THREE.Object3D();
  const palette = {
    concrete: 0x9bb8ab,
    machinery: 0x294d48,
    warning: 0xe3ad43,
  };
  const basis = (u, branch) => {
    const frame = track.frame(u * track.length, branch);
    const forward = frame.tangent.clone().setY(0).normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    return { ...frame, forward, horizontalRight: right };
  };
  const at = (f, x, z = 0) =>
    f.p
      .clone()
      .addScaledVector(f.horizontalRight, x)
      .addScaledVector(f.forward, z);
  function block(kind, f, x, z, width, depth, bottom, top, grounded = false) {
    const center = at(f, x, z);
    transform.position.copy(center).setY((bottom + top) / 2);
    transform.rotation.set(0, Math.atan2(f.forward.x, f.forward.z), 0);
    transform.scale.set(width, top - bottom, depth);
    transform.updateMatrix();
    if (!batches.has(kind)) batches.set(kind, []);
    batches.get(kind).push(transform.matrix.clone());
    if (grounded)
      root.userData.foundations.push({
        center,
        right: f.horizontalRight,
        forward: f.forward,
        width,
        depth,
        bottom,
        top,
      });
  }
  const floor = (f, x, z, width, depth) =>
    Math.min(
      ...terrainFootprint(
        environment.terrain,
        at(f, x, z),
        f.horizontalRight,
        f.forward,
        width,
        depth,
      ).map((p) => p.y),
    ) - 1;
  root.userData.foundations = [];
  // External buttresses and pump cabinets frame the two real tunnel portals.
  // Nothing bridges the road: its 16 m roof belongs exclusively to world.js.
  const [lowStart, lowEnd] = track.config.sections.pressureConduit;
  for (const u of [lowStart, lowEnd]) {
    const f = basis(u, -1);
    for (const side of [-1, 1]) {
      const x = side * (f.width + 12);
      block(
        "concrete",
        f,
        x,
        0,
        7,
        12,
        floor(f, x, 0, 7, 12),
        f.p.y + 19,
        true,
      );
      block("warning", f, x, -6.2, 7, 0.7, f.p.y + 11, f.p.y + 14);
    }
  }
  for (let i = 0; i < 7; i++) {
    const u = lowStart + (lowEnd - lowStart) * ((i + 0.5) / 7);
    const f = basis(u, -1),
      x = -f.width - 13;
    block("concrete", f, x, 0, 9, 14, floor(f, x, 0, 9, 14), f.p.y + 5, true);
    block("machinery", f, x, 0, 7, 11, f.p.y + 5, f.p.y + 11);
    block("warning", f, x + 3.6, 0, 0.6, 9, f.p.y + 7, f.p.y + 8);
  }
  const [highStart, highEnd] = track.config.sections.reservoirWalkway;
  // Outboard piers and maintenance plinths leave the high carriageway exposed.
  for (let i = 0; i < 9; i++) {
    const f = basis(highStart + (highEnd - highStart) * (i / 8), 1);
    const x = f.width + 12;
    const plinth =
      Math.max(
        f.p.y - 2,
        ...terrainFootprint(
          environment.terrain,
          at(f, x),
          f.horizontalRight,
          f.forward,
          9,
          12,
        ).map((p) => p.y),
      ) + 1;
    block("concrete", f, x, 0, 9, 12, floor(f, x, 0, 9, 12), plinth, true);
    block("machinery", f, x, 0, 9, 12, plinth, plinth + 3);
  }
  // A level, finite, four-sided balance reservoir alongside the upper route.
  // Its floor is above the actual highest land triangle, not buried fake water.
  const f = basis((highStart + highEnd) / 2, 1);
  const x = f.width + 42,
    width = 36,
    depth = 66;
  const terrain = terrainFootprint(
    environment.terrain,
    at(f, x),
    f.horizontalRight,
    f.forward,
    width + 8,
    depth + 8,
  );
  const bottom = Math.min(...terrain.map((p) => p.y)) - 1;
  const bed = Math.max(...terrain.map((p) => p.y), f.p.y - 13) + 1;
  const level = bed + 5;
  block("concrete", f, x, 0, width + 8, depth + 8, bottom, bed, true);
  for (const side of [-1, 1]) {
    block(
      "concrete",
      f,
      x + side * (width / 2 + 2),
      0,
      4,
      depth + 8,
      bed,
      level + 2,
    );
    block("concrete", f, x, side * (depth / 2 + 2), width, 4, bed, level + 2);
  }
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({ color: 0x408c83, side: THREE.DoubleSide }),
  );
  water.name = "fork-retained-reservoir";
  water.rotation.set(-Math.PI / 2, 0, 0);
  // Plane coordinates are rotated into the horizontal frame by its parent.
  const basin = new THREE.Group();
  basin.position.copy(at(f, x)).setY(level);
  basin.rotation.y = Math.atan2(f.forward.x, f.forward.z);
  basin.add(water);
  root.add(basin);
  root.userData.reservoir = { level, bed, width, depth };
  for (const [kind, matrices] of batches) {
    const mesh = new THREE.InstancedMesh(
      box,
      new THREE.MeshLambertMaterial({
        color: palette[kind],
        map: textures.concrete,
        flatShading: true,
      }),
      matrices.length,
    );
    mesh.name = `fork-${kind}`;
    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  return root;
}
