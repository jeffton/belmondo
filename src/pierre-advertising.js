import * as THREE from "three";

// Original OpenAI-image artwork, preserved intact. The two parallelogram-shaped
// banners are sampled directly from the design board, excluding its white margins.
const DESIGNS = [
  [
    [1276, 115],
    [1930, 115],
    [1974, 32],
    [1319, 36],
  ],
  [
    [57, 617],
    [723, 617],
    [765, 549],
    [98, 549],
  ],
];

export function createPierreAdvertising(scene) {
  const root = new THREE.Group();
  root.name = "pierre-belmondo-advertising";
  scene.add(root);
  const map = new THREE.TextureLoader().load(
    "/art/pierre-belmondo-banner-designs.png",
  );
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.NearestFilter;
  const artwork = new THREE.MeshBasicMaterial({ map });
  const housing = new THREE.MeshLambertMaterial({ color: 0x132330 });

  function facade(position, yaw, width, design, height) {
    const group = new THREE.Group();
    group.name = `pierre-belmondo-${design === 0 ? "orbital" : "stellar"}`;
    group.position.copy(position);
    group.rotation.y = yaw;
    const shear = width * 0.06;
    const points = [
      [-width / 2, -height / 2],
      [width / 2 - shear, -height / 2],
      [width / 2, height / 2],
      [-width / 2 + shear, height / 2],
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        points.flatMap(([x, y]) => [x, y, 0.36]),
        3,
      ),
    );
    geometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(
        DESIGNS[design].flatMap(([x, y]) => [x / 2000, 1 - y / 668]),
        2,
      ),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    const shape = new THREE.Shape(
      points.map(([x, y]) => new THREE.Vector2(x, y)),
    );
    group.add(
      new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false }),
        housing,
      ),
    );
    group.add(new THREE.Mesh(geometry, artwork));
    root.add(group);
  }

  return { facade };
}
