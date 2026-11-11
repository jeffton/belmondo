import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const DISTRICTS = {
  "KAISEKI COAST": ["civic-terrace", "transit-gallery", "ticket-pavilion"],
  "SOLAR ARRAY": ["sandstone-bank", "test-apron", "service-hangar"],
  NOCTILUCENT: ["terminal-quay", "loading-balcony", "dock-hall"],
};

/** Footprints reserve the final sector, not the jumping/landing district. */
export function getFinishDistrictLayout(track) {
  return [
    { u: 0.956, side: 1, width: 22, length: 68, shoulder: 9 },
    { u: 0.993, side: -1, width: 26, length: 52, shoulder: 9 },
    { u: 0.012, side: -1, width: 18, length: 38, shoulder: 13 },
  ].map((spec, index) => {
    const frame = track.frame(spec.u * track.length);
    const center = frame.p
      .clone()
      .addScaledVector(
        frame.right,
        spec.side * (frame.width + spec.shoulder + spec.width / 2),
      );
    const forward = new THREE.Vector3(
      frame.tangent.x,
      0,
      frame.tangent.z,
    ).normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const point = (x, z) =>
      center.clone().addScaledVector(right, x).addScaledVector(forward, z);
    return {
      ...spec,
      kind: DISTRICTS[track.config.name][index],
      frame,
      center,
      forward,
      right,
      corners: [-1, 1].flatMap((x) =>
        [-1, 1].map((z) => point((x * spec.width) / 2, (z * spec.length) / 2)),
      ),
    };
  });
}

const GLYPHS = {
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  I: ["111", "010", "010", "010", "010", "010", "111"],
  N: ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
  S: ["11111", "10000", "10000", "11111", "00001", "00001", "11111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  0: ["111", "101", "101", "101", "101", "101", "111"],
  1: ["010", "110", "010", "010", "010", "010", "111"],
  3: ["111", "001", "001", "111", "001", "001", "111"],
  6: ["111", "100", "100", "111", "101", "101", "111"],
};

function spectatorGeometry() {
  // Crisp low-poly masses read as a waving person at PS1 render resolution.
  const parts = [
    [-0.12, 0.18, 0, 0.14, 0.36, 0.22, 0x555d66],
    [0.12, 0.18, 0, 0.14, 0.36, 0.22, 0x555d66],
    [0, 0.63, 0, 0.44, 0.82, 0.28, 0xffffff],
    [0, 1.2, 0, 0.3, 0.3, 0.3, 0xf1d1ab],
    [-0.32, 0.66, 0, 0.15, 0.6, 0.19, 0xffffff],
    [0.32, 1.12, 0, 0.15, 0.76, 0.19, 0xffffff],
  ].map(([x, y, z, w, h, d, color]) => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.translate(x, y, z);
    const tint = new THREE.Color(color);
    const colors = [];
    for (let i = 0; i < geometry.attributes.position.count; i++)
      colors.push(tint.r, tint.g, tint.b);
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  });
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return geometry;
}

