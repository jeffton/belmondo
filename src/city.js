import * as THREE from "three";
import { buildMetropolis, METROPOLIS_SIGN_ATLAS } from "./metropolis-world.js";
import { groundedGeometryOffset } from "./terrain.js";
import { buildRouteDistricts } from "./route-districts.js";
import {
  newCourseRecipe,
  assertKnownEnvironment,
} from "./new-course-recipes.js";
import { buildNewCourseDistricts } from "./new-course-environments.js";

// Authored districts, not a scatter of interchangeable apartment towers. Each
// cluster has a clear footprint outside every route, including the flight lane.
export function buildCity(scene, track, textures, environment) {
  assertKnownEnvironment(track);
  if (track.config.biome === "metropolis") {
    const signMap = new THREE.TextureLoader().load(METROPOLIS_SIGN_ATLAS);
    signMap.colorSpace = THREE.SRGBColorSpace;
    return buildMetropolis(scene, track, textures, environment, signMap);
  }
  if (newCourseRecipe(track))
    return buildNewCourseDistricts(scene, track, textures, environment);
  const root = new THREE.Group();
  root.name = "waterfront-city";
  scene.add(root);
  const desert = track.config.name === "SOLAR ARRAY";
  const harbor = track.config.name === "NOCTILUCENT";
  const surface = (color, map = null) =>
    new THREE.MeshLambertMaterial({ color, map, flatShading: true });
  const materials = {
    concrete: surface(desert ? 0xaf8062 : 0xa5aaa5, textures.concrete),
    dark: surface(0x263b49, textures.paint),
    metal: surface(desert ? 0xb65d40 : 0x527c8b, textures.paint),
    glass: surface(harbor ? 0x264b6a : 0x36798c, textures.facade),
    cream: surface(0xe1d8bd, textures.paint),
    rock: surface(desert ? 0xb47f65 : 0x697665, textures.rock),
    green: surface(0x4c7459),
    cargo: surface(harbor ? 0xb24b64 : 0x366b79, textures.paint),
    light: new THREE.MeshBasicMaterial({ color: desert ? 0xffc67a : 0x68d9d6 }),
  };
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
    rock: new THREE.DodecahedronGeometry(0.5, 0),
    cone: new THREE.ConeGeometry(0.5, 1, 7),
  };
  // Distinct angular sandstone masses: taper, slanted bedding and irregular caps.
  for (let variant = 0; variant < 3; variant++) {
    const geometry = new THREE.CylinderGeometry(
      0.32 + variant * 0.04,
      0.5,
      1,
      5 + variant,
      1,
    );
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        z = positions.getZ(i);
      positions.setXYZ(
        i,
        x + y * (0.12 - variant * 0.08),
        y + x * (0.18 + variant * 0.06),
        z,
      );
    }
    geometry.computeVertexNormals();
    geometry.name = `sandstone-outcrop-${variant}`;
    geometries[`cliff${variant}`] = geometry;
  }
  const batches = new Map();
  const transform = new THREE.Object3D();
  const road = [];
  const roadSteps = Math.ceil(track.length / 6);
  for (let i = 0; i < roadSteps; i++) {
    const u = i / roadSteps;
    for (const branch of u > track.config.split[0] && u < track.config.split[1]
      ? [-1, 1]
      : [0])
      road.push(track.frame(u * track.length, branch).p);
  }
  const clearance = (p) =>
    Math.sqrt(
      Math.min(...road.map((q) => (p.x - q.x) ** 2 + (p.z - q.z) ** 2)),
    );

  function cluster(u, side, offset, kind, index) {
    const frame = track.frame(u * track.length);
    let p = frame.p.clone().addScaledVector(frame.right, side * offset);
    if (kind === "ferry") {
      // Ships use an actual water footprint, not an elevated concrete pedestal.
      // Search the nearby waterfront without changing terrain or race geometry.
      let berth = null;
      for (const distance of [offset, 220, 300, 390, 480]) {
        for (const bank of [side, -side]) {
          const candidate = frame.p
            .clone()
            .addScaledVector(frame.right, bank * distance);
          if (clearance(candidate) < 108) continue;
          if (
            [-45, 0, 45].every((x) =>
              [-45, 0, 45].every(
                (z) =>
                  environment.heightAt(candidate.x + x, candidate.z + z) < -18,
              ),
            )
          ) {
            berth = candidate;
            break;
          }
        }
        if (berth) break;
      }
      if (!berth) return;
      p = berth;
    }
    // 62 m radius contains the complete cluster; the remainder is the race
    // corridor plus a generous outside shoulder, independent of road height.
    if (clearance(p) < 108) return;
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    const forward = new THREE.Vector3(
      frame.tangent.x,
      0,
      frame.tangent.z,
    ).normalize();
    const footprint = [];
    for (let x = -48; x <= 48; x += 8)
      for (let z = -48; z <= 48; z += 8) {
        footprint.push(
          environment.heightAt(
            p.x + frame.right.x * x + forward.x * z,
            p.z + frame.right.z * x + forward.z * z,
          ),
        );
      }
    const ground = Math.max(...footprint);
    const deck = kind === "ferry" ? -19 : ground + 3;
    const local = (x, y, z) =>
      p
        .clone()
        .addScaledVector(frame.right, x)
        .addScaledVector(forward, z)
        .setY(y);
    function put(
      material,
      x,
      y,
      z,
      w,
      h,
      d,
      geometry = "box",
      tilt = 0,
      turn = 0,
    ) {
      const point = local(x, y, z);
      const key = `${material}:${geometry}:${Math.floor(point.x / 256)}:${Math.floor(point.z / 256)}`;
      if (!batches.has(key))
        batches.set(key, {
          material: materials[material],
          geometry: geometries[geometry],
          matrices: [],
        });
      transform.position.copy(point);
      transform.rotation.set(tilt, yaw + turn, 0);
      transform.scale.set(w, h, d);
      transform.updateMatrix();
      batches.get(key).matrices.push(transform.matrix.clone());
    }
    function support(x, z, top, width = 3) {
      const point = local(x, 0, z);
      const bottom = environment.heightAt(point.x, point.z) - 3;
      put("concrete", x, (bottom + top) / 2, z, width, top - bottom, width);
    }
    function podium() {
      const bottom = Math.min(...footprint) - 2;
      put("concrete", 0, (bottom + deck) / 2, 0, 78, deck - bottom, 78);
      put("dark", 0, deck + 0.2, 0, 74, 0.4, 74);
    }
    function crane(x, z, height, reach) {
      support(x, z, deck + height, 3);
      for (const dx of [-7, 7]) {
        support(x + dx, z, deck + height - 4, 1.5);
        put("metal", x + dx, deck + height / 2, z, 2, height, 2);
      }
      put("metal", x, deck + height, z + reach / 2 - 8, 5, 4, reach + 16);
      put("cream", x, deck + height - 4, z - 10, 9, 7, 10);
      put("dark", x, deck + height - 4, z - 15.1, 7, 3, 0.4);
      put(
        "metal",
        x,
        deck + height / 2 + 4,
        z + reach - 8,
        0.6,
        height - 8,
        0.6,
      );
      put("cargo", x, deck + 10, z + reach - 8, 12, 5, 5);
    }
    if (kind === "cliff") {
      // An authored buttress, broken shelf or narrow stack, not four copied blobs.
      const formations = [
        [
          [-12, -21, 52, 63, 43],
          [17, 15, 36, 94, 46],
        ],
        [
          [0, -20, 63, 39, 40],
          [-12, 21, 49, 58, 35],
          [20, 4, 25, 76, 31],
        ],
        [
          [-18, -12, 34, 105, 42],
          [18, 20, 38, 66, 37],
        ],
      ];
      formations[index % formations.length].forEach(([x, z, w, h, d], j) => {
        const geometry = `cliff${(index + j) % 3}`;
        const turn = ((index % 5) - 2) * 0.19 + j * 0.32;
        transform.position.copy(local(x, 0, z));
        transform.rotation.set(0, yaw + turn, 0);
        transform.scale.set(w, h, d);
        transform.updateMatrix();
        const y = groundedGeometryOffset(
          geometries[geometry],
          transform.matrix,
          environment.heightAt,
        );
        put("rock", x, y, z, w, h, d, geometry, 0, turn);
      });
    } else if (kind === "terrace") {
      podium();
      for (let j = 0; j < 4; j++) {
        const y = deck + j * 7;
        put("concrete", j * 9 - 12, y, 0, 58 - j * 7, 3, 68 - j * 9);
        put("green", j * 9 - 12, y + 1.8, 0, 56 - j * 7, 0.8, 66 - j * 9);
        for (const z of [-20 + j * 3, 18 - j * 3]) {
          put("dark", j * 9 - 12, y + 5, z, 1.2, 7, 1.2);
          put("green", j * 9 - 12, y + 9, z, 12, 11, 12, "rock");
        }
      }
      put("cream", 20, deck + 33, 0, 25, 8, 28);
      put("dark", 20, deck + 38, 0, 34, 2, 36);
    } else if (kind === "ferry") {
      // An adjacent pile-supported wharf leaves water visible around the hull.
      put("concrete", 33, -10, 0, 9, 3, 76);
      for (const z of [-30, 0, 30]) support(33, z, -11, 2);
      put("cream", 22, -8.5, -7, 16, 1, 4);
      // A stepped hull, passenger decks and raked bow read as a vessel at speed.
      put("dark", 0, deck + 4, 0, 25, 8, 70);
      put("cream", 0, deck + 9, 0, 27, 3, 67);
      put("cream", 0, deck + 15, -7, 22, 10, 42);
      put("glass", 0, deck + 17, -7, 22.5, 4, 39);
      put("cream", 0, deck + 22, -10, 24, 2, 36);
      put("cargo", -5, deck + 27, -17, 5, 10, 8);
      put("metal", 6, deck + 32, -12, 0.7, 22, 0.7);
      for (const x of [-25, 25]) support(x, 24, deck + 13, 2);
    } else if (kind === "transit") {
      podium();
      for (const x of [-25, 25]) {
        for (const z of [-28, 0, 28]) support(x, z, deck + 23, 2);
        put("cream", x, deck + 24, 0, 16, 3, 72);
        put("light", x - 7, deck + 22, 0, 0.5, 0.5, 65);
      }
      put("metal", 0, deck + 8, 0, 10, 1, 77);
      put("cream", 0, deck + 12, -5, 8, 7, 48);
      put("glass", 0, deck + 13, -5, 8.4, 3, 43);
      put("cargo", 0, deck + 10, -5, 8.5, 0.6, 44);
      put("glass", 0, deck + 32, 23, 65, 13, 12);
      put("cream", 0, deck + 40, 23, 69, 3, 15);
    } else if (kind === "solar") {
      podium();
      for (let j = 0; j < 5; j++)
        for (let k = 0; k < 4; k++) {
          const x = -29 + j * 14,
            z = -24 + k * 16;
          support(x, z, deck + 7, 1);
          put("glass", x, deck + 8, z, 12, 1, 13, "box", -0.3);
          put("metal", x, deck + 8.8, z, 0.3, 0.4, 13, "box", -0.3);
        }
      put("cream", 22, deck + 24, 0, 12, 46, 12);
      put("light", 22, deck + 49, 0, 16, 4, 16);
    } else if (kind === "refinery") {
      podium();
      for (const x of [-22, 12])
        for (const z of [-22, 12]) {
          put("cream", x, deck + 15, z, 24, 30, 24, "cylinder");
          put("metal", x, deck + 31, z, 25, 2, 25, "cylinder");
          put("cargo", x, deck + 17, z, 24.4, 3, 24.4, "cylinder");
        }
      for (const z of [-22, 12]) {
        support(31, z, deck + 64, 3);
        put("metal", 31, deck + 53, z, 7, 30, 7, "cylinder");
        put("light", 31, deck + 68, z, 4, 1, 4, "cylinder");
      }
      put("metal", 0, deck + 36, 0, 65, 2, 3);
    } else if (kind === "gantry") {
      podium();
      for (const z of [-26, 26]) {
        for (const x of [-25, 25]) {
          support(x, z, deck + 48, 3);
          put("metal", x, deck + 27, z, 4, 44, 4);
        }
        put("metal", 0, deck + 49, z, 58, 6, 6);
        put("light", 0, deck + 45, z, 44, 0.5, 0.5);
      }
      put("cream", 0, deck + 52, 0, 12, 7, 65);
      put("dark", 0, deck + 56, 0, 4, 2, 64);
      for (const x of [-17, 17]) put("cargo", x, deck + 9, 0, 22, 17, 46);
    } else if (kind === "harbor-gateway") {
      // One tall loading interchange marks the first harbor approach. Its
      // opening faces the racing camera, but the entire gantry is on the quay.
      podium();
      for (const x of [-25, 25]) {
        for (const z of [-25, 25]) {
          support(x, z, deck + 86, 4);
          put("metal", x, deck + 44, z, 5, 84, 5);
          put("cargo", x, deck + 30, z, 5.4, 8, 5.4);
          put("light", x - 2.7, deck + 63, z, 0.5, 35, 0.5);
        }
        put("cream", x, deck + 88, 0, 10, 8, 64);
        put("metal", x, deck + 44, 0, 3, 3, 55);
      }
      for (const z of [-25, 25]) {
        put("cargo", 0, deck + 84, z, 64, 8, 8);
        put("cream", 0, deck + 92, z, 68, 3, 12);
        for (const x of [-24, -12, 0, 12, 24])
          put("light", x, deck + 84, z - 4.1, 4, 1.2, 0.3);
      }
      put("cream", -13, deck + 79, -29, 16, 10, 13);
      put("glass", -13, deck + 80, -35.6, 13, 5, 0.3);
      put("metal", 5, deck + 90, 0, 9, 7, 62);
      for (const x of [-1, 11])
        for (const z of [-14, 14]) put("metal", x, deck + 57, z, 0.5, 54, 0.5);
      put("cargo", 5, deck + 27, 0, 18, 12, 36);
      for (const z of [-14, -7, 0, 7, 14])
        put("cream", 5, deck + 27, z, 18.3, 11.5, 0.3);
      // A low loading shed and rail apron connect the landmark to daily freight.
      put("dark", -7, deck + 9, 29, 33, 18, 14);
      put("cream", -7, deck + 19, 29, 39, 2, 18);
      for (const x of [-31, 31]) put("metal", x, deck + 0.6, 0, 0.6, 0.3, 74);
    } else if (kind === "freight") {
      podium();
      crane(-23, -6, 57, 34);
      for (let j = 0; j < 3; j++)
        for (let k = 0; k <= j % 2; k++) {
          const x = 4 + j * 11;
          put(
            (j + index) % 2 ? "cargo" : "cream",
            x,
            deck + 4 + k * 8,
            0,
            10,
            8,
            47,
          );
          for (const z of [-20, -10, 0, 10, 20])
            put("metal", x, deck + 4 + k * 8, z, 10.3, 7.5, 0.3);
        }
    } else if (kind === "city") {
      podium();
      for (let j = 0; j < 3; j++) {
        const h = 35 + ((j + index) % 3) * 26;
        const x = -24 + j * 24;
        put("glass", x, deck + h / 2, j % 2 ? 15 : -10, 18, h, 28);
        for (let y = 5; y < h; y += 11)
          put("cream", x, deck + y, j % 2 ? 15 : -10, 20, 1.2, 30);
        put("metal", x, deck + h + 5, j % 2 ? 15 : -10, 7, 10, 10);
      }
    }
  }

  // Landmarks terminate particular views; close districts supply the connective
  // tissue. Distances, sides and silhouettes are composed for each real route.
  const landmarks = desert
    ? [
        [0.08, -1, 165, "solar"],
        [0.145, 1, 195, "cliff"],
        [0.303, 1, 185, "cliff"],
        [0.382, -1, 245, "gantry"],
        [0.515, -1, 155, "solar"],
        [0.575, 1, 185, "cliff"],
        [0.757, 1, 165, "refinery"],
        [0.842, -1, 235, "cliff"],
        [0.915, -1, 160, "solar"],
      ]
    : harbor
      ? [
          [0.085, -1, 170, "freight"],
          [0.151, 1, 240, "ferry"],
          [0.213, 1, 175, "refinery"],
          [0.312, 1, 170, "freight"],
          [0.425, -1, 185, "city"],
          [0.572, -1, 210, "gantry"],
          [0.663, -1, 165, "refinery"],
          [0.817, 1, 180, "freight"],
          [0.917, -1, 225, "city"],
        ]
      : [
          [0.137, 1, 180, "transit"],
          [0.213, -1, 220, "ferry"],
          [0.263, -1, 160, "city"],
          [0.372, 1, 225, "terrace"],
          [0.493, 1, 180, "city"],
          [0.578, -1, 215, "terrace"],
          [0.675, 1, 190, "transit"],
          [0.735, -1, 240, "ferry"],
          [0.927, -1, 185, "city"],
        ];
  landmarks.forEach(([u, side, offset, kind], i) =>
    cluster(u, side, offset, kind, i),
  );
  buildRouteDistricts(root, track, textures, environment);
  if (harbor) cluster(0.085, 1, 135, "harbor-gateway", 32);
  let count = 0;
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(
      batch.geometry,
      batch.material,
      batch.matrices.length,
    );
    batch.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.computeBoundingSphere();
    root.add(mesh);
    count += batch.matrices.length;
  }
  root.userData.sceneryInstances = count;
  return { update() {} };
}
