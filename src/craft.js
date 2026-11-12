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

// Narrow central pressure shells, separate structural foils and short integrated
// engine fairings. The exhaust hardpoints stay identical for all three racers.
const AIRFRAMES = [
  {
    name: "STRIKER",
    hull: [
      [5.65, 0, -0.06, 0.1, 0.08, -0.07],
      [4.3, 0, -0.02, 0.34, 0.15, -0.15],
      [2.2, 0, 0, 0.62, 0.24, -0.26],
      [0.4, 0, 0, 0.83, 0.32, -0.34],
      [-1.25, 0, 0, 0.72, 0.38, -0.32],
      [-3.12, 0, -0.05, 0.45, 0.19, -0.22],
    ],
    canopy: [
      [2.6, 0, 0.18, 0.12, 0.03, -0.03],
      [1.1, 0, 0.3, 0.34, 0.48, -0.07],
      [-0.65, 0, 0.36, 0.31, 0.39, -0.07],
      [-1.12, 0, 0.34, 0.24, 0.06, -0.05],
    ],
    // Root, swept leading edge, tip, cropped trailing edge, root.
    wing: [
      [0.64, 1.35],
      [1.15, 0.7],
      [3.0, -1.85],
      [2.94, -2.57],
      [1.4, -2.36],
      [0.65, -1.35],
    ],
    wingY: -0.1,
    engineFront: -1.25,
    engineWidth: 0.47,
  },
  {
    name: "RAPTOR",
    hull: [
      [5.1, 0, -0.06, 0.28, 0.08, -0.1],
      [3.8, 0, 0, 0.44, 0.17, -0.2],
      [1.65, 0, 0, 0.71, 0.36, -0.36],
      [-0.45, 0, 0, 0.62, 0.38, -0.33],
      [-2.15, 0, -0.02, 0.56, 0.28, -0.27],
      [-3.05, 0, -0.07, 0.32, 0.13, -0.15],
    ],
    canopy: [
      [3.0, 0, 0.19, 0.19, 0.025, -0.04],
      [1.85, 0, 0.34, 0.34, 0.39, -0.05],
      [0.4, 0, 0.37, 0.3, 0.35, -0.05],
      [-0.15, 0, 0.34, 0.22, 0.06, -0.04],
    ],
    // Forward-swept clipped wing, with a visibly open waist behind it.
    wing: [
      [0.57, 0.15],
      [2.67, 1.4],
      [3.07, 1.08],
      [2.93, 0.28],
      [1.65, -1.08],
      [0.57, -1.55],
    ],
    wingY: -0.1,
    engineFront: -1.45,
    engineWidth: 0.5,
  },
  {
    name: "WRAITH",
    hull: [
      [6.0, 0, -0.03, 0.07, 0.07, -0.08],
      [4.35, 0, 0, 0.29, 0.17, -0.19],
      [1.4, 0, 0, 0.5, 0.27, -0.3],
      [-0.8, 0, 0.01, 0.59, 0.34, -0.31],
      [-2.3, 0, -0.02, 0.48, 0.27, -0.24],
      [-3.22, 0, -0.04, 0.28, 0.13, -0.15],
    ],
    canopy: [
      [2.75, 0, 0.16, 0.09, 0.03, -0.03],
      [0.6, 0, 0.29, 0.25, 0.43, -0.04],
      [-0.95, 0, 0.34, 0.25, 0.31, -0.04],
      [-1.5, 0, 0.31, 0.15, 0.05, -0.04],
    ],
    // Double-cranked lifting foil; a long dart rather than a solid delta.
    wing: [
      [0.46, 0.6],
      [1.33, -0.1],
      [1.67, -1.18],
      [2.94, -1.6],
      [3.08, -2.48],
      [1.35, -2.29],
      [0.45, -1.65],
    ],
    wingY: -0.14,
    engineFront: -1.8,
    engineWidth: 0.44,
  },
];

// Thin closed polygonal airfoil. Triangulation handles the cranked/concave
// planforms without filling their negative space with a triangular fan.
function foil(skin, outline, side, y, thickness, tile, tipRise = 0) {
  const contour = outline.map(([x, z]) => new THREE.Vector2(x, z));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  const point = (index, top) => {
    const [x, z] = outline[index];
    return [
      side * x,
      y + (top ? thickness : -thickness) + Math.max(0, x - 1) * tipRise,
      z,
    ];
  };
  const uv = (p) => [p[0] / 6 + 0.5, (3 - p[2]) / 6];
  for (const triangle of triangles) {
    for (const top of [true, false]) {
      const points = triangle.map((index) => point(index, top));
      skin.face(
        points,
        top ? tile : 2,
        points.map(uv),
        WHITE,
        new THREE.Vector3(0, top ? 1 : -1, 0),
      );
    }
  }
  for (let i = 0; i < outline.length; i++) {
    const next = (i + 1) % outline.length;
    const points = [
      point(i, true),
      point(next, true),
      point(next, false),
      point(i, false),
    ];
    const a = contour[i],
      b = contour[next];
    const signedArea = THREE.ShapeUtils.area(contour);
    const outward =
      signedArea > 0
        ? new THREE.Vector3(side * (b.y - a.y), 0, -(b.x - a.x))
        : new THREE.Vector3(-side * (b.y - a.y), 0, b.x - a.x);
    skin.face(
      points,
      5,
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      SLATE,
      outward,
    );
  }
}

