import * as THREE from "three";
import { Lensflare, LensflareElement } from "three/addons/objects/Lensflare.js";

// A single directional key, not a bank of per-pixel lights. Night projector pools
// are baked into the deck vertices; their physical luminaires sit over each pool.
export function buildTrackLighting(scene, track) {
  const night = track.config.name === "NOCTILUCENT";
  const desert = track.config.name === "SOLAR ARRAY";
  const direction = new THREE.Vector3(
    ...(night
      ? [-0.4, 0.12, -0.7]
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
  // A readable low-horizon sun, with an amber lower limb and soft hot centre.
  // It remains a depth-tested world object, not an exposure wash over the HUD.
  const sunRadius = 34;
  let sunMap = null;
  if (!night) {
    const surface = document.createElement("canvas");
    surface.width = 128;
    surface.height = 128;
    const paint = surface.getContext("2d");
    const atmosphere = paint.createLinearGradient(0, 0, 0, 128);
    atmosphere.addColorStop(0, "#fff1c5");
    atmosphere.addColorStop(0.45, "#ffdc8c");
    atmosphere.addColorStop(1, "#ed8549");
    paint.fillStyle = atmosphere;
    paint.fillRect(0, 0, 128, 128);
    sunMap = new THREE.CanvasTexture(surface);
    sunMap.colorSpace = THREE.SRGBColorSpace;
  }
  const disc = new THREE.Mesh(
    new THREE.SphereGeometry(night ? 24 : sunRadius, 32, 16),
    new THREE.MeshBasicMaterial({
      color: night ? 0xc5d8ef : 0xffffff,
      map: sunMap,
      fog: false,
      toneMapped: false,
    }),
  );
  celestial.add(disc);
  if (night) {
    // Low-poly maria, not a uniform white lamp in the sky.
    const maria = new THREE.Mesh(
      new THREE.IcosahedronGeometry(17.6, 1),
      new THREE.MeshBasicMaterial({ color: 0x90a6c3, fog: false }),
    );
    maria.scale.set(0.6, 0.8, 0.7);
    maria.position.set(8, 0, 14.4);
    celestial.add(maria);
  }
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowMap,
      color: night ? 0xadcfff : 0xffba80,
      transparent: true,
      opacity: night ? 0.14 : 0.32,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.scale.setScalar(night ? 140 : 245);
  celestial.add(halo);
  let flare;
  if (!night) {
    // Three's flare samples depth occlusion at its actual world-space source.
    // It vanishes behind track architecture and never follows the screen centre.
    flare = new Lensflare();
    // Put the source just in front of its own sun disc; scenery still occludes it.
    flare.position.copy(direction).multiplyScalar(-(sunRadius + 3));
    flare.addElement(
      new LensflareElement(glowMap, 115, 0, new THREE.Color(0xffd2ab)),
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
    const headGeometry = new THREE.BoxGeometry(5.2, 0.7, 2.2);
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0x9ecbff,
      transparent: true,
      opacity: 0.055,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const poolMaterial = new THREE.MeshBasicMaterial({
      map: glowMap,
      color: 0x96bfff,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
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
      lens.scale.set(0.84, 0.72, 0.045);
      lens.position
        .copy(top)
        .add(new THREE.Vector3(0, 0, 1.16).applyQuaternion(head.quaternion));
      lens.quaternion.copy(head.quaternion);
      // Each shaft's rim follows the illuminated road, not a tilted cone base.
      // The actual exposed lens is the apex; every rim point lands on the pool.
      const apex = lens.position
        .clone()
        .add(new THREE.Vector3(0, 0, 0.05).applyQuaternion(head.quaternion));
      const rim = [];
      for (let i = 0; i < 32; i++) {
        const angle = (i / 32) * Math.PI * 2;
        const section = track.frame(u * track.length + Math.sin(angle) * 30);
        rim.push(
          section.p
            .clone()
            .addScaledVector(
              section.right,
              Math.cos(angle) * section.width * 0.8,
            )
            .addScaledVector(section.up, 0.045),
        );
      }
      const shaftPositions = [];
      for (let i = 0; i < rim.length; i++) {
        shaftPositions.push(
          ...apex.toArray(),
          ...rim[i].toArray(),
          ...rim[(i + 1) % rim.length].toArray(),
        );
      }
      const beamGeometry = new THREE.BufferGeometry();
      beamGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(shaftPositions, 3),
      );
      const beam = new THREE.Mesh(beamGeometry, beamMaterial);
      beam.name = "projector-shaft";
      // A road-conforming pool has its own low radiance, so dark asphalt still
      // catches the projector. It cannot spill beyond the deck onto open water.
      const positions = [],
        uvs = [],
        indices = [];
      for (let row = 0; row <= 8; row++) {
        const section = track.frame(u * track.length + (row / 8 - 0.5) * 74);
        for (let column = 0; column <= 4; column++) {
          const point = section.p
            .clone()
            .addScaledVector(
              section.right,
              (column / 4 - 0.5) * section.width * 1.88,
            )
            .addScaledVector(section.up, 0.045);
          positions.push(...point.toArray());
          uvs.push(column / 4, row / 8);
          if (row < 8 && column < 4) {
            const a = row * 5 + column;
            indices.push(a, a + 5, a + 1, a + 1, a + 5, a + 6);
          }
        }
      }
      const poolGeometry = new THREE.BufferGeometry();
      poolGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      poolGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      poolGeometry.setIndex(indices);
      const lightPool = new THREE.Mesh(poolGeometry, poolMaterial);
      scene.add(mast, head, lens, beam, lightPool);
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
        .multiplyScalar(0.7 + strength * 1.3)
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
