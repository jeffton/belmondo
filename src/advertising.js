import * as THREE from "three";

const ATLAS =
  "/art/openai-image-2026-11-11T16-25-29-514Z-ig_0a4106913d49f121016af496c5017087d286f627a074fae0ad.png";

// Four original tenants share one image atlas. Spatial batches keep facade ads
// in the ordinary camera frustum; no per-frame updates or transparent glow layers.
export function createAdvertising(scene) {
  const root = new THREE.Group();
  root.name = "district-advertising";
  scene.add(root);
  const texture = new THREE.TextureLoader().load(ATLAS);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  const panelMaterial = new THREE.MeshBasicMaterial({ map: texture });
  const housingMaterial = new THREE.MeshLambertMaterial({ color: 0x132330 });
  const neonMaterials = [0xff5334, 0xc9ff00, 0x16e5ef, 0xff007c].map(
    (color) => new THREE.MeshBasicMaterial({ color }),
  );
  const box = new THREE.BoxGeometry(1, 1, 1);
  const chunks = new Map();
  const transform = new THREE.Object3D();

  function facade(position, yaw, size, brand) {
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
    const corners = [
      corner(-size / 2, -size / 2, 0.35),
      corner(size / 2, -size / 2, 0.35),
      corner(size / 2, size / 2, 0.35),
      corner(-size / 2, size / 2, 0.35),
    ];
    // Inset UVs exclude adjacent atlas cells at minified mip levels.
    const inset = 0.002;
    const u = (brand % 2) * 0.5;
    const v = brand < 2 ? 0.5 : 0;
    const uv = [
      [u + inset, v + inset],
      [u + 0.5 - inset, v + inset],
      [u + 0.5 - inset, v + 0.5 - inset],
      [u + inset, v + 0.5 - inset],
    ];
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
    detail(0, 0, 0, size + 0.7, size + 0.7, 0.6, housingMaterial);
    // Asymmetric light rails are physical fixtures, not floating holograms.
    detail(
      -size / 2 - 0.6,
      0,
      0.2,
      0.2,
      size + 1.5,
      0.25,
      neonMaterials[brand],
    );
    detail(
      0,
      -size / 2 - 0.6,
      0.2,
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

export function buildSplitMarkers(scene, track) {
  const f = track.frame((track.config.split[0] - 0.018) * track.length);
  const dark = new THREE.MeshLambertMaterial({ color: 0x142936 });
  const light = new THREE.MeshBasicMaterial({ color: 0xbafbed });
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const side of [-1, 1]) {
    const marker = new THREE.Group();
    marker.name = "split-chevron";
    marker.position.copy(f.p).addScaledVector(f.right, side * (f.width + 1.5));
    // Front face points toward approaching traffic, independently of track right.
    marker.rotation.y = Math.atan2(-f.tangent.x, -f.tangent.z);
    const put = (x, y, z, w, h, d, material, roll = 0) => {
      const mesh = new THREE.Mesh(box, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(w, h, d);
      mesh.rotation.z = roll;
      marker.add(mesh);
    };
    put(0, 2, 0, 0.25, 4, 0.3, dark);
    put(0, 4.5, 0, 4, 2.8, 0.45, dark);
    // Both routes remain indicated, with no ad-like overhead gantry or words.
    for (const direction of [-1, 1]) {
      put(
        direction * 0.8,
        4.82,
        0.25,
        1.05,
        0.22,
        0.08,
        light,
        -direction * 0.65,
      );
      put(
        direction * 0.8,
        4.18,
        0.25,
        1.05,
        0.22,
        0.08,
        light,
        direction * 0.65,
      );
    }
    scene.add(marker);
  }
}
