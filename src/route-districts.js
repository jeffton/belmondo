import * as THREE from "three";
import { rockStrataTexture } from "./course-geography.js";

// Each interval is a place with a purpose, not a lap-wide scatter pattern.
export const ROUTE_DISTRICTS = [
  [
    {
      name: "TIDAL GARDENS",
      start: 0.112,
      end: 0.198,
      side: -1,
      style: "terraces",
    },
    {
      name: "MARINE INSTITUTE",
      start: 0.234,
      end: 0.278,
      side: 1,
      style: "berth",
    },
    {
      name: "HILLSIDE QUARTER",
      start: 0.472,
      end: 0.572,
      side: -1,
      style: "residential",
    },
    {
      name: "BOATBUILDERS",
      start: 0.633,
      end: 0.704,
      side: -1,
      style: "hangar",
    },
    {
      name: "COASTAL STEPS",
      start: 0.905,
      end: 0.942,
      side: 1,
      style: "terraces",
    },
  ],
  [
    {
      name: "COLLECTOR YARD",
      start: 0.055,
      end: 0.142,
      side: 1,
      style: "switchyard",
    },
    { name: "RED CUT", start: 0.149, end: 0.193, side: -1, style: "strata" },
    {
      name: "EXTRACTION FACE",
      start: 0.292,
      end: 0.392,
      side: -1,
      branch: -1,
      style: "strata",
    },
    {
      name: "MAINTENANCE SETTLEMENT",
      start: 0.476,
      end: 0.574,
      side: 1,
      style: "hangar",
    },
    {
      name: "THERMAL EXCHANGE",
      start: 0.745,
      end: 0.826,
      side: -1,
      style: "silos",
    },
    {
      name: "BASALT SHELVES",
      start: 0.862,
      end: 0.931,
      side: 1,
      style: "strata",
    },
  ],
  [
    { name: "FERRY WORKS", start: 0.055, end: 0.118, side: 1, style: "hangar" },
    { name: "BONDED QUAY", start: 0.163, end: 0.213, side: -1, style: "cargo" },
    {
      name: "SHIPWRIGHTS",
      start: 0.276,
      end: 0.324,
      side: -1,
      branch: -1,
      style: "berth",
    },
    {
      name: "PROCESS WORKS",
      start: 0.563,
      end: 0.662,
      side: 1,
      style: "silos",
    },
    { name: "LOWER DOCKS", start: 0.812, end: 0.889, side: -1, style: "cargo" },
    {
      name: "NIGHT TERMINAL",
      start: 0.904,
      end: 0.94,
      side: 1,
      style: "berth",
    },
  ],
];

