import * as THREE from "three";

/** A continuous bored headland, with an open racing void and grounded rock feet. */
export function buildCoastHeadlandBore(parent, track, textures, terrain) {
  const [start, end] = track.config.sections.headlandBore;
  const root = new THREE.Group();
  root.name = "coastal-fork-geography";
  parent.add(root);
  const materials = {
    rock: new THREE.MeshLambertMaterial({
      color: 0x697266,
      map: textures.rock,
      flatShading: true,
      side: THREE.DoubleSide,
    }),
    lining: new THREE.MeshLambertMaterial({
      color: 0x394547,
      map: textures.concrete,
      flatShading: true,
      side: THREE.DoubleSide,
    }),
    rib: new THREE.MeshLambertMaterial({
      color: 0x68716d,
      map: textures.edge,
      flatShading: true,
      side: THREE.DoubleSide,
    }),
    lamp: new THREE.MeshBasicMaterial({
      color: 0xe7ce97,
      side: THREE.DoubleSide,
    }),
  };
  const batches = new Map();
  const point = (f, x, y) =>
    f.p
      .clone()
      .addScaledVector(f.right, x)
      .add(new THREE.Vector3(0, y, 0));
  function triangle(kind, a, b, c) {
    const center = a
      .clone()
      .add(b)
      .add(c)
      .multiplyScalar(1 / 3);
    const key = `${kind}:${Math.floor(center.x / 192)}:${Math.floor(center.z / 192)}`;
    if (!batches.has(key)) batches.set(key, { kind, positions: [], uv: [] });
    const batch = batches.get(key);
    for (const p of [a, b, c]) {
      batch.positions.push(...p.toArray());
      batch.uv.push((p.x + p.z * 0.37) / 22, p.y / 18);
    }
  }
  function quad(kind, a, b, c, d) {
    triangle(kind, a, b, c);
    triangle(kind, a, c, d);
  }
  const count = Math.ceil(((end - start) * track.length) / 5);
  const sections = [];
  const groundingContacts = [];
  for (let i = 0; i <= count; i++) {
    const u = start + (i / count) * (end - start);
    const f = track.frame(u * track.length, -1);
    const w = f.width;
    const foot = (side) => {
      const p = point(f, side * (w + 70), 0);
      p.y = terrain.heightAt(p.x, p.z) - 2;
      groundingContacts.push(p.clone());
      return p;
    };
    const leftFoot = foot(-1);
    const rightFoot = foot(1);
    const exterior = (side) => {
      const p = point(f, side * (w + 40), 0);
      p.y = Math.max(f.p.y + 52, terrain.heightAt(p.x, p.z) + 8);
      return p;
    };
    const ridge = 60 + 4 * Math.sin(i * 0.19) + 2 * Math.sin(i * 0.43);
    const points = [
      leftFoot,
      exterior(-1),
      point(f, -12, ridge + 3),
      point(f, w + 13, ridge - 4),
      exterior(1),
      rightFoot,
      point(f, w + 9, -3),
      point(f, w + 9, 30),
      point(f, w + 1, 38),
      point(f, -w - 1, 38),
      point(f, -w - 9, 30),
      point(f, -w - 9, -3),
    ];
    sections.push({ f, points });
    if (i === 0) continue;
    const previous = sections[i - 1];
    for (let j = 0; j < points.length; j++) {
      const next = (j + 1) % points.length;
      // The fifth-to-sixth edges are the grounded side feet; the open road
      // between the two inner bottoms is deliberately absent from the polygon.
      const kind = j >= 6 && j <= 10 ? "lining" : "rock";
      quad(
        kind,
        previous.points[j],
        points[j],
        points[next],
        previous.points[next],
      );
    }
    if (
      Math.floor((previous.f.u * track.length) / 48) !==
      Math.floor((u * track.length) / 48)
    ) {
      // Thin surface bands follow the real vault, never columns in the racing void.
      const a = track.frame(u * track.length - 0.8, -1);
      const b = track.frame(u * track.length + 0.8, -1);
      const profile = [
        [-w - 8.8, 0],
        [-w - 8.8, 29.8],
        [-w - 0.8, 37.8],
        [w + 0.8, 37.8],
        [w + 8.8, 29.8],
        [w + 8.8, 0],
      ];
      for (let j = 0; j < profile.length - 1; j++) {
        const [x, y] = profile[j];
        const [nx, ny] = profile[j + 1];
        quad(
          "rib",
          point(a, x, y),
          point(b, x, y),
          point(b, nx, ny),
          point(a, nx, ny),
        );
      }
      // Warm, recessed navigation slots: no freestanding luminous props.
      for (const side of [-1, 1])
        quad(
          "lamp",
          point(a, side * (w + 8.6), 12),
          point(b, side * (w + 8.6), 12),
          point(b, side * (w + 8.6), 13.2),
          point(a, side * (w + 8.6), 13.2),
        );
    }
  }
  // Portal caps are concave annuli cut around the entire arch, not rectangles
  // laid over the opening. Project to each portal's horizontal local X/Y plane.
  for (const { f, points } of [sections[0], sections.at(-1)]) {
    const contour = points.map((p) => {
      const d = p.clone().sub(f.p);
      return new THREE.Vector2(d.dot(f.right), d.y);
    });
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, []))
      triangle("rock", points[a], points[b], points[c]);
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
    mesh.name = `coast-bore-${kind}`;
    root.add(mesh);
  }
  root.userData.range = [start, end];
  root.userData.branch = -1;
  root.userData.groundingContacts = groundingContacts;
  return root;
}
