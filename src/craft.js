import * as THREE from "three";

// One resource set per world: no per-racer texture loads or geometry allocations.
// The world owns disposal, so a rebuilt scene receives a fresh set.
const resources = new WeakMap();
const WHITE = new THREE.Color(0xffffff);
const SLATE = new THREE.Color(0x8799a5);

function atlasUV(tile, u, v) {
  const inset = 2 / 256;
  return [
    ((tile % 4) + inset + u * (1 - inset * 2)) / 4,
    1 - (Math.floor(tile / 4) + inset + v * (1 - inset * 2)) / 2,
  ];
}

class Skin {
  constructor() {
    this.positions = [];
    this.uvs = [];
    this.colors = [];
  }
  face(points, tile, uvs, color = WHITE, outward) {
    let order = points.length === 3 ? [0, 1, 2] : [0, 1, 2, 0, 2, 3];
    if (outward) {
      const a = new THREE.Vector3(...points[0]);
      const normal = new THREE.Vector3(...points[1])
        .sub(a)
        .cross(new THREE.Vector3(...points[2]).sub(a));
      if (normal.dot(outward) < 0)
        order = points.length === 3 ? [0, 2, 1] : [0, 2, 1, 0, 3, 2];
    }
    for (const i of order) {
      this.positions.push(...points[i]);
      this.uvs.push(...atlasUV(tile, ...uvs[i]));
      this.colors.push(color.r, color.g, color.b);
    }
  }
  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(this.positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(this.colors, 3),
    );
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

// Chamfered sections explicitly describe the silhouette, rather than scaling boxes.
// z, center-x, center-y, half-width, top, bottom.
function ring([z, x, y, w, top, bottom]) {
  return [
    [x - w * 0.67, y + top, z],
    [x + w * 0.67, y + top, z],
    [x + w, y + top * 0.42, z],
    [x + w, y + bottom * 0.5, z],
    [x + w * 0.62, y + bottom, z],
    [x - w * 0.62, y + bottom, z],
    [x - w, y + bottom * 0.5, z],
    [x - w, y + top * 0.42, z],
  ];
}

function loft(skin, sections, tile = 0, tint = WHITE, caps = true) {
  const rings = sections.map(ring);
  const z0 = sections[0][0];
  const length = z0 - sections.at(-1)[0];
  const halfWidth = Math.max(...sections.map((s) => s[3]));
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < 8; i++) {
      const next = (i + 1) % 8;
      const p = [
        rings[j][i],
        rings[j][next],
        rings[j + 1][next],
        rings[j + 1][i],
      ];
      const isTop = i === 0;
      const isBevel = i === 1 || i === 7;
      const selected = isTop || isBevel ? tile : i === 4 ? 2 : 5;
      const color = isTop
        ? tint
        : isBevel
          ? tint.clone().multiplyScalar(0.8)
          : SLATE;
      const uv = p.map(([x, , z], vertex) => {
        // Face the printed deck artwork toward the rear chase camera.
        const center = sections[vertex < 2 ? j : j + 1][1];
        return [0.5 - (x - center) / (halfWidth * 2), (z0 - z) / length];
      });
      const midpoint = new THREE.Vector3();
      for (const v of p) midpoint.add(new THREE.Vector3(...v));
      midpoint.multiplyScalar(0.25);
      midpoint.x -= (sections[j][1] + sections[j + 1][1]) / 2;
      midpoint.y -= (sections[j][2] + sections[j + 1][2]) / 2;
      midpoint.z = 0;
      skin.face(p, selected, uv, color, midpoint);
    }
  }
  if (caps) {
    const ends =
      caps === "front"
        ? [[0, 1]]
        : [
            [0, 1],
            [rings.length - 1, -1],
          ];
    for (const [j, direction] of ends) {
      const r = rings[j];
      // Three quads tile the octagonal cross-section without a central fan.
      for (const indices of [
        [0, 1, 2, 7],
        [7, 2, 3, 6],
        [6, 3, 4, 5],
      ]) {
        skin.face(
          indices.map((i) => r[i]),
          3,
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
          WHITE,
          new THREE.Vector3(0, 0, direction),
        );
      }
    }
  }
}

