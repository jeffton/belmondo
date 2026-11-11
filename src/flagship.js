import * as THREE from "three";

const UP = new THREE.Vector3(0, 1, 0);
const loader = new THREE.TextureLoader();
export const flagshipAssetsReady = Promise.all([
  loader.loadAsync("/art/waterfront-facade.png"),
  loader.loadAsync("/art/null-vector-mark.png"),
]).then(([frontage, mark]) => {
  for (const map of [frontage, mark]) {
    map.colorSpace = THREE.SRGBColorSpace;
    map.magFilter = THREE.NearestFilter;
  }
  return { frontage, mark };
});

// Kaiseki is composed as distinct pieces of waterfront infrastructure, not an
// even scattering of props. Profiles describe purpose-built, continuous skins.
export function buildFlagship(scene, track, textures, environment, assets) {
  const group = new THREE.Group();
  group.name = "kaiseki-waterfront";
  scene.add(group);
  const ceramic = new THREE.MeshLambertMaterial({
    color: 0xe6e7db,
    map: textures.concrete,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const underside = new THREE.MeshLambertMaterial({
    color: 0x384b65,
    map: textures.paint,
    flatShading: true,
  });
  const metal = new THREE.MeshLambertMaterial({
    color: 0x36526a,
    flatShading: true,
  });
  const glass = new THREE.MeshLambertMaterial({
    color: 0x244d69,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const warm = new THREE.MeshBasicMaterial({ color: 0xe4b682 });
  const cyan = new THREE.MeshBasicMaterial({ color: 0x38cecb });
  const red = new THREE.MeshLambertMaterial({
    color: 0xa63b3e,
    flatShading: true,
  });
  const frontage = new THREE.MeshBasicMaterial({
    map: assets.frontage,
    side: THREE.DoubleSide,
  });
  const mark = new THREE.MeshBasicMaterial({
    map: assets.mark,
    side: THREE.DoubleSide,
  });
  const cube = new THREE.BoxGeometry(1, 1, 1),
    batches = new Map(),
    dummy = new THREE.Object3D();
  function frame(u, branch = 0) {
    const f = track.frame(u * track.length, branch);
    f.right.y = 0;
    f.right.normalize();
    return f;
  }
  function point(f, x, y, z = 0) {
    return f.p
      .clone()
      .addScaledVector(f.right, x)
      .addScaledVector(UP, y)
      .addScaledVector(f.tangent, z);
  }
  function beam(material, a, b, width, depth = width) {
    if (!batches.has(material)) batches.set(material, []);
    const delta = b.clone().sub(a);
    dummy.position.copy(a).lerp(b, 0.5);
    dummy.quaternion.setFromUnitVectors(UP, delta.clone().normalize());
    dummy.scale.set(width, delta.length(), depth);
    dummy.updateMatrix();
    batches.get(material).push(dummy.matrix.clone());
  }
  function sheet(
    points,
    material,
    uv = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    shade = 1,
  ) {
    const g = new THREE.BufferGeometry(),
      positions = [],
      coords = [],
      colors = [];
    for (const i of [0, 2, 1, 0, 3, 2]) {
      positions.push(...points[i].toArray());
      coords.push(...uv[i]);
      colors.push(shade, shade, shade);
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(coords, 2));
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, material));
  }
  function sweep(start, end, profile, material, branch = 0) {
    const steps = Math.ceil(((end - start) * track.length) / 9),
      verts = [],
      uv = [];
    for (let i = 0; i < steps; i++) {
      const a = frame(start + ((end - start) * i) / steps, branch),
        b = frame(start + ((end - start) * (i + 1)) / steps, branch);
      const local = (f, [x, y]) =>
        y === -50
          ? new THREE.Vector3(
              f.p.x + f.right.x * x,
              environment.heightAt(
                f.p.x + f.right.x * x,
                f.p.z + f.right.z * x,
              ) - 3,
              f.p.z + f.right.z * x,
            )
          : point(f, x, y);
      for (let j = 0; j < profile.length - 1; j++) {
        const p = [
          local(a, profile[j]),
          local(b, profile[j]),
          local(b, profile[j + 1]),
          local(a, profile[j + 1]),
        ];
        for (const index of [0, 2, 1, 0, 3, 2]) {
          verts.push(...p[index].toArray());
          uv.push(
            ...[
              [i / 2, j / 2],
              [(i + 1) / 2, j / 2],
              [(i + 1) / 2, (j + 1) / 2],
              [i / 2, (j + 1) / 2],
            ][index],
          );
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, material));
  }
  function waterfront(start, end, branch = 0, side = 1) {
    const w = track.config.width;
    sweep(
      start,
      end,
      [
        [w + 34, -50],
        [w + 34, 21],
        [w + 14, 21],
        [w + 14, 13],
        [w + 2, 10.5],
        [w + 2, 9.7],
        [w + 7, 9.7],
        [w + 7, -5],
        [w + 4, -5],
        [w + 4, -50],
      ].map(([x, y]) => [x * side, y]),
      ceramic,
      branch,
    );
    sweep(
      start,
      end,
      [
        [w + 7, -4.7],
        [w + 7, -3.8],
        [w + 22, -3.8],
      ].map(([x, y]) => [x * side, y]),
      underside,
      branch,
    );
    const bays = Math.floor(((end - start) * track.length) / 14);
    for (let i = 0; i < bays; i++) {
      const u = start + ((end - start) * (i + 0.5)) / bays,
        f = frame(u, branch),
        half = (((end - start) * track.length) / bays) * 0.46;
      f.right.multiplyScalar(side);
      sheet(
        [
          point(f, w + 6.8, 0, -half),
          point(f, w + 6.8, 0, half),
          point(f, w + 6.8, 8, half),
          point(f, w + 6.8, 8, -half),
        ],
        frontage,
      );
      beam(
        metal,
        point(f, w + 6.6, -4, -half),
        point(f, w + 6.6, 9.6, -half),
        0.38,
        0.45,
      );
      beam(
        cyan,
        point(f, w + 2, 9.4, -half),
        point(f, w + 2, 9.4, half),
        0.1,
        0.14,
      );
      beam(
        metal,
        point(f, w + 7.2, 9, -half),
        point(f, w + 7.2, 9, half),
        0.15,
        0.3,
      );
      if (i % 3 === 0)
        sheet(
          [
            point(f, w + 6.5, 8.5, -5.5),
            point(f, w + 6.5, 8.5, 5.5),
            point(f, w + 6.5, 9.8, 5.5),
            point(f, w + 6.5, 9.8, -5.5),
          ],
          mark,
        );
      // Occupied upper terraces have real balcony depth, rather than window grids.
      for (const y of [13.5, 18]) {
        beam(
          metal,
          point(f, w + 13, y, -half),
          point(f, w + 13, y, half),
          0.13,
          0.2,
        );
        beam(
          ceramic,
          point(f, w + 15, y - 1.3, -half),
          point(f, w + 15, y - 1.3, half),
          0.6,
          4,
        );
        for (const z of [-half, half])
          beam(
            metal,
            point(f, w + 13, y - 1.2, z),
            point(f, w + 13, y, z),
            0.12,
            0.12,
          );
        sheet(
          [
            point(f, w + 14, y - 1.1, -half),
            point(f, w + 14, y - 1.1, half),
            point(f, w + 14, y + 1.2, half),
            point(f, w + 14, y + 1.2, -half),
          ],
          glass,
        );
      }
    }
  }
  // 01: intimate frontage → covered interchange → open harbor reveal.
  waterfront(0.008, 0.105);
  // The return route approaches the occupied terraces from a different height.
  waterfront(0.785, 0.865);
  for (let u = 0.115; u < 0.185; u += 0.0045) {
    const f = frame(u),
      w = f.width;
    beam(underside, point(f, -w, 13.7), point(f, w, 13.7), 0.65, 1);
    beam(cyan, point(f, -w + 1, 13.2), point(f, w - 1, 13.2), 0.12, 0.18);
    for (const side of [-1, 1])
      beam(
        metal,
        point(f, side * (w - 0.4), 8),
        point(f, side * (w - 1), 13.7),
        0.22,
        0.4,
      );
  }
  // 02: a single identifiable ferry-terminal roof, anchored to a pile-supported quay.
  const terminal = frame(0.226),
    origin = point(terminal, terminal.width + 56, -terminal.p.y + 1);
  const terminalPoint = ([x, y, z]) =>
    origin
      .clone()
      .addScaledVector(terminal.right, x)
      .addScaledVector(UP, y)
      .addScaledVector(terminal.tangent, z);
  const roof = [];
  for (let z = -54; z <= 54; z += 6) {
    const arch = Math.sin(((z + 54) / 108) * Math.PI);
    roof.push({ z, y: 16 + arch * 22 });
  }
  for (let i = 0; i < roof.length - 1; i++) {
    const a = roof[i],
      b = roof[i + 1];
    sheet(
      [
        terminalPoint([-25, a.y, a.z]),
        terminalPoint([25, a.y - 5, a.z]),
        terminalPoint([25, b.y - 5, b.z]),
        terminalPoint([-25, b.y, b.z]),
      ],
      ceramic,
    );
    sheet(
      [
        terminalPoint([-25, 3, a.z]),
        terminalPoint([-25, 3, b.z]),
        terminalPoint([-25, b.y, b.z]),
        terminalPoint([-25, a.y, a.z]),
      ],
      glass,
    );
    beam(
      red,
      terminalPoint([-26, a.y + 0.4, a.z]),
      terminalPoint([-26, b.y + 0.4, b.z]),
      0.35,
      0.5,
    );
    if (i % 2 === 0) {
      beam(
        metal,
        terminalPoint([-25, 2, a.z]),
        terminalPoint([-25, a.y, a.z]),
        0.4,
        0.6,
      );
      beam(
        warm,
        terminalPoint([-24.8, 4, a.z]),
        terminalPoint([-24.8, a.y - 2, a.z]),
        0.1,
        0.2,
      );
    }
  }
  for (const x of [-27, 27])
    for (const z of [-50, -25, 0, 25, 50]) {
      const p = terminalPoint([x, 0, z]);
      beam(
        ceramic,
        new THREE.Vector3(p.x, environment.heightAt(p.x, p.z) - 3, p.z),
        p.clone().addScaledVector(UP, 2),
        2.5,
        3,
      );
    }
  sheet(
    [
      terminalPoint([-30, 2, -58]),
      terminalPoint([30, 2, -58]),
      terminalPoint([30, 2, 58]),
      terminalPoint([-30, 2, 58]),
    ],
    underside,
  );
  sheet(
    [
      terminalPoint([-25, 10, -48]),
      terminalPoint([-25, 10, -17]),
      terminalPoint([-25, 14, -17]),
      terminalPoint([-25, 14, -48]),
    ],
    mark,
  );
  // 03: the split is framed by asymmetrical terrace walls, not duplicated scenery.
  waterfront(0.31, 0.385, -1, -1);
  // 04: the landing has a visible portal silhouette and structural destination.
  const landing = frame(0.682),
    w = landing.width;
  for (const side of [-1, 1]) {
    const foot = point(landing, side * (w + 7), -50);
    foot.y = environment.heightAt(foot.x, foot.z) - 2;
    const high = point(landing, side * (w + 8), 23),
      tip = point(landing, side * (w + 3), 29);
    beam(ceramic, foot, high, 3.5, 6);
    beam(ceramic, high, tip, 2.5, 6);
    beam(
      cyan,
      point(landing, side * (w + 5), 5),
      point(landing, side * (w + 5), 22),
      0.13,
      0.2,
    );
  }
  for (const [material, matrices] of batches) {
    const mesh = new THREE.InstancedMesh(cube, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return { group };
}
