import * as THREE from "three";
import { Lensflare, LensflareElement } from "three/addons/objects/Lensflare.js";

// A single directional key, not a bank of per-pixel lights. Night projector pools
// are baked into the deck vertices; their physical luminaires sit over each pool.
export function buildTrackLighting(scene, track) {
  const night = track.config.name === "NOCTILUCENT";
  const desert = track.config.name === "SOLAR ARRAY";
  const direction = new THREE.Vector3(
    ...(night
      ? [-0.4, 0.55, -0.7]
      : desert
        ? [0.75, 0.18, -0.6]
        : [-0.8, 0.16, 0.55]),
  ).normalize();
  scene.add(
    new THREE.HemisphereLight(
      night ? 0x819ccf : 0xb6c9ec,
      night ? 0x151b32 : 0x393349,
      0.85,
    ),
  );
  const key = new THREE.DirectionalLight(
    night ? 0xa2bcf0 : desert ? 0xffb071 : 0xffc29b,
    night ? 1.05 : 2.5,
  );
  key.position.copy(direction).multiplyScalar(1000);
  scene.add(key);
  const fill = new THREE.DirectionalLight(
    night ? 0x536eaa : 0x748ec3,
    night ? 0.28 : 0.32,
  );
  fill.position.copy(direction).multiplyScalar(-1000);
  fill.position.y = 200;
  scene.add(fill);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, "rgba(255,246,218,1)");
  glow.addColorStop(0.15, "rgba(255,216,166,.65)");
  glow.addColorStop(0.45, "rgba(255,160,105,.09)");
  glow.addColorStop(1, "rgba(255,160,105,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  const glowMap = new THREE.CanvasTexture(canvas);
  glowMap.colorSpace = THREE.SRGBColorSpace;
  const celestial = new THREE.Group();
  celestial.name = night ? "moon" : "low-sun";
  const disc = new THREE.Mesh(
    new THREE.SphereGeometry(night ? 15 : 10, 12, 8),
    new THREE.MeshBasicMaterial({
      color: night ? 0xc5d8ef : 0xffe1b4,
      fog: false,
    }),
  );
  celestial.add(disc);
  if (night) {
    // Low-poly maria, not a uniform white lamp in the sky.
    const maria = new THREE.Mesh(
      new THREE.IcosahedronGeometry(11, 1),
      new THREE.MeshBasicMaterial({ color: 0x90a6c3, fog: false }),
    );
    maria.scale.set(0.6, 0.8, 0.7);
    maria.position.set(5, 0, 9);
    celestial.add(maria);
  }
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowMap,
      color: night ? 0xadcfff : 0xffba80,
      transparent: true,
      opacity: night ? 0.14 : 0.4,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.scale.setScalar(night ? 100 : 150);
  celestial.add(halo);
  let flare;
  if (!night) {
    // Three's flare samples depth occlusion at its actual world-space source.
    // It vanishes behind track architecture and never follows the screen centre.
    flare = new Lensflare();
    // Put the source just in front of its own sun disc; scenery still occludes it.
    flare.position.copy(direction).multiplyScalar(-12);
    flare.addElement(
      new LensflareElement(glowMap, 100, 0, new THREE.Color(0xffd2ab)),
    );
    flare.addElement(
      new LensflareElement(glowMap, 25, 0.35, new THREE.Color(0xb9c5ff)),
    );
    celestial.add(flare);
  }
  scene.add(celestial);

  const pools = [];
  if (night) {
    const housing = new THREE.MeshLambertMaterial({ color: 0x3b485b });
    const lamp = new THREE.MeshBasicMaterial({ color: 0xd8eaff });
    const mastGeometry = new THREE.BoxGeometry(0.55, 1, 0.55);
    const headGeometry = new THREE.BoxGeometry(3, 0.5, 1.7);
    for (const u of [0.045, 0.16, 0.255, 0.49, 0.59, 0.735, 0.93]) {
      const f = track.frame(u * track.length);
      const side = u < 0.5 ? -1 : 1;
      const base = f.p.clone().addScaledVector(f.right, side * (f.width + 3));
      const top = base.clone().addScaledVector(f.up, 17);
      const mast = new THREE.Mesh(mastGeometry, housing);
      mast.scale.y = 17;
      mast.position.copy(base).addScaledVector(f.up, 8.5);
      mast.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), f.up);
      const head = new THREE.Mesh(headGeometry, housing);
      head.position.copy(top);
      head.lookAt(f.p);
      const lens = new THREE.Mesh(headGeometry, lamp);
      lens.scale.set(0.8, 0.1, 0.8);
      lens.position.copy(top).addScaledVector(f.up, -0.3);
      lens.quaternion.copy(head.quaternion);
      scene.add(mast, head, lens);
      pools.push({ p: f.p, right: f.right, tangent: f.tangent });
    }
  }
  return {
    shade(point, color) {
      if (!night) return color;
      let strength = 0;
      for (const pool of pools) {
        const delta = point.clone().sub(pool.p);
        const radius =
          (delta.dot(pool.right) / 30) ** 2 +
          (delta.dot(pool.tangent) / 40) ** 2;
        strength = Math.max(strength, Math.max(0, 1 - radius) ** 2);
      }
      return new THREE.Color(color)
        .multiplyScalar(0.75 + strength * 0.85)
        .getHex();
    },
    update(camera) {
      celestial.position.copy(camera.position).addScaledVector(direction, 950);
    },
    dispose() {
      flare?.dispose();
      // The glow also belongs to the halo; its normal scene cleanup handles night.
    },
  };
}