function buildResources() {
  const loader = new THREE.TextureLoader();
  const atlas = loader.load("/art/craft-livery.png");
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.magFilter = THREE.NearestFilter;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.anisotropy = 2;
  const skinMaterial = new THREE.MeshLambertMaterial({
    map: atlas,
    vertexColors: true,
    flatShading: true,
  });
  const core = new Skin();
  // One continuous monocoque wedge: shoulders, engines and prow share a hull.
  // No separate outrigger noses or open watercraft-like structure.
  const hullSections = [
    [5.65, 0, -0.1, 0.035, 0.025, -0.06],
    [3.5, 0, -0.04, 0.68, 0.1, -0.17],
    [1.6, 0, 0, 1.58, 0.18, -0.25],
    [-0.3, 0, 0, 2.63, 0.26, -0.3],
    [-1.9, 0, -0.04, 3.05, 0.31, -0.33],
    [-3.18, 0, -0.02, 3.02, 0.26, -0.48],
  ];
  loft(core, hullSections, 0, WHITE, "front");
  // Real rear apertures preserve sightlines into the original recessed engines.
  const rear = ring(hullSections.at(-1));
  const outline = rear.map(([x, y]) => new THREE.Vector2(x, y));
  const holes = [-1, 1].map((side) =>
    ring([-3.18, side * 2.55, -0.08, 0.33, 0.16, -0.2]).map(
      ([x, y]) => new THREE.Vector2(x, y),
    ),
  );
  const rearPoints = [outline, ...holes].flat();
  for (const triangle of THREE.ShapeUtils.triangulateShape(outline, holes)) {
    const points = triangle.map((index) => [
      rearPoints[index].x,
      rearPoints[index].y,
      -3.18,
    ]);
    core.face(
      points,
      3,
      points.map(([x, y]) => [x / 6.04 + 0.5, y + 0.5]),
      WHITE,
      new THREE.Vector3(0, 0, -1),
    );
  }
  // A narrow exposed keel, rather than a second bulky hull.
  loft(
    core,
    [
      [2.35, 0, -0.21, 0.15, 0.03, -0.07],
      [0.5, 0, -0.25, 0.32, 0.03, -0.13],
      [-1.9, 0, -0.31, 0.4, 0.02, -0.12],
      [-2.65, 0, -0.24, 0.35, 0.02, -0.08],
    ],
    2,
  );

  const accent = new Skin();
  const mechanical = new Skin();
  for (const side of [-1, 1]) {
    const uv = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    // Painted load-bearing shoulder panels follow the same continuous hull.
    for (let i = 0; i < hullSections.length - 1; i++) {
      const points = [hullSections[i], hullSections[i + 1]].flatMap(
        ([z, , y, width, top], end) =>
          (end ? [0.61, 0.29] : [0.29, 0.61]).map((across) => [
            side * width * across,
            y + top + 0.008,
            z,
          ]),
      );
      accent.face(points, 1, uv, WHITE, new THREE.Vector3(0, 1, 0));
    }
    // Unpainted thrust rings sit proud of the tapered composite pods.
    for (const z of [-2.66, -2.96]) {
      loft(
        mechanical,
        [
          [z + 0.045, side * 2.55, -0.08, 0.5, 0.3, -0.34],
          [z - 0.045, side * 2.55, -0.08, 0.5, 0.3, -0.34],
        ],
        5,
        WHITE,
        false,
      );
    }
    // Recessed, chamfered engine mouths with dark inner walls and a backplate.
    const outer = ring([-3.25, side * 2.55, -0.08, 0.49, 0.28, -0.33]);
    const inner = ring([-3.29, side * 2.55, -0.08, 0.31, 0.14, -0.18]);
    const back = ring([-2.97, side * 2.55, -0.08, 0.28, 0.12, -0.15]);
    for (let i = 0; i < 8; i++) {
      const k = (i + 1) % 8;
      mechanical.face(
        [outer[i], outer[k], inner[k], inner[i]],
        5,
        uv,
        WHITE,
        new THREE.Vector3(0, 0, -1),
      );
      mechanical.face(
        [inner[i], inner[k], back[k], back[i]],
        3,
        uv,
        WHITE,
        new THREE.Vector3(0, 0, -1),
      );
    }
    mechanical.face(
      [back[0], back[1], back[4], back[5]],
      3,
      uv,
      WHITE,
      new THREE.Vector3(0, 0, -1),
    );
    // Flush cooling slots belong to the integrated shoulders, not side pods.
    const x = side * 1.17;
    mechanical.face(
      [
        [x - 0.13, 0.212, 0.9],
        [x + 0.13, 0.212, 0.9],
        [x + 0.17, 0.267, -0.7],
        [x - 0.17, 0.267, -0.7],
      ],
      7,
      uv,
      WHITE,
      new THREE.Vector3(0, 1, 0),
    );
  }

  // Angular framed canopy grows out of the spine, and leans forward into the nose.
  const canopy = new Skin();
  loft(
    canopy,
    [
      [2.05, 0, 0.14, 0.12, 0.025, -0.04],
      [0.25, 0, 0.24, 0.34, 0.37, -0.04],
      [-0.83, 0, 0.25, 0.3, 0.3, -0.03],
      [-1.38, 0, 0.23, 0.2, 0.05, -0.05],
    ],
    4,
  );

  const flameSkin = new Skin();
  // Two crossed tapered ribbons; alpha feathers to a point rather than an opaque cone.
  for (const points of [
    [
      [-0.3, 0, 0],
      [0.3, 0, 0],
      [0.035, 0, -3.3],
      [-0.035, 0, -3.3],
    ],
    [
      [0, -0.19, 0],
      [0, 0.19, 0],
      [0, 0.025, -3.3],
      [0, -0.025, -3.3],
    ],
  ]) {
    flameSkin.face(points, 0, [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
  }
  const flameGeometry = flameSkin.geometry();
  // The exhaust owns a standalone texture, so use its entire UV rectangle.
  flameGeometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      [0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0],
      2,
    ),
  );
  const exhaustMap = loader.load("/art/craft-exhaust.png");
  exhaustMap.colorSpace = THREE.SRGBColorSpace;
  const flameMaterial = new THREE.MeshBasicMaterial({
    map: exhaustMap,
    color: 0x71ecff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x9dffff });
  const glowGeometry = new THREE.PlaneGeometry(0.47, 0.19);
  const shieldGeometry = new THREE.SphereGeometry(1, 24, 12);
  shieldGeometry.scale(4.3, 1.45, 5);
  const shieldMaterial = new THREE.MeshPhongMaterial({
    color: 0x65f1ff,
    emissive: 0x123943,
    specular: 0xbaffff,
    shininess: 90,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shadowGeometry = new THREE.CircleGeometry(3.7, 12);
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x10202b,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
  });
  return {
    core: core.geometry(),
    accent: accent.geometry(),
    mechanical: mechanical.geometry(),
    canopy: canopy.geometry(),
    skinMaterial,
    flameGeometry,
    flameMaterial,
    glowMaterial,
    glowGeometry,
    shieldGeometry,
    shieldMaterial,
    shadowGeometry,
    shadowMaterial,
    liveries: new Map(),
  };
}

