import type { Track } from "./track.ts";
import { buildNoctilucentLighting } from "./noctilucent-lighting.ts";
import * as THREE from "three";
import { Lensflare, LensflareElement } from "three/addons/objects/Lensflare.js";
import { COURSE_LIGHTING, celestialDirection } from "./course-lighting.ts";
export { celestialDirection } from "./course-lighting.ts";
import { buildSectionalValues } from "./sectional-values.ts";

// A single directional key, not a bank of per-pixel lights. Night projector pools
// are baked into the deck vertices; their physical luminaires sit over each pool.
export function buildTrackLighting(scene: THREE.Object3D, track: Track) {
  const night =
    track.config.name === "NOCTILUCENT" || track.config.biome === "metropolis";
  const palette = COURSE_LIGHTING[track.config.name];
  const direction = celestialDirection(track.config.name);
  const sectionalValues = buildSectionalValues(track, direction);
  scene.add(new THREE.HemisphereLight(...palette.hemisphere, 0.85));
  const key = new THREE.DirectionalLight(...palette.key);
  key.position.copy(direction).multiplyScalar(1000);
  scene.add(key);
  const fill = new THREE.DirectionalLight(...palette.fill);
  fill.position.copy(direction).multiplyScalar(-1000);
  fill.position.y = 200;
  scene.add(fill);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
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
    const paint = surface.getContext("2d")!;
    const atmosphere = paint.createLinearGradient(0, 0, 0, 128);
    atmosphere.addColorStop(0, palette.sun![0]);
    atmosphere.addColorStop(0.45, palette.sun![1]);
    atmosphere.addColorStop(1, palette.sun![2]);
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
      color: palette.halo[0],
      transparent: true,
      opacity: palette.halo[1],
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.scale.setScalar(night ? 140 : 245);
  celestial.add(halo);
  let flare: Lensflare | undefined;
  if (palette.flare) {
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

  const shadeNight = buildNoctilucentLighting(scene, track);
  const shadeColor = new THREE.Color();
  return {
    shade(point: THREE.Vector3, color: THREE.ColorRepresentation) {
      const sectional = sectionalValues(point);
      shadeColor.set(color);
      return shadeNight
        ? shadeNight(point, shadeColor, sectional)
        : shadeColor.multiplyScalar(sectional).getHex();
    },
    update(camera: THREE.Camera) {
      celestial.position.copy(camera.position).addScaledVector(direction, 950);
    },
    dispose() {
      flare?.dispose();
      // The glow also belongs to the halo; its normal scene cleanup handles night.
    },
  };
}
