import * as THREE from "three";
import { advertisingCellUV } from "./advertising-art.ts";

const ATLAS = "/art/kaiseki-tenant-plaques.webp";

// Four original tenants share one image atlas. Spatial batches keep facade ads
// in the ordinary camera frustum; no per-frame updates or transparent glow layers.
export function createAdvertising(
  scene: THREE.Object3D,
  atlas = ATLAS,
  columns = 2,
  rows = 2,
  region = [0, 0, 1, 1],
  freestanding = false,
  railColors = [
    0xee4e42, 0xf2a53a, 0xa1f3ef, 0xc4aaf3, 0xf171bc, 0x93ebd7, 0xf3e5c4,
    0xef4c47,
  ],
) {
  const root = new THREE.Group();
  root.name = "district-advertising";
  scene.add(root);
  const texture = new THREE.TextureLoader().load(atlas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  const panelMaterial = new THREE.MeshBasicMaterial({ map: texture });
  const housingMaterial = new THREE.MeshLambertMaterial({ color: 0x221b1c });
  const neonMaterials = railColors.map(
    (color) => new THREE.MeshBasicMaterial({ color }),
  );
  const box = new THREE.BoxGeometry(1, 1, 1);
  const chunks = new Map<
    string,
    {
      positions: number[];
      uv: number[];
      details: { matrix: THREE.Matrix4; material: THREE.Material }[];
    }
  >();
  const transform = new THREE.Object3D();

  function facade(
    position: THREE.Vector3,
    yaw: number,
    size: number,
    brand: number,
    height = size,
  ) {
    const key = `${Math.floor(position.x / 256)}:${Math.floor(position.z / 256)}`;
    if (!chunks.has(key))
      chunks.set(key, { positions: [], uv: [], details: [] });
    const chunk = chunks.get(key)!;
    const rotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      yaw,
    );
    const corner = (x: number, y: number, z: number) =>
      new THREE.Vector3(x, y, z).applyQuaternion(rotation).add(position);
    const faceDepth = freestanding ? 0.86 : 0.35;
    const railDepth = freestanding ? 0.95 : 0.2;
    const corners = [
      corner(-size / 2, -height / 2, faceDepth),
      corner(size / 2, -height / 2, faceDepth),
      corner(size / 2, height / 2, faceDepth),
      corner(-size / 2, height / 2, faceDepth),
    ];
    const uv = advertisingCellUV(brand, columns, rows, region);
    for (const i of [0, 1, 2, 0, 2, 3]) {
      chunk.positions.push(...corners[i].toArray());
      chunk.uv.push(...uv[i]);
    }
    const detail = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      material: THREE.Material,
    ) => {
      transform.position.copy(corner(x, y, z));
      transform.quaternion.copy(rotation);
      transform.scale.set(w, h, d);
      transform.updateMatrix();
      chunk.details.push({ matrix: transform.matrix.clone(), material });
    };
    detail(
      0,
      0,
      0,
      size + (freestanding ? 1.2 : 0.7),
      height + (freestanding ? 1.2 : 0.7),
      freestanding ? 1.5 : 0.6,
      housingMaterial,
    );
    // Deep side fins and a cantilevered lower sill make a physical roadside
    // object, rather than a texture suspended in front of the skyline.
    if (freestanding) {
      detail(0, -height / 2 - 0.9, 0.7, size + 2.8, 0.8, 2.8, housingMaterial);
      detail(-size / 2 - 0.7, 0, -0.6, 0.8, height + 3.2, 2.5, housingMaterial);
    }
    // Campaign-specific light rails break up the silhouette.
    const railSide = brand % 2 === 0 ? -1 : 1;
    const railEdge = brand % 3 === 0 ? 1 : -1;
    detail(
      railSide * (size / 2 + 0.6),
      0,
      railDepth,
      0.2,
      height + 1.5,
      0.25,
      neonMaterials[brand],
    );
    detail(
      0,
      railEdge * (height / 2 + 0.6),
      railDepth,
      size + 1.5,
      0.2,
      0.25,
      neonMaterials[brand],
    );
  }

  function finish() {
    for (const chunk of chunks.values()) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(chunk.positions, 3),
      );
      geometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(chunk.uv, 2),
      );
      geometry.computeBoundingSphere();
      root.add(new THREE.Mesh(geometry, panelMaterial));
      for (const material of [housingMaterial, ...neonMaterials]) {
        const details = chunk.details.filter((d) => d.material === material);
        if (!details.length) continue;
        const mesh = new THREE.InstancedMesh(box, material, details.length);
        details.forEach((d, i: number) => mesh.setMatrixAt(i, d.matrix));
        mesh.computeBoundingSphere();
        root.add(mesh);
      }
    }
  }
  return { facade, finish };
}
