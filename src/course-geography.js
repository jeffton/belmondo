import * as THREE from "three";

/** Waterfront frontage leaves the entire authored finish straight to spectators. */
export function getWaterfrontDistricts(track) {
  const [start, end] = track.config.sections.finishStraight;
  const departure = end - 1 + 0.015;
  return [
    [departure, 0.102, 0, 1, 0],
    [departure, 0.088, 0, -1, 1],
    [0.306, 0.365, -1, -1, 2],
    [0.355, 0.411, 1, 1, 3],
    [0.555, 0.604, 0, -1, 3],
    [0.704, 0.745, 0, 1, 2],
    [0.925, start - 0.015, 0, -1, 1],
  ];
}

export function rockStrataTexture() {
  const pixels = new Uint8Array(64 * 128 * 4);
  let seed = 4171;
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 64; x++) {
      seed = (seed * 16807) % 2147483647;
      const seam = (y + Math.round(2 * Math.sin(x * 0.09))) % 32;
      const bedding = seam < 3 ? -45 : seam < 7 ? 15 : 0;
      const grain = (seed % 29) - 14;
      const value = 188 + bedding + grain + Math.round(Math.sin(y * 0.4) * 9);
      pixels.set([value, value, value, 255], (y * 64 + x) * 4);
    }
  const texture = new THREE.DataTexture(pixels, 64, 128);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Solid geography around an open racing void; this is not a filled heightfield. */
