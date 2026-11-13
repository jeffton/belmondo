import * as THREE from "three";
import { advertisingCellUV } from "./advertising-art.js";

const ATLAS =
  "/art/openai-image-2026-11-11T16-25-29-514Z-ig_0a4106913d49f121016af496c5017087d286f627a074fae0ad.png";

// Four original tenants share one image atlas. Spatial batches keep facade ads
// in the ordinary camera frustum; no per-frame updates or transparent glow layers.
export function createAdvertising(
  scene,
  atlas = ATLAS,
  columns = 2,
  rows = 2,
  region = [0, 0, 1, 1],
  freestanding = false,
) {
  const root = new THREE.Group();
  root.name = "district-advertising";
  scene.add(root);
  const texture = new THREE.TextureLoader().load(atlas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  const panelMaterial = new THREE.MeshBasicMaterial({ map: texture });
  const housingMaterial = new THREE.MeshLambertMaterial({ color: 0x142333 });
  const neonMaterials = [
    0xff654d, 0x9bffd9, 0xbcafff, 0xf3f5e7, 0xff654d, 0xbcafff, 0x9bffd9,
    0xf3f5e7,
  ].map((color) => new THREE.MeshBasicMaterial({ color }));
  const box = new THREE.BoxGeometry(1, 1, 1);
  const chunks = new Map();
  const transform = new THREE.Object3D();

  function facade(position, yaw, size, brand, height = size) {
    const key = `${Math.floor(position.x / 256)}:${Math.floor(position.z / 256)}`;
    if (!chunks.has(key))
      chunks.set(key, { positions: [], uv: [], details: [] });
    const chunk = chunks.get(key);
    const rotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      yaw,
    );
    const corner = (x, y, z) =>
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
    const detail = (x, y, z, w, h, d, material) => {
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
        details.forEach((d, i) => mesh.setMatrixAt(i, d.matrix));
        mesh.computeBoundingSphere();
        root.add(mesh);
      }
    }
  }
  return { facade, finish };
}
