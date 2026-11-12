import * as THREE from "three";
import { createAdvertising } from "./advertising.js";
import { getWaterfrontDistricts } from "./course-geography.js";

const UP = new THREE.Vector3(0, 1, 0);

export function loadFlagshipAssets() {
  const loader = new THREE.TextureLoader();
  const frontage = loader.load(
    "/art/openai-image-2026-11-11T17-36-07-009Z-ig_04f2669c5602f968016af4a757ff0487d2acc6752b83e2b65f.png",
  );
  const mark = loader.load("/art/belmondo-mark.png");
  for (const map of [frontage, mark]) {
    map.colorSpace = THREE.SRGBColorSpace;
    map.magFilter = THREE.NearestFilter;
  }
  return { frontage, mark };
}

// An occupied waterfront in six acts. Architecture is authored in road frames;
// its geometry is collected into material/spatial batches, never per-shop meshes.
export function buildFlagship(scene, track, textures, environment, assets) {
  const group = new THREE.Group();
  group.name = "kaiseki-waterfront";
  scene.add(group);
  const advertising = createAdvertising(group);
  let tenant = 0;
  const surface = (color, map) =>
    new THREE.MeshLambertMaterial({
      color,
      map,
      flatShading: true,
      side: THREE.DoubleSide,
    });
  const ceramic = surface(0xe4e8dd, textures.concrete);
  const dark = surface(0x223a50, textures.paint);
  const metal = surface(0x587080);
  const glass = surface(0x285771);
  const vermilion = surface(0xb8424c, textures.paint);
  const light = (color) => new THREE.MeshBasicMaterial({ color });
  const cyan = light(0x53eee5);
  const warm = light(0xffce8b);
  const foliage = surface(0x536b49);
  const frontage = new THREE.MeshBasicMaterial({
    map: assets.frontage,
    side: THREE.DoubleSide,
  });
  const mark = new THREE.MeshBasicMaterial({
    map: assets.mark,
    side: THREE.DoubleSide,
  });
  const sheets = new Map();
  const beams = new Map();
  const transform = new THREE.Object3D();
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const quadUV = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];

  function roomUV(index, upper = false) {
    const u = (index % 4) / 4;
    const v = index < 4 ? 0.5 : 0;
    return [
      [u + 0.002, v + (upper ? 0.12 : 0.002)],
      [u + 0.248, v + (upper ? 0.12 : 0.002)],
      [u + 0.248, v + (upper ? 0.38 : 0.498)],
      [u + 0.002, v + (upper ? 0.38 : 0.498)],
    ];
  }
  function frame(u, branch = 0) {
    return track.frame(u * track.length, branch);
  }
  function point(f, x, y, z = 0) {
    // Architecture stays vertical even where the race deck climbs.
    const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize();
    return f.p
      .clone()
      .addScaledVector(f.right, x)
      .addScaledVector(UP, y)
      .addScaledVector(forward, z);
  }
  function bucket(collection, material, p) {
    if (!collection.has(material)) collection.set(material, new Map());
    const chunks = collection.get(material);
    const key = `${Math.floor(p.x / 256)}:${Math.floor(p.z / 256)}`;
    if (!chunks.has(key)) chunks.set(key, []);
    return chunks.get(key);
  }
  function beam(material, a, b, width, depth = width) {
    const delta = b.clone().sub(a);
    transform.position.copy(a).lerp(b, 0.5);
    transform.quaternion.setFromUnitVectors(UP, delta.clone().normalize());
    transform.scale.set(width, delta.length(), depth);
    transform.updateMatrix();
    bucket(beams, material, transform.position).push(transform.matrix.clone());
  }
  function sheet(points, material, uv = quadUV) {
    const center = points
      .reduce((p, v) => p.add(v), new THREE.Vector3())
      .multiplyScalar(0.25);
    bucket(sheets, material, center).push({ points, uv });
  }
  function panel(f, x, bottom, top, a, b, material, uv = quadUV) {
    sheet(
      [
        point(f, x, bottom, a),
        point(f, x, bottom, b),
        point(f, x, top, b),
        point(f, x, top, a),
      ],
      material,
      uv,
    );
  }
  function slab(f, near, far, y, a, b, material) {
    sheet(
      [
        point(f, near, y, a),
        point(f, far, y, a),
        point(f, far, y, b),
        point(f, near, y, b),
      ],
      material,
    );
  }
  function pier(f, x, z, top, size = 1.5) {
    const p = point(f, x, top, z);
    const foot = new THREE.Vector3(
      p.x,
      environment.heightAt(p.x, p.z) - 2,
      p.z,
    );
    beam(ceramic, foot, p, size, size * 1.3);
  }
  function sign(f, side, x, y, z, size) {
    advertising.facade(
      point(f, side * (x - 0.2), y + size / 2, z),
      Math.atan2(-side * f.right.x, -side * f.right.z),
      size,
      tenant++,
    );
    beam(
      cyan,
      point(f, side * (x - 0.12), y - 0.25, z - size * 0.5),
      point(f, side * (x - 0.12), y + size + 0.25, z - size * 0.5),
      0.18,
      0.24,
    );
  }

  // Continuous folded podiums follow both real edges of a bay, including branch
  // narrowing. The facade has deep shop recesses and occupied upper terraces.
  function district(start, end, branch, side, variant = 0) {
    const bays = Math.ceil(((end - start) * track.length) / 25);
    for (let i = 0; i < bays; i++) {
      const a = frame(start + ((end - start) * i) / bays, branch);
      const b = frame(start + ((end - start) * (i + 1)) / bays, branch);
      const u = start + ((end - start) * (i + 0.5)) / bays;
      const f = frame(u, branch);
      const w = f.width;
      const half = a.p.distanceTo(b.p) * 0.45;
      const workshop = variant === 2;
      const tall = workshop
        ? 15 + (i % 2) * 3
        : 22 + ((i + variant * 2) % 4) * 6;
      const profile = [
        [5, -5],
        [5, 9],
        [3.5, 10],
        [3.5, 11],
        [13, 11],
        [13, tall - 5],
        [18, tall],
        [34, tall],
        [34, -5],
      ];
      for (let j = 0; j < profile.length - 1; j++) {
        // These two elevations are genuinely open shop/balcony bays. An
        // opaque skin here would bury the recessed facade and glazing.
        if (j === 0 || j === 4) continue;
        const [x1, y1] = profile[j];
        const [x2, y2] = profile[j + 1];
        sheet(
          [
            point(a, side * (a.width + x1), y1),
            point(b, side * (b.width + x1), y1),
            point(b, side * (b.width + x2), y2),
            point(a, side * (a.width + x2), y2),
          ],
          ceramic,
        );
      }
      sheet(
        [
          point(a, side * (a.width + 5), -5),
          point(b, side * (b.width + 5), -5),
          point(b, side * (b.width + 5), 0),
          point(a, side * (a.width + 5), 0),
        ],
        dark,
      );
      // Shops occupy a grounded urban terrace, not another viaduct on stilts.
      for (const offset of [5, 34]) {
        const topA = point(a, side * (a.width + offset), -5);
        const topB = point(b, side * (b.width + offset), -5);
        const footA = topA
          .clone()
          .setY(environment.heightAt(topA.x, topA.z) - 0.8);
        const footB = topB
          .clone()
          .setY(environment.heightAt(topB.x, topB.z) - 0.8);
        sheet([topA, topB, footB, footA], dark);
      }
      slab(f, side * (w + 5), side * (w + 34), -5, -half, half, dark);
      panel(f, side * (w + 6.5), 0, 8.7, -half, half, dark);
      // Only the interior glazing is sampled from the image. Physical jambs,
      // recessed rooms and folded awnings supply the facade's actual depth.
      for (let shop = 0; shop < 3; shop++) {
        const span = (half * 2) / 3;
        const z = -half + (shop + 0.5) * span;
        const left = z - span / 2 + 0.45;
        const right = z + span / 2 - 0.45;
        panel(
          f,
          side * (w + 6.15),
          0.7,
          6.15,
          left,
          right,
          frontage,
          roomUV((i * 3 + shop + variant * 5) % 8),
        );
        for (const edge of [left - 0.22, right + 0.22])
          beam(
            ceramic,
            point(f, side * (w + 5.1), 0, edge),
            point(f, side * (w + 5.1), 8.8, edge),
            0.45,
            0.7,
          );
        sheet(
          [
            point(f, side * (w + 3.8), 6.3, left - 0.2),
            point(f, side * (w + 3.8), 6.3, right + 0.2),
            point(f, side * (w + 6.4), 6.9, right + 0.2),
            point(f, side * (w + 6.4), 6.9, left - 0.2),
          ],
          (i + shop + variant) % 3 === 0 ? vermilion : metal,
        );
        beam(
          warm,
          point(f, side * (w + 4.4), 6.15, left),
          point(f, side * (w + 4.4), 6.15, right),
          0.08,
          0.12,
        );
      }
      for (const z of [-half, 0, half]) {
        beam(
          metal,
          point(f, side * (w + 4.8), -4, z),
          point(f, side * (w + 4.8), 9.6, z),
          0.45,
          0.55,
        );
      }
      // Broad asymmetrical awnings read at speed; neon is architectural trim.
      const neon = i % 3 === 0 ? warm : cyan;
      beam(
        neon,
        point(f, side * (w + 3.35), 10, -half * 0.62),
        point(f, side * (w + 3.35), 10, half * 0.62),
        0.18,
        0.3,
      );
      // Upper galleries are occasional inhabited details, not a continuous
      // identical balcony belt around the lap. Workshops have low sawtooth roofs.
      for (let y = 14; !workshop && i % 3 !== 1 && y < tall - 5; y += 5) {
        slab(
          f,
          side * (w + 10),
          side * (w + 17),
          y - 1.5,
          -half,
          half,
          ceramic,
        );
        panel(
          f,
          side * (w + 13.15),
          y - 1.1,
          y + 1.7,
          -half + 1,
          half - 1,
          glass,
        );
        beam(
          metal,
          point(f, side * (w + 10), y, -half),
          point(f, side * (w + 10), y, half),
          0.18,
          0.2,
        );
        for (const z of [-half, 0, half]) {
          beam(
            metal,
            point(f, side * (w + 10), y - 1.4, z),
            point(f, side * (w + 10), y, z),
            0.15,
          );
        }
        // Warm window recesses, projecting planters and service pipes make the
        // gallery inhabited in silhouette as well as in the interior atlas.
        if ((i + Math.floor(y)) % 2 === 0) {
          panel(
            f,
            side * (w + 13.05),
            y - 0.8,
            y + 1.4,
            -half + 1.2,
            -half * 0.4,
            frontage,
            roomUV((i + Math.floor(y) + variant) % 8, true),
          );
          beam(
            ceramic,
            point(f, side * (w + 10.5), y - 1.2, half * 0.3),
            point(f, side * (w + 10.5), y - 1.2, half * 0.8),
            0.7,
            1.2,
          );
          for (const z of [half * 0.35, half * 0.6, half * 0.8]) {
            sheet(
              [
                point(f, side * (w + 9.8), y - 0.9, z - 0.7),
                point(f, side * (w + 9.5), y + 0.4, z),
                point(f, side * (w + 9.8), y - 0.9, z + 0.8),
                point(f, side * (w + 10.2), y - 2.4, z),
              ],
              foliage,
            );
          }
        }
        if ((i + Math.floor(y)) % 3 === 0)
          beam(
            warm,
            point(f, side * (w + 12.9), y + 1.6, -half + 1),
            point(f, side * (w + 12.9), y + 1.6, 0),
            0.13,
            0.2,
          );
      }
      beam(
        metal,
        point(f, side * (w + 4.5), -3, half - 1.6),
        point(f, side * (w + 4.5), 8.5, half - 1.6),
        0.3,
        0.4,
      );
      beam(
        metal,
        point(f, side * (w + 4.5), 8.5, half - 1.6),
        point(f, side * (w + 7), 9.2, half - 1.6),
        0.3,
        0.4,
      );
      if (variant === 1 && i === Math.floor(bays / 2))
        sign(f, side, w + 4.65, 10.5, 0, 7.2);
      if (workshop) {
        for (const z of [-half * 0.65, 0, half * 0.65]) {
          sheet(
            [
              point(f, side * (w + 18), tall, z - 3),
              point(f, side * (w + 29), tall + 5, z - 3),
              point(f, side * (w + 29), tall + 5, z + 3),
              point(f, side * (w + 18), tall, z + 3),
            ],
            metal,
          );
          panel(f, side * (w + 29), tall, tall + 5, z - 3, z + 3, glass);
        }
      }
      // Roof services and sloping vent fins break the parapet silhouette.
      for (let j = 0; j < (workshop ? 0 : 3); j++) {
        const z = -half * 0.65 + j * half * 0.65;
        beam(
          metal,
          point(f, side * (w + 23), tall + 0.5, z),
          point(f, side * (w + 29), tall + 3.2, z),
          1.5,
          2.4,
        );
      }
      if (i % 4 === 2) {
        beam(
          vermilion,
          point(f, side * (w + 29), tall, 0),
          point(f, side * (w + 29), tall + 12, 0),
          1.3,
          2,
        );
        beam(
          cyan,
          point(f, side * (w + 28), tall + 4, 0),
          point(f, side * (w + 28), tall + 10, 0),
          0.22,
          0.3,
        );
      }
    }
  }

  // 01: opposed shopping galleries, then an open-sided transit interchange.
  for (const spec of getWaterfrontDistricts(track)) district(...spec);
  for (let u = 0.113; u < 0.187; u += 0.006) {
    const f = frame(u);
    const w = f.width;
    for (const side of [-1, 1]) {
      pier(f, side * (w + 6), 0, 17, 1.7);
      beam(
        vermilion,
        point(f, side * (w + 6), 17),
        point(f, side * (w - 3), 22),
        0.8,
        1.6,
      );
      beam(
        ceramic,
        point(f, side * (w + 7), 23),
        point(f, side * 1.5, 20.5),
        1,
        4,
      );
      beam(
        cyan,
        point(f, side * (w + 5), 16),
        point(f, side * (w + 5), 20),
        0.22,
        0.3,
      );
      slab(f, side * (w + 5), side * (w + 25), 15, -11, 11, dark);
    }
    beam(metal, point(f, -w - 6, 21), point(f, w + 6, 21), 0.5, 0.8);
  }

  // 02: a scalloped ferry hall, gangways and mooring structures share one quay.
  const terminal = frame(0.232);
  const baseY = terminal.p.y - 7;
  const terminalPoint = (x, y, z) => {
    const p = point(terminal, terminal.width + 57 + x, 0, z);
    p.y = baseY + y;
    return p;
  };
  const roofY = (z) => 15 + 18 * (1 - Math.abs(z) / 72);
  for (let z = -72; z < 72; z += 8) {
    const y = roofY(z),
      next = roofY(z + 8);
    sheet(
      [
        terminalPoint(-27, y, z),
        terminalPoint(0, y + 5, z),
        terminalPoint(0, next + 5, z + 8),
        terminalPoint(-27, next, z + 8),
      ],
      ceramic,
    );
    sheet(
      [
        terminalPoint(0, y + 5, z),
        terminalPoint(29, y - 6, z),
        terminalPoint(29, next - 6, z + 8),
        terminalPoint(0, next + 5, z + 8),
      ],
      ceramic,
    );
    beam(
      vermilion,
      terminalPoint(-27, y - 1, z),
      terminalPoint(0, y + 4, z),
      0.5,
      0.7,
    );
    sheet(
      [
        terminalPoint(-27, 1, z),
        terminalPoint(-27, 1, z + 8),
        terminalPoint(-27, next, z + 8),
        terminalPoint(-27, y, z),
      ],
      glass,
    );
    beam(
      vermilion,
      terminalPoint(-27.5, y, z),
      terminalPoint(-27.5, next, z + 8),
      0.5,
      0.7,
    );
    beam(
      metal,
      terminalPoint(-27.3, 0, z),
      terminalPoint(-27.3, y, z),
      0.4,
      0.5,
    );
    if (z % 16 === 0)
      beam(
        warm,
        terminalPoint(-27.7, 4, z),
        terminalPoint(-27.7, y - 2, z),
        0.18,
        0.25,
      );
  }
  sheet(
    [
      terminalPoint(-33, 0, -78),
      terminalPoint(37, 0, -78),
      terminalPoint(37, 0, 78),
      terminalPoint(-33, 0, 78),
    ],
    dark,
  );
  // The ferry hall sits on a filled terminal quay; only gangways retain piles.
  const quay = [
    terminalPoint(-33, 0, -78),
    terminalPoint(37, 0, -78),
    terminalPoint(37, 0, 78),
    terminalPoint(-33, 0, 78),
  ];
  for (let i = 0; i < quay.length; i++) {
    const a = quay[i],
      b = quay[(i + 1) % quay.length];
    const segments = Math.ceil(a.distanceTo(b) / 12);
    for (let j = 0; j < segments; j++) {
      const pa = a.clone().lerp(b, j / segments),
        pb = a.clone().lerp(b, (j + 1) / segments);
      sheet(
        [
          pa,
          pb,
          pb.clone().setY(environment.heightAt(pb.x, pb.z) - 1),
          pa.clone().setY(environment.heightAt(pa.x, pa.z) - 1),
        ],
        ceramic,
      );
    }
  }
  for (const z of [-70, -35, 0, 35, 70]) {
    for (const x of [-31, 34, 66]) {
      const p = terminalPoint(x, -1, z);
      beam(
        ceramic,
        new THREE.Vector3(p.x, environment.heightAt(p.x, p.z) - 3, p.z),
        p,
        2.8,
        3.5,
      );
    }
    if (z !== 0) {
      sheet(
        [
          terminalPoint(29, 0, z - 3),
          terminalPoint(74, -1.5, z - 3),
          terminalPoint(74, -1.5, z + 3),
          terminalPoint(29, 0, z + 3),
        ],
        ceramic,
      );
      beam(metal, terminalPoint(71, -12, z), terminalPoint(71, 8, z), 1.4, 1.8);
      beam(warm, terminalPoint(71, 7, z), terminalPoint(71, 9, z), 1.5, 2);
    }
  }
  sheet(
    [
      terminalPoint(-27.8, 8, -44),
      terminalPoint(-27.8, 8, -18),
      terminalPoint(-27.8, 16, -18),
      terminalPoint(-27.8, 16, -44),
    ],
    mark,
  );

  // The entire straight jump corridor is left open. A paired broken-arch
  // landmark sits at the CURRENT landing, well outside even a pitched-up flight.
  const landing = frame(track.config.jump + 0.075);
  for (const side of [-1, 1]) {
    const x = side * (landing.width + 12);
    pier(landing, x, 0, 24, 3.5);
    beam(
      ceramic,
      point(landing, x, 24),
      point(landing, side * (landing.width + 6), 34),
      3,
      5,
    );
    beam(
      vermilion,
      point(landing, x, 24),
      point(landing, side * (landing.width + 5), 33),
      0.9,
      5.3,
    );
    beam(
      cyan,
      point(landing, side * (landing.width + 9.5), 5),
      point(landing, side * (landing.width + 9.5), 24),
      0.3,
      0.4,
    );
  }

  for (const [material, chunks] of sheets) {
    for (const faces of chunks.values()) {
      const positions = [],
        uv = [];
      for (const face of faces) {
        for (const i of [0, 2, 1, 0, 3, 2]) {
          positions.push(...face.points[i].toArray());
          uv.push(...face.uv[i]);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      group.add(new THREE.Mesh(geometry, material));
    }
  }
  for (const [material, chunks] of beams) {
    for (const matrices of chunks.values()) {
      const mesh = new THREE.InstancedMesh(cube, material, matrices.length);
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  advertising.finish();
  return { group };
}
