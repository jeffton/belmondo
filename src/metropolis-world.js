import * as THREE from "three";

export const METROPOLIS_SIGN_ATLAS =
  "/art/vesper/openai-image-2026-11-12T20-57-54-474Z-ig_0e43dc0e702bde06016af628221f9c87d29805ac5f177e27a2.png";

/** Every architecture test uses the same oriented volume as the visible mesh. */
export function clearsMetropolisRoad(volume, samples, margin = 9) {
  return samples.every((f) => {
    if (f.p.y + 26 < volume.bottom || f.p.y - 12 > volume.top) return true;
    const dx = f.p.x - volume.center.x;
    const dz = f.p.z - volume.center.z;
    const x = Math.max(
      0,
      Math.abs(dx * volume.right.x + dz * volume.right.z) - volume.width / 2,
    );
    const z = Math.max(
      0,
      Math.abs(dx * volume.forward.x + dz * volume.forward.z) -
        volume.depth / 2,
    );
    return Math.hypot(x, z) > f.width + margin;
  });
}

/** Street foundations, inhabited canyon walls and a load-bearing rooftop ribbon. */
export function buildMetropolis(
  scene,
  track,
  textures,
  environment,
  signMap = null,
) {
  const root = new THREE.Group();
  root.name = "metropolis-districts";
  scene.add(root);
  const facade = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    map: textures.concrete,
    flatShading: true,
  });
  const neon = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const batches = new Map();
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  const volumes = [];
  const cornersAt = (center, right, forward, width, depth) =>
    [-1, 1].flatMap((x) =>
      [-1, 1].map((z) =>
        center
          .clone()
          .addScaledVector(right, (x * width) / 2)
          .addScaledVector(forward, (z * depth) / 2),
      ),
    );
  function box(material, center, yaw, dims, color) {
    const key = `${material}:${Math.floor(center.x / 512)}:${Math.floor(center.z / 512)}`;
    if (!batches.has(key)) batches.set(key, { material, parts: [] });
    transform.position.copy(center);
    transform.rotation.set(0, yaw, 0);
    transform.scale.set(...dims);
    transform.updateMatrix();
    batches.get(key).parts.push({ matrix: transform.matrix.clone(), color });
  }
  const samples = environment.terrain.samples;
  const count = Math.ceil(track.length / 76);
  for (let i = 0; i < count; i++) {
    const u = (i + 0.31) / count;
    const finish = track.config.sections.finishStraight;
    // The start district owns these complete streetside spectator footprints.
    if (u < finish[1] - 1 + 0.015 || u > finish[0] - 0.015) continue;
    const branches =
      u > track.config.split[0] && u < track.config.split[1] ? [-1, 1] : [0];
    for (const branch of branches) {
      const f = track.frame(u * track.length, branch);
      const forward = new THREE.Vector3(
        f.tangent.x,
        0,
        f.tangent.z,
      ).normalize();
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      const yaw = Math.atan2(forward.x, forward.z);
      const roofDistrict =
        u > track.config.sections.rooftopClimb[0] &&
        u < track.config.sections.rooftopDescent[1];
      for (const side of [-1, 1]) {
        const width = 28 + (i % 3) * 9;
        const depth = 42 + (i % 2) * 12;
        const center = f.p
          .clone()
          .addScaledVector(right, side * (f.width + width / 2 + 17));
        const feet = cornersAt(center, right, forward, width, depth);
        const heights = feet.map((p) => environment.heightAt(p.x, p.z));
        const bottom = Math.min(...heights) - 2;
        const ground = Math.max(...heights);
        const top = Math.max(
          ground + 24,
          f.p.y + (roofDistrict ? -6 : 72 + ((i * 17 + side * 7 + 137) % 113)),
        );
        const volume = {
          center,
          right,
          forward,
          width,
          depth,
          bottom,
          top,
          u,
          branch,
          side,
        };
        if (!clearsMetropolisRoad(volume, samples)) continue;
        volumes.push(volume);
        const local = (x, y, z) =>
          center
            .clone()
            .addScaledVector(right, x)
            .addScaledVector(forward, z)
            .setY(y);
        const wallColor = i % 3 ? 0x243c51 : 0x433348;
        box(
          "facade",
          local(0, (bottom + top) / 2, 0),
          yaw,
          [width, top - bottom, depth],
          wallColor,
        );
        box(
          "facade",
          local(0, top + 1, 0),
          yaw,
          [width + 1, 2, depth + 1],
          0x5c6a79,
        );
        // Inhabited floors: staggered warm/cool occupancy, service bands and
        // vertical lift spines, not an identical luminous checkerboard.
        const floors = Math.floor((top - ground) / 9);
        for (let floor = 0; floor < floors; floor += 2) {
          const y = ground + 6 + floor * 9;
          const lit = (floor * 7 + i * 3 + side + 11) % 5;
          const color = lit < 2 ? 0xe9b76e : lit === 2 ? 0x52cbd9 : 0x426080;
          const span = width * (lit === 0 ? 0.72 : 0.38);
          box(
            "neon",
            local(-side * width * 0.12, y, -depth / 2 - 0.16),
            yaw,
            [span, 1.1, 0.3],
            color,
          );
          box(
            "neon",
            local(-side * (width / 2 + 0.16), y, 0),
            yaw,
            [0.3, 1.1, depth * 0.65],
            color,
          );
        }
        const lightColor = i % 3 ? 0x45d8e7 : 0xf7ae68;
        box(
          "neon",
          local(-side * (width / 2 + 0.2), (ground + top) / 2, depth * 0.32),
          yaw,
          [0.4, top - ground - 4, 0.65],
          lightColor,
        );
        // Rooftop service machinery belongs to the building, not the racing deck.
        box(
          "facade",
          local(0, top + 4, depth * 0.18),
          yaw,
          [width * 0.42, 6, depth * 0.38],
          0x647383,
        );
      }
    }
  }

  // The lower fork is a covered, inhabited market gallery; the raised fork
  // remains an open skyline roof run. Roof loads go to street-rooted columns,
  // not a floating tunnel tube. Only the already separated middle is enclosed.
  const arcadeParts = [];
  const [splitStart, splitEnd] = track.config.split;
  const arcadeStart = splitStart + (splitEnd - splitStart) * 0.23;
  const arcadeEnd = splitStart + (splitEnd - splitStart) * 0.77;
  const bays = Math.ceil(((arcadeEnd - arcadeStart) * track.length) / 24);
  for (let bay = 0; bay < bays; bay++) {
    const u = arcadeStart + ((arcadeEnd - arcadeStart) * (bay + 0.5)) / bays;
    const f = track.frame(u * track.length, -1);
    const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const yaw = Math.atan2(forward.x, forward.z);
    const depth = ((arcadeEnd - arcadeStart) * track.length) / bays + 1;
    const top = f.p.y + 45;
    const roof = {
      center: f.p.clone(),
      right,
      forward,
      width: f.width * 2 + 38,
      depth,
      bottom: top - 4,
      top,
      u,
      branch: -1,
      kind: "market-roof",
    };
    if (!clearsMetropolisRoad(roof, samples)) continue;
    const columns = [-1, 1].map((side) => {
      const center = f.p.clone().addScaledVector(right, side * (f.width + 16));
      return {
        center,
        right,
        forward,
        width: 2.7,
        depth: 3.2,
        bottom: environment.heightAt(center.x, center.z) - 1,
        top,
        u,
        branch: -1,
        kind: "market-column",
      };
    });
    if (!columns.every((column) => clearsMetropolisRoad(column, samples)))
      continue;
    box(
      "facade",
      f.p.clone().setY(top - 2),
      yaw,
      [roof.width, 4, depth],
      0x34465c,
    );
    arcadeParts.push(roof);
    for (const [index, column] of columns.entries()) {
      const center = column.center.clone().setY((column.bottom + top) / 2);
      box("facade", center, yaw, [2.5, top - column.bottom, 3], 0x6a6470);
      const glow = column.center.clone().setY(f.p.y + 26);
      box("neon", glow, yaw, [2.6, 1, 3.1], index ? 0xf4b274 : 0x50dbe5);
      arcadeParts.push(column);
    }
  }

  const positions = [];
  const gleams = [],
    gleamColors = [];
  const supports = [];
  const addQuad = (points) => {
    for (const n of [0, 2, 1, 0, 3, 2]) positions.push(...points[n].toArray());
  };
  const stations = Math.ceil(track.length / 18);
  for (let i = 0; i < stations; i++) {
    const u = i / stations;
    const next = (i + 1) / stations;
    // No slab across a split transition or a genuinely missing racing deck.
    if (track.gap(u) || track.gap(next)) continue;
    const split = track.config.split;
    if ((u < split[0] && next > split[0]) || (u < split[1] && next > split[1]))
      continue;
    for (const branch of u >= split[0] && next <= split[1] ? [-1, 1] : [0]) {
      const a = track.frame(u * track.length, branch);
      const b = track.frame(next * track.length, branch);
      const ba = track.bounds(u * track.length, branch);
      const bb = track.bounds(next * track.length, branch);
      const endS = (u + (next - u) * 0.4) * track.length;
      const gleamEnd = track.frame(endS, branch);
      const gleamBounds = track.bounds(endS, branch);
      // Broken reflected-light strokes on the wet-looking deck, not bloom,
      // realtime reflection passes or a new racing-line/boost symbol.
      for (const side of [-1, 1]) {
        const edgeA = side < 0 ? ba.clipMin : ba.clipMax;
        const edgeB = side < 0 ? gleamBounds.clipMin : gleamBounds.clipMax;
        const inset = side * -3;
        const streak = [
          a.p
            .clone()
            .addScaledVector(a.right, edgeA + inset)
            .addScaledVector(a.up, 0.035),
          a.p
            .clone()
            .addScaledVector(a.right, edgeA + inset + 0.7)
            .addScaledVector(a.up, 0.035),
          gleamEnd.p
            .clone()
            .addScaledVector(gleamEnd.right, edgeB + inset + 0.7)
            .addScaledVector(gleamEnd.up, 0.035),
          gleamEnd.p
            .clone()
            .addScaledVector(gleamEnd.right, edgeB + inset)
            .addScaledVector(gleamEnd.up, 0.035),
        ];
        const color = new THREE.Color((i + side) % 3 ? 0x345963 : 0x655344);
        for (const n of [0, 2, 1, 0, 3, 2]) {
          gleams.push(...streak[n].toArray());
          gleamColors.push(color.r, color.g, color.b);
        }
      }
      const top = [
        a.p
          .clone()
          .addScaledVector(a.right, ba.clipMin)
          .addScaledVector(a.up, -3.5),
        a.p
          .clone()
          .addScaledVector(a.right, ba.clipMax)
          .addScaledVector(a.up, -3.5),
        b.p
          .clone()
          .addScaledVector(b.right, bb.clipMax)
          .addScaledVector(b.up, -3.5),
        b.p
          .clone()
          .addScaledVector(b.right, bb.clipMin)
          .addScaledVector(b.up, -3.5),
      ];
      // Reject a volume over another live route, including the full hull and
      // bank envelope. In these views the existing bridge supports carry it.
      const lowerRoute = samples.some(
        (f) =>
          f.p.y < Math.min(a.p.y, b.p.y) - 12 &&
          top.some((p) => Math.hypot(p.x - f.p.x, p.z - f.p.z) < f.width + 12),
      );
      if (lowerRoute) continue;
      const foot = top.map((p) =>
        p.clone().setY(environment.heightAt(p.x, p.z) - 1),
      );
      if (foot.some((p, j) => p.y >= top[j].y)) continue;
      addQuad(top);
      for (let j = 0; j < 4; j++) {
        const k = (j + 1) % 4;
        addQuad([top[j], foot[j], foot[k], top[k]]);
      }
      supports.push({ u, branch, top, foot });
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  const foundationUV = [];
  for (let i = 0; i < positions.length; i += 3)
    foundationUV.push(
      (positions[i] + positions[i + 2]) / 32,
      positions[i + 1] / 24,
    );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(foundationUV, 2),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const ribbon = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({
      color: 0x25364b,
      map: textures.concrete,
      flatShading: true,
      side: THREE.DoubleSide,
    }),
  );
  ribbon.name = "occupied-rooftop-foundations";
  root.add(ribbon);

  const gleamGeometry = new THREE.BufferGeometry();
  gleamGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(gleams, 3),
  );
  gleamGeometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(gleamColors, 3),
  );
  gleamGeometry.computeBoundingSphere();
  const wetLight = new THREE.Mesh(
    gleamGeometry,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    }),
  );
  wetLight.name = "broken-neon-deck-reflections";
  root.add(wetLight);

  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  for (const { material, parts } of batches.values()) {
    const mesh = new THREE.InstancedMesh(
      boxGeometry,
      material === "neon" ? neon : facade,
      parts.length,
    );
    parts.forEach((p, i) => {
      mesh.setMatrixAt(i, p.matrix);
      mesh.setColorAt(i, tint.setHex(p.color));
    });
    mesh.computeBoundingSphere();
    root.add(mesh);
  }

  if (signMap) {
    const signMaterial = new THREE.MeshBasicMaterial({
      map: signMap,
      side: THREE.DoubleSide,
    });
    for (const [index, u] of [0.09, 0.31, 0.57, 0.86].entries()) {
      const f = track.frame(u * track.length);
      const side = index % 2 ? 1 : -1;
      const center = f.p
        .clone()
        .addScaledVector(f.right, side * (f.width + 28));
      center.y = f.p.y + 19;
      const forward = new THREE.Vector3(
        f.tangent.x,
        0,
        f.tangent.z,
      ).normalize();
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      const ground = environment.heightAt(center.x, center.z) - 1;
      const signVolume = {
        center,
        forward,
        right,
        width: 18,
        depth: 2,
        bottom: ground,
        top: center.y + 9,
      };
      if (!clearsMetropolisRoad(signVolume, samples)) continue;
      const pole = new THREE.Mesh(boxGeometry, facade);
      pole.scale.set(1.5, center.y + 9 - ground, 1.5);
      pole.position.copy(center).setY((ground + center.y + 9) / 2);
      root.add(pole);
      const shape = new THREE.PlaneGeometry(18, 18);
      const uv = shape.attributes.uv;
      const col = index % 2,
        row = Math.floor(index / 2);
      for (let i = 0; i < uv.count; i++)
        uv.setXY(
          i,
          col * 0.5 + uv.getX(i) * 0.5,
          (1 - row) * 0.5 + uv.getY(i) * 0.5,
        );
      const sign = new THREE.Mesh(shape, signMaterial);
      sign.position.copy(center);
      sign.rotation.y = Math.atan2(-f.tangent.x, -f.tangent.z);
      sign.name = "vesper-municipal-sign";
      root.add(sign);
    }
  }
  root.userData.volumes = volumes;
  root.userData.arcadeParts = arcadeParts;
  root.userData.supports = supports;
  root.userData.sceneryInstances = [...batches.values()].reduce(
    (n, b) => n + b.parts.length,
    0,
  );
  return { update() {} };
}