/** Close, grounded architecture, collected into spatially culled opaque meshes. */
export function buildRouteDistricts(parent, track, textures, environment) {
  const course = ["KAISEKI COAST", "SOLAR ARRAY", "NOCTILUCENT"].indexOf(
    track.config.name,
  );
  const districts = ROUTE_DISTRICTS[course];
  const palette = [
    {
      wall: 0xd4d8c5,
      dark: 0x354955,
      accent: 0xb45c4e,
      glass: 0x315e69,
      ground: 0x65755b,
      rock: 0x768277,
      light: 0xb6ded1,
    },
    {
      wall: 0xc3a686,
      dark: 0x574c48,
      accent: 0x914f39,
      glass: 0x344e5b,
      ground: 0x9f795b,
      rock: 0xad7959,
      light: 0xf5c180,
    },
    {
      wall: 0x9baeb3,
      dark: 0x384b61,
      accent: 0x93566c,
      glass: 0x2e5367,
      ground: 0x566c75,
      rock: 0x687885,
      light: 0x82cbd2,
    },
  ][course];
  const root = new THREE.Group();
  root.name = "route-districts";
  parent.add(root);
  const opaque = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map: textures.concrete,
    flatShading: true,
  });
  const lamps = new THREE.MeshBasicMaterial({ vertexColors: true });
  const unit = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 10).toNonIndexed();
  const rock = new THREE.CylinderGeometry(0.38, 0.5, 1, 5).toNonIndexed();
  for (let i = 0; i < rock.attributes.position.count; i++) {
    const p = rock.attributes.position;
    const x = p.getX(i),
      y = p.getY(i);
    p.setXYZ(i, x + y * 0.2, y + x * 0.1, p.getZ(i));
  }
  rock.computeVertexNormals();
  const batches = new Map();
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const road = environment.terrain.samples;
  const footprints = [];
  let parts = 0;

  function clearFootprint(center, right, forward, width, depth) {
    return road.every((f) => {
      const dx = f.p.x - center.x,
        dz = f.p.z - center.z;
      const x = Math.abs(dx * right.x + dz * right.z) - width / 2;
      const z = Math.abs(dx * forward.x + dz * forward.z) - depth / 2;
      return Math.hypot(Math.max(0, x), Math.max(0, z)) > f.width + 8;
    });
  }
  function emit(
    center,
    yaw,
    dimensions,
    color,
    geometry = unit,
    lit = false,
    stone = false,
  ) {
    const key = `${Math.floor(center.x / 256)}:${Math.floor(center.z / 256)}:${lit ? "light" : stone ? "rock" : "wall"}`;
    if (!batches.has(key))
      batches.set(key, {
        positions: [],
        normals: [],
        uv: [],
        colors: [],
        lit,
        stone,
      });
    const batch = batches.get(key);
    transform.position.copy(center);
    transform.rotation.set(0, yaw, 0);
    transform.scale.set(...dimensions);
    transform.updateMatrix();
    normalMatrix.getNormalMatrix(transform.matrix);
    tint.setHex(color);
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      vertex
        .fromBufferAttribute(geometry.attributes.position, i)
        .applyMatrix4(transform.matrix);
      normal
        .fromBufferAttribute(geometry.attributes.normal, i)
        .applyMatrix3(normalMatrix)
        .normalize();
      batch.positions.push(vertex.x, vertex.y, vertex.z);
      batch.normals.push(normal.x, normal.y, normal.z);
      batch.uv.push(
        geometry.attributes.uv.getX(i) * (stone ? dimensions[0] / 28 : 1),
        stone ? vertex.y / 22 : geometry.attributes.uv.getY(i),
      );
      batch.colors.push(tint.r, tint.g, tint.b);
    }
    parts++;
  }

  for (const district of districts) {
    const length = (district.end - district.start) * track.physicalLength;
    const bays = Math.ceil(length / (district.style === "strata" ? 43 : 52));
    let accepted = 0;
    for (let i = 0; i < bays; i++) {
      // Service courts split long rows into groups of two or three buildings.
      // Rock cuttings remain continuous geology, not an architectural parade.
      const stone = district.style === "strata";
      if (!stone && i % 5 === 3 && i !== bays - 1) continue;
      const rhythm = (i + course + districts.indexOf(district)) % 4;
      const u =
        district.start + ((i + 0.5) / bays) * (district.end - district.start);
      const f = track.frame(u * track.length, district.branch || 0);
      const forward = new THREE.Vector3(
        f.tangent.x,
        0,
        f.tangent.z,
      ).normalize();
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      const yaw = Math.atan2(forward.x, forward.z);
      const width = stone ? 44 : 34;
      const depth = Math.min(
        stone || district.style === "silos" ? 44 : [42, 30, 36, 26][rhythm],
        (length / bays) * 0.84,
      );
      // Setbacks open and close around each district's central landmark.
      const middle = 1 - Math.abs(((i + 0.5) / bays) * 2 - 1);
      const setback =
        (district.style === "terraces" ? 17 : 12 + (1 - middle) * 14) +
        (stone ? 0 : [0, 12, 5, 18][rhythm]);
      const center = f.p
        .clone()
        .addScaledVector(
          right,
          district.side * (f.width + setback + width / 2),
        );
      if (!clearFootprint(center, right, forward, width + 10, depth + 6))
        continue;
      const heights = [-0.5, 0, 0.5].flatMap((x) =>
        [-0.5, 0, 0.5].map((z) =>
          environment.heightAt(
            center.x + right.x * x * width + forward.x * z * depth,
            center.z + right.z * x * width + forward.z * z * depth,
          ),
        ),
      );
      const floor = Math.max(...heights) + 0.5;
      const bottom = Math.min(...heights) - 1;
      const base = (x, y, z) =>
        center
          .clone()
          .addScaledVector(right, x)
          .addScaledVector(forward, z)
          .setY(floor + y);
      const box = (
        x,
        y,
        z,
        w,
        h,
        d,
        color,
        geometry = unit,
        lit = false,
        stone = false,
      ) => emit(base(x, y, z), yaw, [w, h, d], color, geometry, lit, stone);
      box(
        0,
        (bottom - floor) / 2,
        0,
        width,
        floor - bottom,
        depth,
        palette.ground,
      );
      const face = -district.side * (width / 2 + 0.12);
      const facade = (y, h, color, z = 0, d = depth - 4, lit = false) =>
        box(face, y, z, 0.5, h, d, color, unit, lit);
      const height =
        (13 + middle * 22) * (stone ? 1 : [1, 0.68, 0.86, 0.76][rhythm]);
      if (district.style === "terraces") {
        for (let tier = 0; tier < 3; tier++) {
          box(
            district.side * tier * 4,
            tier * 4 + 1.5,
            0,
            width - tier * 9,
            3,
            depth - tier * 5,
            palette.wall,
          );
          box(
            district.side * tier * 4,
            tier * 4 + 3.2,
            0,
            width - tier * 9 - 1,
            0.5,
            depth - tier * 5 - 1,
            palette.ground,
          );
        }
        const trunkBottom = 11.3,
          trunkTop = 15 + middle * 4;
        box(
          district.side * 4,
          (trunkBottom + trunkTop) / 2,
          0,
          1.2,
          trunkTop - trunkBottom,
          1.2,
          palette.dark,
          cylinder,
        );
        box(
          district.side * 4,
          17 + middle * 8,
          0,
          13,
          8 + middle * 8,
          17,
          palette.ground,
          cylinder,
        );
        facade(1.8, 0.6, palette.light);
      } else if (district.style === "residential") {
        box(0, height / 2, 0, width, height, depth, palette.wall);
        box(
          district.side * 5,
          height + 8,
          -depth * 0.18,
          width - 12,
          16,
          depth * 0.58,
          palette.wall,
        );
        for (let level = 5; level < height; level += 6) {
          facade(level, 2.5, palette.glass);
          box(
            face - district.side * 1.8,
            level - 1.8,
            0,
            4,
            0.8,
            depth - 2,
            palette.dark,
          );
        }
        box(
          district.side * 5,
          height + 16.6,
          -depth * 0.18,
          width - 10,
          1,
          depth * 0.64,
          palette.ground,
        );
      } else if (district.style === "hangar" && (i === 0 || i === bays - 1)) {
        // Open service courts introduce the hall and release its far end.
        for (const x of [-width * 0.4, width * 0.4])
          for (const z of [-depth * 0.35, depth * 0.35])
            box(x, 8, z, 2, 16, 2, palette.wall);
        box(0, 17, 0, width, 2, depth, palette.accent);
        box(district.side * 7, 4, 0, 10, 8, depth * 0.55, palette.dark);
        box(-district.side * 6, 2, depth * 0.2, 7, 4, 8, palette.wall);
        facade(15.5, 0.5, palette.light, 0, depth - 5, course === 2);
      } else if (district.style === "hangar") {
        box(0, height / 2, 0, width, height, depth, palette.wall);
        facade(height * 0.4, height * 0.6, palette.dark, 0, depth * 0.68);
        facade(
          height - 3,
          1.8,
          course === 2 ? 0xd8be95 : palette.glass,
          0,
          depth * 0.65,
          course === 2,
        );
        for (const z of [-depth * 0.23, depth * 0.23])
          box(
            face - district.side * 0.2,
            height * 0.4,
            z,
            0.7,
            height * 0.65,
            0.7,
            palette.wall,
          );
        box(
          -district.side * 2,
          height + 1.2,
          0,
          width + 4,
          2.4,
          depth + 3,
          palette.accent,
        );
        box(
          district.side * 8,
          height + 4.5,
          -depth * 0.2,
          9,
          4.5,
          depth * 0.55,
          palette.dark,
        );
        facade(height - 5, 0.5, palette.light, 0, depth - 4, course === 2);
      } else if (district.style === "berth") {
        for (const z of [-depth * 0.35, depth * 0.35]) {
          box(-width * 0.35, 11, z, 2.5, 22, 3, palette.wall);
          box(width * 0.35, 11, z, 2.5, 22, 3, palette.wall);
        }
        box(0, 23, 0, width + 2, 3, depth, palette.wall);
        box(district.side * 8, 9, 0, 12, 18, depth * 0.58, palette.glass);
        facade(21, 0.7, palette.light, 0, depth - 2, course === 2);
        if (course === 2)
          box(
            -district.side * 2,
            22,
            0,
            width - 6,
            0.4,
            depth - 8,
            0xe1c5a1,
            unit,
            true,
          );
        box(0, 2, depth * 0.3, width - 4, 3, 5, palette.accent);
      } else if (district.style === "switchyard") {
        for (const z of [-depth * 0.3, depth * 0.3]) {
          for (const x of [-9, 9]) {
            box(x, 5, z, 10, 10, 10, palette.dark);
            for (const rib of [-3, 0, 3])
              box(x + rib, 5, z, 0.8, 11, 11, palette.wall);
            box(x, 12, z, 0.7, 4, 0.7, palette.accent, cylinder);
          }
          // Each low busbar rests on two ground-supported posts and connects
          // to the transformer insulators below; no suspended aerial crosses.
          for (const x of [-15, 15])
            box(x, 7.25, z, 1.5, 14.5, 1.5, palette.wall);
          box(0, 14.5, z, 32, 1, 1.5, palette.accent);
        }
      } else if (district.style === "silos") {
        for (const z of [-depth * 0.24, depth * 0.24]) {
          const h = height + (z > 0 ? 10 : 0);
          box(0, h / 2, z, 23, h, 18, palette.wall, cylinder);
          box(0, h * 0.7, z, 23.5, 2.5, 18.5, palette.accent, cylinder);
          box(0, h + 0.8, z, 25, 1.6, 20, palette.dark, cylinder);
        }
        box(face + district.side * 3, 7, 0, 2, 3, depth - 1, palette.accent);
        box(district.side * 13, 27, 0, 2, 54, 2, palette.dark);
        box(
          district.side * 13,
          54,
          0,
          3,
          1,
          3,
          palette.light,
          unit,
          course === 2,
        );
      } else if (district.style === "cargo") {
        for (let row = 0; row < 3; row++) {
          const levels = 1 + Math.round(middle * 2) + (row === 2 ? 1 : 0);
          for (let level = 0; level < levels; level++) {
            const x = -11 + row * 11;
            box(
              x,
              3.7 + level * 7.5,
              0,
              10,
              7.2,
              depth - 2,
              (row + level) % 2 ? palette.wall : palette.accent,
            );
            for (const z of [-depth * 0.3, 0, depth * 0.3])
              box(x, 3.7 + level * 7.5, z, 10.3, 6.5, 0.4, palette.dark);
          }
        }
        box(face, 0.8, 0, 0.9, 1.6, depth - 3, palette.dark);
        facade(1.7, 0.4, palette.light, 0, depth - 4, true);
      } else if (district.style === "strata") {
        const heights = [height + 14, height * 0.7 + 10, height * 0.3 + 6];
        for (let shelf = 0; shelf < 3; shelf++) {
          const h = heights[shelf];
          box(
            district.side * shelf * 5,
            h * 0.44,
            0,
            width - shelf * 10,
            h,
            depth - shelf * 4,
            shelf === 1 ? palette.accent : palette.rock,
            rock,
            false,
            true,
          );
          box(
            district.side * shelf * 5,
            h * 0.7,
            0,
            width - shelf * 10 + 0.5,
            1,
            depth - shelf * 4 + 0.5,
            palette.ground,
            rock,
            false,
            true,
          );
        }
      }
      footprints.push({
        district: district.name,
        center: center.toArray(),
        right: right.toArray(),
        forward: forward.toArray(),
        width: width + 10,
        depth: depth + 6,
        floor,
        groundMin: Math.min(...heights),
        groundMax: Math.max(...heights),
      });
      accepted++;
    }
    root.userData[district.name] = accepted;
  }
  let rockMaterial;
  for (const [key, batch] of batches) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(batch.positions, 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(batch.normals, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(batch.uv, 2));
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(batch.colors, 3),
    );
    geometry.computeBoundingSphere();
    if (batch.stone && !rockMaterial)
      rockMaterial = new THREE.MeshLambertMaterial({
        vertexColors: true,
        map: rockStrataTexture(),
        flatShading: true,
      });
    const mesh = new THREE.Mesh(
      geometry,
      batch.lit ? lamps : batch.stone ? rockMaterial : opaque,
    );
    mesh.name = `district-cell-${key}`;
    root.add(mesh);
  }
  unit.dispose();
  cylinder.dispose();
  rock.dispose();
  root.userData.footprints = footprints;
  root.userData.parts = parts;
  return root;
}