export function createCraft(scene, color) {
  let shared = resources.get(scene);
  if (!shared) {
    shared = buildResources();
    resources.set(scene, shared);
  }
  let livery = shared.liveries.get(color);
  if (!livery) {
    livery = shared.skinMaterial.clone();
    // Saturated racing color belongs to the pods, not the ceramic fuselage.
    livery.color.set(color).lerp(WHITE, 0.14);
    shared.liveries.set(color, livery);
  }
  const craft = new THREE.Group();
  craft.name = "racer-07";
  for (const name of ["core", "mechanical", "canopy"]) {
    const mesh = new THREE.Mesh(shared[name], shared.skinMaterial);
    mesh.name = name;
    craft.add(mesh);
  }
  craft.add(new THREE.Mesh(shared.accent, livery));
  const flames = [];
  for (const side of [-1, 1]) {
    const flame = new THREE.Mesh(shared.flameGeometry, shared.flameMaterial);
    flame.name = "exhaust";
    flame.position.set(side * 2.55, -0.08, -3.32);
    craft.add(flame);
    flames.push(flame);
    const glow = new THREE.Mesh(shared.glowGeometry, shared.glowMaterial);
    glow.position.set(side * 2.55, -0.1, -3.015);
    glow.rotation.y = Math.PI;
    craft.add(glow);
  }
  const shield = new THREE.Mesh(shared.shieldGeometry, shared.shieldMaterial);
  shield.name = "shield";
  shield.visible = false;
  scene.add(shield);
  craft.userData.shield = shield;
  const shadow = new THREE.Mesh(shared.shadowGeometry, shared.shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow, craft);
  craft.userData.shadow = shadow;
  craft.userData.updateExhaust = (speed, boost, time) => {
    const length = (0.25 + Math.min(1.4, speed / 175)) * (1 + boost * 0.65);
    for (let i = 0; i < flames.length; i++) {
      const flame = flames[i];
      flame.scale.z = length * (1 + Math.sin(time * 47 + i * 2) * 0.045);
      flame.scale.x = 1 + boost * 0.18;
      flame.scale.y = 1 + boost * 0.18;
    }
  };
  craft.userData.updateExhaust(0, false, 0);
  return craft;
}