/** Scenery only: never writes track, racer, gate or collision state. */
export function buildFinishDistrict(scene, track, textures, environment) {
  const root = new THREE.Group();
  root.name = "finish-district";
  scene.add(root);
  const desert = track.config.name === "SOLAR ARRAY";
  const harbor = track.config.name === "NOCTILUCENT";
  const surface = (color, map) =>
    new THREE.MeshLambertMaterial({ color, map, flatShading: true });
  const materials = {
    foundation: surface(
      desert ? 0xa3795c : harbor ? 0x536775 : 0x969c97,
      textures.concrete,
    ),
    pale: surface(desert ? 0xd1ad80 : 0xd3d3bd, textures.paint),
    dark: surface(0x253743, textures.paint),
    accent: surface(
      desert ? 0xba5734 : harbor ? 0x924a67 : 0x417a83,
      textures.paint,
    ),
    glazing: surface(harbor ? 0x204657 : 0x316b77, textures.facade),
    light: new THREE.MeshBasicMaterial({
      color: desert ? 0xffd49a : harbor ? 0x9ff2dc : 0xd3f3ee,
    }),
  };
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const transform = new THREE.Object3D();
  const batches = new Map();
  const bodies = [];
  function box(group, material, x, y, z, w, h, d, angle = 0) {
    const key = `${group.id}:${material.id}`;
    if (!batches.has(key)) batches.set(key, { group, material, matrices: [] });
    transform.position.set(x, y, z);
    transform.rotation.set(0, 0, angle);
    transform.scale.set(w, h, d);
    transform.updateMatrix();
    batches.get(key).matrices.push(transform.matrix.clone());
    bodies.push({ group, matrix: transform.matrix.clone(), material });
  }
  function place(frame, name) {
    const group = new THREE.Group();
    group.name = name;
    group.position.copy(frame.p);
    group.rotation.y = Math.atan2(frame.tangent.x, frame.tangent.z);
    root.add(group);
    return group;
  }
  function lettering(group, text, x, y, z, pixel) {
    const width =
      [...text].reduce(
        (sum, letter) => sum + GLYPHS[letter][0].length + 1,
        -1,
      ) * pixel;
    // Drivers approach from local -Z: their screen-right is local -X.
    let left = x + width / 2 - pixel / 2;
    for (const letter of text) {
      const glyph = GLYPHS[letter];
      glyph.forEach((row, j) =>
        [...row].forEach((bit, i) => {
          if (bit === "1")
            box(
              group,
              materials.light,
              left - i * pixel,
              y + (3 - j) * pixel,
              z,
              pixel * 0.85,
              pixel * 0.85,
              0.08,
            );
        }),
      );
      left -= (glyph[0].length + 1) * pixel;
    }
  }

  const time = { value: 0 };
  const crowdMaterial = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
    flatShading: true,
  });
  crowdMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.finishCrowdTime = time;
    shader.vertexShader =
      "uniform float finishCrowdTime;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `
      #include <begin_vertex>
      float cheer = sin(finishCrowdTime * 2.7 + float(gl_InstanceID) * 2.399);
      transformed.x += cheer * 0.12 * max(0.0, position.y - 0.35);
      transformed.y += cheer * 0.045 * max(0.0, position.y - 0.35);
    `,
    );
  };
  crowdMaterial.customProgramCacheKey = () => "finish-crowd-wave";
  const crowdGeometry = spectatorGeometry();
  const crowdPalette = [
    0xe4c37f, 0xb9d6cf, 0xcd756b, 0x759fae, 0xd3c9b2, 0x8587a1,
  ];
  let spectators = 0;
  const foundations = [];
  function crowd(group, positions, side) {
    const mesh = new THREE.InstancedMesh(
      crowdGeometry,
      crowdMaterial,
      positions.length,
    );
    mesh.name = "spectators";
    for (const [i, p] of positions.entries()) {
      transform.position.set(...p);
      transform.rotation.set(0, (-side * Math.PI) / 2, 0);
      transform.scale.setScalar(0.9 + (i % 5) * 0.045);
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
      mesh.setColorAt(
        i,
        new THREE.Color(
          crowdPalette[(i * 7 + spectators) % crowdPalette.length],
        ),
      );
    }
    mesh.computeBoundingSphere();
    group.add(mesh);
    spectators += positions.length;
  }
  const layout = getFinishDistrictLayout(track);
  for (const [index, spec] of layout.entries()) {
    const group = place(spec.frame, spec.kind);
    group.position.copy(spec.center);
    const heights = [];
    const nx = Math.ceil(spec.width / 4),
      nz = Math.ceil(spec.length / 4);
    for (let ix = 0; ix <= nx; ix++)
      for (let iz = 0; iz <= nz; iz++) {
        const point = spec.center
          .clone()
          .addScaledVector(spec.right, (ix / nx - 0.5) * spec.width)
          .addScaledVector(spec.forward, (iz / nz - 0.5) * spec.length);
        heights.push(environment.heightAt(point.x, point.z));
      }
    const bottom = Math.min(...heights) - 0.7;
    const deck = Math.max(...heights, spec.frame.p.y - 1) + 0.45;
    group.position.y = deck;
    box(
      group,
      materials.foundation,
      0,
      (bottom - deck) / 2,
      0,
      spec.width,
      deck - bottom,
      spec.length,
    );
    box(group, materials.pale, 0, 0.18, 0, spec.width, 0.36, spec.length);
    foundations.push({ ...spec, bottom, deck, group });
    const { side, width, length } = spec;
    const points = [];
    if (index < 2) {
      const rows = desert ? 4 : harbor ? 3 : 5;
      for (let row = 0; row < rows; row++) {
        const x = side * (-width / 2 + 2.4 + row * 3.5);
        const y = row * (harbor ? 1.25 : 0.95);
        box(
          group,
          materials.foundation,
          x,
          y / 2 + 0.38,
          0,
          3.5,
          y + 0.4,
          length - 3,
        );
        box(
          group,
          desert ? materials.accent : materials.dark,
          x,
          y + 0.7,
          0,
          0.7,
          0.25,
          length - 5,
        );
        for (
          let column = 0;
          column < Math.floor((length - 8) / 1.8);
          column++
        ) {
          // Broken seating groups leave stairs and produce a varied silhouette.
          if (column % 12 === 5 || (column + row * 3) % 17 === 4) continue;
          points.push([x, y + 0.9, -length / 2 + 5 + column * 1.8]);
        }
      }
      const outer = side * (width / 2 - 1.4);
      if (desert) {
        // Sandstone spectator shelves backed by a test apron, not a stadium roof.
        for (let rib = 0; rib < 4; rib++) {
          const z = ((rib - 1.5) * length) / 4;
          box(group, materials.accent, outer, 4, z, 1.2, 8, 1.4);
          box(
            group,
            materials.dark,
            outer - side * 3,
            8.2,
            z,
            7,
            0.3,
            length / 4 - 2,
            side * 0.12,
          );
          box(
            group,
            materials.light,
            outer - side * 5,
            7.7,
            z,
            0.2,
            0.15,
            length / 4 - 4,
          );
        }
      } else if (harbor) {
        // Loading-hall gallery and open quay have different massing and rooflines.
        const hall = index === 1;
        box(
          group,
          materials.accent,
          outer,
          hall ? 5.2 : 2.8,
          0,
          hall ? 4 : 1.8,
          hall ? 10.4 : 5.6,
          length - 5,
        );
        if (hall) {
          box(
            group,
            materials.pale,
            outer - side * 4,
            6,
            0,
            3.4,
            0.45,
            length - 5,
          );
          box(
            group,
            materials.dark,
            outer - side * 5.6,
            7,
            0,
            0.25,
            0.7,
            length - 5,
          );
          for (let i = 0; i < Math.floor((length - 8) / 1.6); i++)
            points.push([outer - side * 4, 6.25, -length / 2 + 5 + i * 1.6]);
          box(
            group,
            materials.dark,
            outer - side * 5,
            10.6,
            0,
            13,
            0.8,
            length + 1,
          );
          for (let bay = 0; bay < 6; bay++) {
            const z = ((bay - 2.5) * length) / 6;
            box(
              group,
              materials.glazing,
              outer - side * 2.1,
              6.8,
              z,
              0.2,
              2.8,
              length / 6 - 2,
            );
            box(
              group,
              materials.light,
              outer - side * 5,
              10.1,
              z,
              5,
              0.12,
              0.5,
            );
          }
        } else {
          for (const z of [-length / 3, length / 3]) {
            box(group, materials.dark, outer, 7.4, z, 0.7, 7.4, 0.7);
            box(
              group,
              materials.light,
              outer - side * 2,
              10.8,
              z,
              4.5,
              0.35,
              0.6,
            );
          }
        }
      } else {
        // Civic steps become a transit gallery: roof blades cover only rear rows.
        for (let bay = 0; bay < 5; bay++) {
          const z = ((bay - 2) * length) / 5;
          box(group, materials.accent, outer, 4.3, z, 1.2, 8.6, 1.2);
          box(
            group,
            materials.pale,
            outer - side * 4,
            8.6 + (bay % 2) * 0.6,
            z,
            10,
            0.55,
            length / 5 - 1,
          );
          box(
            group,
            materials.light,
            outer - side * 7,
            8.2 + (bay % 2) * 0.6,
            z,
            0.35,
            0.18,
            length / 5 - 3,
          );
        }
      }
      // Continuous low balustrade at the front; never over the racing edge.
      box(
        group,
        materials.dark,
        -side * (width / 2 - 0.6),
        1.4,
        0,
        0.35,
        0.65,
        length - 1,
      );
    } else {
      const high = desert ? 7 : harbor ? 11 : 5;
      box(group, materials.accent, side * 4, high / 2, 0, 8, high, length - 4);
      box(group, materials.dark, 0, high + 0.4, 0, width, 0.8, length);
      for (let bay = 0; bay < 4; bay++) {
        const z = (bay - 1.5) * 8;
        box(
          group,
          materials.glazing,
          -side * 0.1,
          high * 0.6,
          z,
          0.3,
          high * 0.55,
          5.8,
        );
        box(group, materials.light, -side * 4, high - 0.2, z, 6, 0.15, 0.25);
        for (let i = 0; i < 5; i++) points.push([-side * 4, 0.5, z - 2 + i]);
      }
      if (desert) {
        for (const z of [-length / 2 + 1, length / 2 - 1])
          box(group, materials.pale, 0, high + 1.8, z, width + 1, 2.3, 1.1);
      }
    }
    crowd(group, points, side);
  }

  // Timing portal is exactly on frame(0). The signal board remains downstream
  // at +42m and is deliberately a separate structure with a different purpose.
  const finish = track.frame(0);
  const portal = place(finish, "finish-line-portal");
  const halfSpan = finish.width + 4;
  const portalFeet = [];
  for (const side of [-1, 1]) {
    const x = side * halfSpan;
    const foot = finish.p.clone().addScaledVector(finish.right, x);
    const base = Math.min(
      ...[-1.4, 0, 1.4].flatMap((dx) =>
        [-2, 0, 2].map((dz) => {
          const p = foot
            .clone()
            .addScaledVector(finish.right, dx)
            .addScaledVector(finish.tangent, dz);
          return environment.heightAt(p.x, p.z) - finish.p.y - 1;
        }),
      ),
    );
    box(portal, materials.foundation, x, base / 2, 0, 2.8, -base, 4);
    box(portal, materials.accent, x, 8.5, 0, 1.6, 17, 2.1);
    box(portal, materials.light, x - side * 0.86, 8, -0.1, 0.16, 12, 0.6);
    for (let n = 0; n < 4; n++)
      box(
        portal,
        n % 2 ? materials.dark : materials.pale,
        x,
        13 + n * 0.7,
        -1.1,
        2.3,
        0.7,
        0.25,
      );
    portalFeet.push({ x: foot.x, z: foot.z, width: 2.8, length: 4 });
  }
  box(portal, materials.dark, 0, 17, 0, halfSpan * 2 + 2, 1, 1.3);
  box(portal, materials.dark, 0, 15.4, 0, 16.6, 2.7, 0.7);
  lettering(portal, "FINISH", 0, 15.4, -0.39, 0.29);
  for (const side of [-1, 1])
    for (let n = 0; n < 5; n++)
      box(
        portal,
        n % 2 ? materials.dark : materials.pale,
        side * (9.5 + n * 1.4),
        15.4,
        -0.4,
        1.4,
        2.5,
        0.12,
      );

  for (const distance of [300, 160, 60]) {
    const frame = track.frame(track.length - distance);
    const group = place(frame, `finish-approach-${distance}`);
    const x = -(frame.width + 5);
    const foot = frame.p.clone().addScaledVector(frame.right, x);
    const base = environment.heightAt(foot.x, foot.z) - frame.p.y - 0.7;
    box(group, materials.foundation, x, base / 2, 0, 1.4, -base, 1.8);
    box(group, materials.dark, x, 2.6, 0, 0.55, 5.2, 0.9);
    box(group, materials.dark, x, 4.8, 0, 6, 3.7, 0.8);
    box(group, materials.pale, x, 6.3, -0.5, 6, 0.35, 0.1);
    lettering(group, String(distance), x, 4.7, -0.45, 0.37);
  }
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(
      unit,
      batch.material,
      batch.matrices.length,
    );
    batch.matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.computeBoundingSphere();
    batch.group.add(mesh);
  }
  root.updateMatrixWorld(true);
  root.userData.spectators = spectators;
  root.userData.foundationFootprints = foundations.map(
    ({ kind, corners, bottom, deck }) => ({ kind, corners, bottom, deck }),
  );
  root.userData.finishS = 0;
  root.userData.portalFeet = portalFeet;
  return {
    root,
    foundations,
    bodies,
    update(elapsed) {
      time.value = elapsed;
    },
  };
}