function buildHull(variant) {
  const airframe = AIRFRAMES[variant];
  const core = new Skin();
  const accent = new Skin();
  const mechanical = new Skin();
  const canopy = new Skin();
  const uv = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  loft(core, airframe.hull);
  loft(canopy, airframe.canopy, 4);

  // Narrow ventral battery keel makes the craft a volume in rear chase view.
  loft(
    mechanical,
    [
      [2.1, 0, -0.26, 0.18, 0.04, -0.1],
      [0.35, 0, -0.34, 0.32, 0.04, -0.15],
      [-1.95, 0, -0.31, 0.28, 0.03, -0.1],
      [-2.7, 0, -0.22, 0.17, 0.03, -0.06],
    ],
    2,
  );

  for (const side of [-1, 1]) {
    foil(
      core,
      airframe.wing,
      side,
      airframe.wingY,
      0.075,
      0,
      variant === 2 ? 0.05 : 0.015,
    );
    // Separate narrow painted inset follows the foil's outer half. It does not
    // turn the entire central deck into a featureless livery triangle.
    const panel = airframe.wing.map(([x, z]) => [
      0.55 + (x - 0.55) * 0.84,
      z * 0.86 - 0.15,
    ]);
    foil(
      accent,
      panel,
      side,
      airframe.wingY + 0.082,
      0.012,
      1,
      variant === 2 ? 0.05 : 0.015,
    );

    // Transverse load path joins fuselage, wing and short engine fairing. On
    // RAPTOR this swept rear spar is distinct from its forward lifting foil.
    foil(
      mechanical,
      [
        [0.46, -1.3],
        [1.5, -1.55],
        [2.66, -2.02],
        [2.74, -2.55],
        [1.45, -2.28],
        [0.46, -2.05],
      ],
      side,
      -0.13,
      0.11,
      5,
    );

    // Engine bodies occupy only the rear quarter, not long pontoon outriggers.
    loft(
      core,
      [
        [airframe.engineFront, side * 2.55, -0.1, 0.2, 0.18, -0.18],
        [
          airframe.engineFront - 0.42,
          side * 2.55,
          -0.08,
          airframe.engineWidth,
          0.32,
          -0.34,
        ],
        [-2.65, side * 2.55, -0.08, 0.49, 0.3, -0.34],
        [-3.18, side * 2.55, -0.08, 0.49, 0.28, -0.33],
      ],
      6,
      WHITE,
      "front",
    );
    for (const z of [-2.66, -2.96]) {
      loft(
        mechanical,
        [
          [z + 0.045, side * 2.55, -0.08, 0.51, 0.32, -0.35],
          [z - 0.045, side * 2.55, -0.08, 0.51, 0.32, -0.35],
        ],
        5,
        WHITE,
        false,
      );
    }
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

    // Cockpit-side ram-air shoulders: raised rim, recessed black mouth and a
    // tapered duct visibly diving into the chassis, rather than painted vents.
    const intakeZ = variant === 1 ? 0.2 : -0.2;
    const intakeX = variant === 2 ? 0.5 : 0.67;
    loft(
      core,
      [
        [intakeZ + 0.55, side * intakeX, 0.28, 0.24, 0.31, -0.08],
        [intakeZ - 0.1, side * (intakeX + 0.08), 0.3, 0.25, 0.29, -0.12],
        [-2.28, side * 0.55, 0.16, 0.13, 0.07, -0.1],
      ],
      5,
      WHITE,
    );
    mechanical.face(
      [
        [side * (intakeX - 0.16), 0.55, intakeZ + 0.56],
        [side * (intakeX + 0.16), 0.55, intakeZ + 0.56],
        [side * (intakeX + 0.16), 0.28, intakeZ + 0.56],
        [side * (intakeX - 0.16), 0.28, intakeZ + 0.56],
      ],
      3,
      uv,
      WHITE,
      new THREE.Vector3(0, 0, 1),
    );

    // A low painted nose chine meets the cockpit frame, readable from chase.
    loft(
      accent,
      [
        [variant === 2 ? 4.4 : 3.9, side * 0.19, 0.1, 0.025, 0.025, -0.02],
        [2.1, side * 0.43, 0.23, 0.055, 0.025, -0.03],
        [0.0, side * (variant === 2 ? 0.47 : 0.6), 0.32, 0.045, 0.025, -0.03],
      ],
      1,
    );
  }

  if (variant === 0) {
    // STRIKER: cropped swept wings and tall outward-raked twin rudders.
    for (const side of [-1, 1]) {
      loft(
        accent,
        [
          [-1.35, side * 1.28, 0.0, 0.035, 0.08, -0.12],
          [-2.15, side * 1.62, 0.08, 0.055, 0.95, -0.16],
          [-2.95, side * 1.73, 0.06, 0.035, 0.48, -0.13],
        ],
        1,
      );
    }
  } else if (variant === 1) {
    // RAPTOR: forward-swept main wing, cropped nose, upright centre blade.
    loft(
      accent,
      [
        [-0.9, 0, 0.32, 0.045, 0.06, -0.07],
        [-1.95, 0, 0.26, 0.065, 1.05, -0.07],
        [-2.91, 0, 0.12, 0.035, 0.6, -0.08],
      ],
      1,
    );
    for (const side of [-1, 1]) {
      foil(
        accent,
        [
          [0.3, 3.72],
          [0.9, 3.24],
          [1.18, 2.55],
          [0.38, 2.72],
        ],
        side,
        0.02,
        0.045,
        1,
      );
    }
  } else {
    // WRAITH: needle fuselage, double-cranked wing and scimitar tip fins.
    for (const side of [-1, 1]) {
      loft(
        accent,
        [
          [-1.63, side * 2.72, 0.0, 0.03, 0.05, -0.09],
          [-2.18, side * 3.02, 0.1, 0.04, 0.65, -0.12],
          [-2.77, side * 3.07, 0.1, 0.025, 0.36, -0.1],
        ],
        1,
      );
    }
    loft(
      core,
      [
        [-0.8, 0, 0.33, 0.09, 0.06, -0.03],
        [-1.9, 0, 0.28, 0.12, 0.44, -0.03],
        [-2.88, 0, 0.16, 0.06, 0.12, -0.03],
      ],
      6,
    );
  }

  const hull = {
    core: core.geometry(),
    accent: accent.geometry(),
    mechanical: mechanical.geometry(),
    canopy: canopy.geometry(),
  };
  // Keep the needle noses within the 4.25m physical contact half-length.
  // Aft stations and the established twin exhaust hardpoints remain unchanged.
  for (const geometry of Object.values(hull)) {
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      if (positions.getZ(i) > 0) positions.setZ(i, positions.getZ(i) * 0.7);
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }
  return hull;
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
    hulls: new Map(),
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

// Course teardown owns disposal; racer/grid changes must retain cached airframes.
// Merge detached variants into the scene's Sets so attached/shared resources are
// disposed exactly once by the same traversal that owns all other world assets.
export function collectCraftResources(
  scene,
  { geometries, materials, textures },
) {
  const shared = resources.get(scene);
  if (!shared) return;
  for (const hull of shared.hulls.values()) {
    for (const geometry of Object.values(hull)) geometries.add(geometry);
  }
  for (const geometry of [
    shared.flameGeometry,
    shared.glowGeometry,
    shared.shieldGeometry,
    shared.shadowGeometry,
  ])
    geometries.add(geometry);
  for (const material of [
    shared.skinMaterial,
    shared.flameMaterial,
    shared.glowMaterial,
    shared.shieldMaterial,
    shared.shadowMaterial,
    ...shared.liveries.values(),
  ]) {
    materials.add(material);
    if (material.map) textures.add(material.map);
  }
  resources.delete(scene);
}

export function createCraft(scene, color, variant = 0) {
  let shared = resources.get(scene);
  if (!shared) {
    shared = buildResources();
    resources.set(scene, shared);
  }
  let hull = shared.hulls.get(variant);
  if (!hull) {
    hull = buildHull(variant);
    shared.hulls.set(variant, hull);
  }
  let livery = shared.liveries.get(color);
  if (!livery) {
    livery = shared.skinMaterial.clone();
    // Saturated racing color belongs to the pods, not the ceramic fuselage.
    livery.color.set(color).lerp(WHITE, 0.14);
    shared.liveries.set(color, livery);
  }
  const craft = new THREE.Group();
  craft.name = AIRFRAMES[variant].name;
  craft.userData.variant = variant;
  for (const name of ["core", "mechanical", "canopy"]) {
    const mesh = new THREE.Mesh(hull[name], shared.skinMaterial);
    mesh.name = name;
    craft.add(mesh);
  }
  craft.add(new THREE.Mesh(hull.accent, livery));
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
