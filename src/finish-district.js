import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  newCourseRecipe,
  assertKnownEnvironment,
} from "./new-course-recipes.js";

const DISTRICTS = {
  "VESPER CIRCUIT": ["neon-boulevard-grandstand", "transit-concourse-gallery"],
  "KAISEKI COAST": ["civic-terrace", "transit-gallery"],
  "SOLAR ARRAY": ["sandstone-bank", "test-apron"],
  NOCTILUCENT: ["terminal-quay", "loading-balcony"],
  WHITEOUT: ["expedition-grandstand", "observatory-gallery"],
  MONSOON: ["lockside-grandstand", "intake-gallery"],
  CINDERLINE: ["caldera-grandstand", "exchange-gallery"],
};

/** Footprints reserve the final sector, not the jumping/landing district. */
export function getFinishDistrictLayout(track) {
  assertKnownEnvironment(track);
  const [start, end] = track.config.sections.finishStraight;
  const sections = Math.ceil(((end - start) * track.length) / 48);
  const span = ((end - start) * track.length) / sections;
  const stands = [];
  for (let i = 0; i < sections; i++)
    for (const side of [-1, 1]) {
      stands.push({
        u: (start + ((i + 0.5) * (end - start)) / sections) % 1,
        side,
        width: side < 0 ? 22 : 24,
        length: span - 3,
        shoulder: 9,
        spectator: true,
        section: i,
      });
    }
  return stands.map((spec) => {
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
      kind: DISTRICTS[track.config.name][spec.side < 0 ? 0 : 1],
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
  // Four spectators per crossed raster card: PS1 crowd density without thousands
  // of box-built bodies. The second face stays visible on the fast approach.
  const front = new THREE.PlaneGeometry(6.4, 2.1);
  front.translate(0, 1.05, 0);
  const diagonal = front.clone().rotateY(Math.PI / 3);
  const geometry = mergeGeometries([front, diagonal]);
  front.dispose();
  diagonal.dispose();
  return geometry;
}

function spectatorTexture() {
  const pixels = new Uint8Array(128 * 64 * 4);
  const rect = (x, y, w, h, color) => {
    for (let row = y; row < y + h; row++)
      for (let col = x; col < x + w; col++) {
        pixels.set(
          [(color >> 16) & 255, (color >> 8) & 255, color & 255, 255],
          (row * 128 + col) * 4,
        );
      }
  };
  const coats = [0xe4c37f, 0x8bafb8, 0xb66b66, 0xa9b99a];
  for (let i = 0; i < 4; i++) {
    const x = 13 + i * 31;
    rect(x - 6, 1, 5, 20, 0x3e4d60);
    rect(x + 2, 1, 5, 20, 0x34404f);
    rect(x - 8, 20, 17, 25, coats[i]);
    rect(x - 8, 22, 3, 21, 0x536679);
    rect(x - 6, 45, 12, 12, i % 2 ? 0xc6a17d : 0xe2c5a1);
    rect(x - 6, 54, 12, 4, 0x41434d);
    rect(x - 12, 26, 4, 18, coats[i]);
    rect(x + 9, 39, 4, 17, coats[i]);
    rect(x + 9, 55, 4, 5, 0xd6b18b);
  }
  const texture = new THREE.DataTexture(pixels, 128, 64);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export function buildFinishMarkings(root, track, textures) {
  const [start, end] = track.config.sections.finishStraight;
  const rows = Math.ceil(((end - start) * track.length) / 6);
  const columns = Math.round((track.config.width * 2) / 4.5);
  const positions = [],
    colors = [],
    uv = [];
  for (let row = 0; row < rows; row++) {
    const a = track.frame(
      (start + ((end - start) * row) / rows) * track.length,
    );
    const b = track.frame(
      (start + ((end - start) * (row + 1)) / rows) * track.length,
    );
    for (let column = 0; column < columns; column++) {
      const left = (column / columns) * 2 - 1,
        right = ((column + 1) / columns) * 2 - 1;
      const points = [
        a.p
          .clone()
          .addScaledVector(a.right, left * a.width)
          .addScaledVector(a.up, 0.035),
        a.p
          .clone()
          .addScaledVector(a.right, right * a.width)
          .addScaledVector(a.up, 0.035),
        b.p
          .clone()
          .addScaledVector(b.right, right * b.width)
          .addScaledVector(b.up, 0.035),
        b.p
          .clone()
          .addScaledVector(b.right, left * b.width)
          .addScaledVector(b.up, 0.035),
      ];
      const tint = new THREE.Color((row + column) % 2 ? 0x4c5964 : 0xd4d2c3);
      for (const vertex of [0, 2, 1, 0, 3, 2]) {
        positions.push(...points[vertex].toArray());
        colors.push(tint.r, tint.g, tint.b);
        uv.push(vertex === 0 || vertex === 3 ? 0 : 1, vertex < 2 ? 0 : 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: textures.road,
      side: THREE.DoubleSide,
    }),
  );
  mesh.name = "finish-straight-checker";
  mesh.userData.range = [start, end];
  root.add(mesh);
  return mesh;
}

/** A crisp transverse stripe identifies the timing plane within the checker district. */
export function buildTimingStripe(root, track) {
  const positions = [];
  const colors = [];
  const columns = Math.ceil((track.config.width * 2) / 2);
  for (let row = 0; row < 2; row++) {
    const a = track.frame(track.finishS - 2 + row * 2);
    const b = track.frame(track.finishS + row * 2);
    for (let column = 0; column < columns; column++) {
      const left = (column / columns) * 2 - 1;
      const right = ((column + 1) / columns) * 2 - 1;
      const point = (f, x) =>
        f.p
          .clone()
          .addScaledVector(f.right, x * f.width)
          .addScaledVector(f.up, 0.065);
      const corners = [
        point(a, left),
        point(a, right),
        point(b, right),
        point(b, left),
      ];
      const tint = new THREE.Color((row + column) % 2 ? 0x101820 : 0xf3f5e7);
      for (const vertex of [0, 2, 1, 0, 3, 2]) {
        positions.push(...corners[vertex].toArray());
        colors.push(tint.r, tint.g, tint.b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const stripe = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  );
  stripe.name = "timing-line-stripe";
  stripe.userData.finishS = track.finishS;
  root.add(stripe);
  return stripe;
}

/** Scenery only: never writes track, racer, gate or collision state. */
export function buildFinishDistrict(scene, track, textures, environment) {
  const recipe = newCourseRecipe(track);
  const root = new THREE.Group();
  root.name = "finish-district";
  scene.add(root);
  const desert = track.config.name === "SOLAR ARRAY";
  const harbor = track.config.name === "NOCTILUCENT";
  const surface = (color, map) =>
    new THREE.MeshLambertMaterial({ color, map, flatShading: true });
  const materials = {
    foundation: surface(
      recipe ? recipe.wall : desert ? 0xa3795c : harbor ? 0x536775 : 0x969c97,
      textures.concrete,
    ),
    pale: surface(
      recipe ? recipe.pale : desert ? 0xd1ad80 : 0xd3d3bd,
      textures.paint,
    ),
    dark: surface(0x253743, textures.paint),
    accent: surface(
      recipe ? recipe.accent : desert ? 0xba5734 : harbor ? 0x924a67 : 0x417a83,
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
    transform.position.set(x, y, z);
    transform.rotation.set(0, 0, angle);
    transform.scale.set(w, h, d);
    transform.updateMatrix();
    group.updateMatrix();
    const worldMatrix = group.matrix.clone().multiply(transform.matrix);
    const key = `${material.id}:${Math.floor(worldMatrix.elements[12] / 160)}:${Math.floor(worldMatrix.elements[14] / 160)}`;
    if (!batches.has(key))
      batches.set(key, { group: root, material, matrices: [] });
    batches.get(key).matrices.push(worldMatrix);
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
    map: spectatorTexture(),
    alphaTest: 0.4,
    side: THREE.DoubleSide,
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
    spectators += positions.length * 4;
  }
  buildFinishMarkings(root, track, textures);
  const layout = getFinishDistrictLayout(track);
  for (const spec of layout) {
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
    if (spec.spectator) {
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
          column < Math.floor((length - 8) / 6.4);
          column++
        ) {
          // Broken seating groups leave stairs and produce a varied silhouette.
          if (column % 12 === 5 || (column + row * 3) % 17 === 4) continue;
          points.push([x, y + 0.9, -length / 2 + 5 + column * 6.4]);
        }
      }
      const outer = side * (width / 2 - 1.4);
      if (recipe) {
        // Four posts carry a deep, opaque weather canopy; the polar viewing
        // gallery, lockside shelter and caldera roof use their own materials.
        for (const z of [-length / 2 + 3, length / 2 - 3])
          for (const x of [outer, outer - side * 7])
            box(group, materials.foundation, x, 5.5, z, 0.8, 11, 0.8);
        box(
          group,
          materials.pale,
          outer - side * 3.5,
          11.4,
          0,
          11,
          0.8,
          length,
        );
        box(
          group,
          materials.accent,
          outer + side * 1.5,
          11.7,
          0,
          1,
          1.2,
          length,
        );
      } else if (desert) {
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
        const hall = spec.side > 0 && spec.section % 3 === 1;
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
          for (let i = 0; i < Math.floor((length - 8) / 6.4); i++)
            points.push([outer - side * 4, 6.25, -length / 2 + 5 + i * 6.4]);
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
    }
    crowd(group, points, side);
  }

  buildTimingStripe(root, track);

  for (const distance of [300, 160, 60]) {
    const frame = track.frame(track.finishS - distance);
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
  root.userData.finishS = track.finishS;
  return {
    root,
    foundations,
    bodies,
    update(elapsed) {
      time.value = elapsed;
    },
  };
}