export function buildCourseGeography(scene, track, textures, environment) {
  const root = new THREE.Group();
  root.name = "course-geography";
  scene.add(root);
  const tunnel = track.config.sections.mountainTunnel;
  if (tunnel) {
    const positions = [],
      colors = [],
      uv = [];
    function triangle(a, b, c, color) {
      const tint = new THREE.Color(color);
      for (const p of [a, b, c]) {
        positions.push(...p.toArray());
        colors.push(tint.r, tint.g, tint.b);
        uv.push((p.x + p.z * 0.3) / 28, p.y / 22);
      }
    }
    const count = Math.ceil(((tunnel[1] - tunnel[0]) * track.length) / 12);
    const profiles = [];
    for (let i = 0; i <= count; i++) {
      const f = track.frame(
        (tunnel[0] + ((tunnel[1] - tunnel[0]) * i) / count) * track.length,
        track.config.night ? -1 : 0,
      );
      const right = new THREE.Vector3(f.tangent.z, 0, -f.tangent.x).normalize();
      const outerGround = (x) => {
        const p = f.p.clone().addScaledVector(right, x);
        return environment.heightAt(p.x, p.z) - f.p.y - 1;
      };
      const width = f.width + 4;
      const profile = track.config.night
        ? [
            [-180, outerGround(-180)],
            [-130, 18],
            [-65, 29],
            [0, 32],
            [70, 29],
            [135, 18],
            [180, outerGround(180)],
            [width, -4],
            [width, 22],
            [-width, 22],
            [-width, -4],
          ]
        : [
            [-180, outerGround(-180)],
            [-130, Math.max(42, outerGround(-130) + 24)],
            [-65, 72 + 8 * Math.sin(i * 0.35)],
            [0, 99 + 13 * Math.sin(i * 0.19)],
            [70, 77 + 9 * Math.sin(i * 0.27)],
            [135, Math.max(36, outerGround(135) + 22)],
            [180, outerGround(180)],
            [width, -4],
            [width, 22],
            [-width, 22],
            [-width, -4],
          ];
      const fraction = i / count;
      const entry = 1 - THREE.MathUtils.smoothstep(fraction, 0, 0.18);
      const exit = THREE.MathUtils.smoothstep(fraction, 0.82, 1);
      const forward = new THREE.Vector3(
        f.tangent.x,
        0,
        f.tangent.z,
      ).normalize();
      // Recessed strata/buttresses break the portal into irregular rock planes.
      // The tunnel void and outer grounded feet retain their exact stations.
      const ledges = [0, 16, 35, 52, 26, 10, 0, 0, 0, 0, 0];
      profiles.push({
        profile,
        points: profile.map(([x, y], j) =>
          f.p
            .clone()
            .addScaledVector(right, x)
            .addScaledVector(
              forward,
              track.config.night ? 0 : ledges[j] * (entry - exit),
            )
            .add(new THREE.Vector3(0, y, 0)),
        ),
      });
    }
    for (let i = 0; i < profiles.length - 1; i++) {
      const a = profiles[i].points,
        b = profiles[i + 1].points;
      for (let j = 0; j < a.length; j++) {
        const next = (j + 1) % a.length;
        const color =
          j === 8
            ? 0x66504a
            : j >= 7
              ? 0x8b6851
              : (i + j) % 4
                ? 0xae805f
                : 0x8c6654;
        triangle(a[j], b[next], b[j], color);
        triangle(a[j], a[next], b[next], color);
      }
    }
    for (const end of [0, profiles.length - 1]) {
      const { profile, points } = profiles[end];
      const faces = THREE.ShapeUtils.triangulateShape(
        profile.map(([x, y]) => new THREE.Vector2(x, y)),
        [],
      );
      for (const [index, [a, b, c]] of faces.entries())
        triangle(
          points[a],
          points[b],
          points[c],
          [0xa37b61, 0x8f6e59, 0xb38d6d][index % 3],
        );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    const mountain = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        map: rockStrataTexture(),
        flatShading: true,
        side: THREE.DoubleSide,
      }),
    );
    mountain.name = "bored-mountain-mass";
    root.add(mountain);
    mountain.userData.range = tunnel;
    mountain.userData.branch = track.config.night ? -1 : 0;
    mountain.userData.voidHalfWidth = track.config.width + 4;
    mountain.userData.voidHeight = 22;
    mountain.userData.groundingContacts = profiles.flatMap(({ points }) => [
      points[0],
      points[6],
    ]);
  }
  const bridges = [
    {
      range: track.config.sections.upperBridge,
      branch: 0,
      name: "upper-crossing-truss",
    },
    {
      range: track.config.sections.hillOverpass,
      branch: 1,
      name: "hill-route-truss",
    },
  ].filter(({ range }) => range);
  for (const { range: bridge, branch, name } of bridges) {
    const material = new THREE.MeshLambertMaterial({
      color: 0x687d85,
      map: textures.edge,
      flatShading: true,
    });
    const matrices = [],
      transform = new THREE.Object3D(),
      up = new THREE.Vector3(0, 1, 0);
    function beam(a, b, width, depth) {
      const delta = b.clone().sub(a);
      transform.position.copy(a).lerp(b, 0.5);
      transform.quaternion.setFromUnitVectors(up, delta.clone().normalize());
      transform.scale.set(width, delta.length(), depth);
      transform.updateMatrix();
      matrices.push(transform.matrix.clone());
    }
    const groundingContacts = [];
    const count = Math.ceil(((bridge[1] - bridge[0]) * track.length) / 35);
    for (let i = 0; i < count; i++) {
      const a = track.frame(
        (bridge[0] + ((bridge[1] - bridge[0]) * i) / count) * track.length,
        branch,
      );
      const b = track.frame(
        (bridge[0] + ((bridge[1] - bridge[0]) * (i + 1)) / count) *
          track.length,
        branch,
      );
      for (const side of [-1, 1]) {
        const point = (f, y) =>
          f.p
            .clone()
            .addScaledVector(f.right, side * (f.width + 3))
            .add(new THREE.Vector3(0, y, 0));
        if (branch && environment.supportClearAt(a.u, branch)) {
          const top = point(a, -12);
          const foot = top.clone();
          foot.y = environment.heightAt(foot.x, foot.z) - 1;
          if (foot.y < top.y) {
            beam(foot, top, 3.2, 3.2);
            groundingContacts.push(foot);
          }
        }
        beam(point(a, -3), point(b, -3), 1.4, 1.4);
        beam(point(a, -12), point(b, -12), 1.6, 1.6);
        beam(point(a, -3), point(a, -12), 1.2, 1.2);
        beam(point(a, i % 2 ? -3 : -12), point(b, i % 2 ? -12 : -3), 0.9, 0.9);
      }
    }
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      material,
      matrices.length,
    );
    mesh.name = name;
    mesh.userData.groundingContacts = groundingContacts;
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  return root;
}
