import * as THREE from "three";
import { createCraft, collectCraftResources } from "./craft.js";
import { CRAFT } from "./race.js";

function releaseScene(scene) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material)
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        materials.add(material);
        if (material.map) textures.add(material.map);
      }
  });
  // createCraft caches even detached variants and shield/shadow resources by scene.
  collectCraftResources(scene, { geometries, materials, textures });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
  scene.clear();
}

function lightScene(scene) {
  scene.add(new THREE.HemisphereLight(0xdaf5ff, 0x25374b, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.8);
  key.position.set(-3, 6, 4);
  const rim = new THREE.DirectionalLight(0x45dcff, 1.7);
  rim.position.set(4, 1, -3);
  scene.add(key, rim);
}

function trackModel(track) {
  const positions = [];
  const edges = [];
  const { config, length } = track;
  // World-space stations retain authored split tips and jump openings. Sampling
  // at road-construction scale also preserves tight corners and vertical drops.
  const count = Math.ceil(length / 5);
  const stations = [
    ...new Set([
      ...Array.from({ length: count + 1 }, (_, i) => i / count),
      ...config.split,
      ...(config.jump === null
        ? []
        : [config.jump, config.jump + config.gapLength]),
      ...(config.ramp ? [config.ramp.start] : []),
    ]),
  ].sort((a, b) => a - b);
  const point = (frame, bounds, side, depth = 0) => {
    const x = side < 0 ? bounds.clipMin : bounds.clipMax;
    const p =
      bounds.connected && side === bounds.innerSide
        ? bounds.seam.clone()
        : frame.p.clone().addScaledVector(frame.right, x);
    return p.addScaledVector(frame.up, depth);
  };
  const quad = (a, b, c, d) => {
    for (const p of [a, b, c, a, c, d]) positions.push(p.x, p.y, p.z);
  };
  for (let i = 0; i < stations.length - 1; i++) {
    const u = stations[i];
    if (track.gap(u)) continue;
    const split = u >= config.split[0] && u < config.split[1];
    for (const branch of split ? [-1, 1] : [0]) {
      const s = u * length;
      const end =
        stations[i + 1] * length -
        (stations[i + 1] === config.jump ? 0.000001 : 0);
      const a = track.frame(s, branch);
      const b = track.frame(end, branch);
      const ba = track.bounds(s, branch);
      const bb = track.bounds(end, branch);
      const al = point(a, ba, -1);
      const ar = point(a, ba, 1);
      const bl = point(b, bb, -1);
      const br = point(b, bb, 1);
      // Closed slab: real deck width/banking/height, not a flattened route line.
      const dal = point(a, ba, -1, -5);
      const dar = point(a, ba, 1, -5);
      const dbl = point(b, bb, -1, -5);
      const dbr = point(b, bb, 1, -5);
      quad(al, ar, br, bl);
      quad(dal, dbl, dbr, dar);
      quad(al, bl, dbl, dal);
      quad(ar, dar, dbr, br);
      for (const [side, from, to] of [
        [-1, al, bl],
        [1, ar, br],
      ]) {
        if (ba.connected && bb.connected && side === ba.innerSide) continue;
        edges.push(...from.toArray(), ...to.toArray());
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  const deck = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xaac3cc,
      metalness: 0.35,
      roughness: 0.55,
      side: THREE.DoubleSide,
      flatShading: true,
    }),
  );
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(edges, 3),
  );
  const group = new THREE.Group();
  group.add(
    deck,
    new THREE.LineSegments(
      edgeGeometry,
      new THREE.LineBasicMaterial({ color: config.color }),
    ),
  );
  return group;
}

/** Transparent inset on World's existing canvas. The element supplies only layout. */
export class MenuPreview {
  constructor(world, element) {
    this.renderer = world.renderer;
    this.element = element;
    this.stage = "class";
    this.time = 0;
    this.trackScene = new THREE.Scene();
    this.craftScene = new THREE.Scene();
    lightScene(this.trackScene);
    lightScene(this.craftScene);
    this.crafts = new Map();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    this.camera.position.set(0, 1.25, 1.8).normalize().multiplyScalar(5);
    this.camera.lookAt(0, 0, 0);
  }

  setTrack(track) {
    if (this.track === track) return;
    releaseScene(this.trackScene);
    lightScene(this.trackScene);
    this.track = track;
    this.course = trackModel(track);
    this.trackScene.add(this.course);
    const box = new THREE.Box3().setFromObject(this.course);
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    // Uniform scale preserves the actual elevation changes and route proportions.
    this.course.position.copy(center).multiplyScalar(-1 / radius);
    this.course.scale.setScalar(1 / radius);
    this.coursePivot = new THREE.Group();
    this.trackScene.remove(this.course);
    this.coursePivot.add(this.course);
    this.trackScene.add(this.coursePivot);
  }

  setCraft(index) {
    if (this.craft) this.craft.visible = false;
    if (!this.crafts.has(index)) {
      const craft = createCraft(this.craftScene, CRAFT[index].color, index);
      craft.userData.shadow.visible = false;
      const box = new THREE.Box3().setFromObject(craft);
      const center = box.getCenter(new THREE.Vector3());
      const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
      craft.position.copy(center).multiplyScalar(-1 / radius);
      craft.scale.setScalar(1 / radius);
      const pivot = new THREE.Group();
      this.craftScene.remove(craft);
      pivot.add(craft);
      this.craftScene.add(pivot);
      this.crafts.set(index, pivot);
    }
    this.craft = this.crafts.get(index);
    this.craft.visible = true;
  }

  setStage(stage) {
    this.stage = stage;
  }

  draw(dt) {
    if (this.stage === "class") return;
    const model = this.stage === "craft" ? this.craft : this.coursePivot;
    if (!model) return;
    const rect = this.element.getBoundingClientRect();
    const renderer = this.renderer;
    const canvas = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height || !canvas.width || !canvas.height) return;
    const left = Math.max(rect.left, canvas.left);
    const right = Math.min(rect.right, canvas.right);
    const top = Math.max(rect.top, canvas.top);
    const bottom = Math.min(rect.bottom, canvas.bottom);
    if (right <= left || bottom <= top) return;

    this.time += dt;
    model.rotation.y = this.time * (this.stage === "craft" ? 0.32 : 0.16);
    const aspect = rect.width / rect.height;
    const span = 1.16;
    this.camera.left = -span * Math.max(1, aspect);
    this.camera.right = -this.camera.left;
    this.camera.top = span * Math.max(1, 1 / aspect);
    this.camera.bottom = -this.camera.top;
    this.camera.updateProjectionMatrix();

    const target = renderer.getRenderTarget();
    const cubeFace = renderer.getActiveCubeFace();
    const mipLevel = renderer.getActiveMipmapLevel();
    const viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest();
    const autoClear = renderer.autoClear;
    // Three viewport/scissor APIs accept logical renderer pixels, not CSS pixels
    // or drawing-buffer pixels. This handles retro's 0.55 size and pixel ratio.
    const size = renderer.getSize(new THREE.Vector2());
    const sx = size.x / canvas.width;
    const sy = size.y / canvas.height;
    try {
      renderer.setRenderTarget(null);
      renderer.autoClear = false;
      renderer.setViewport(
        (rect.left - canvas.left) * sx,
        (canvas.bottom - rect.bottom) * sy,
        rect.width * sx,
        rect.height * sy,
      );
      renderer.setScissor(
        (left - canvas.left) * sx,
        (canvas.bottom - bottom) * sy,
        (right - left) * sx,
        (bottom - top) * sy,
      );
      renderer.setScissorTest(true);
      // Keep World's color buffer: only inset depth must be independent.
      renderer.clearDepth();
      renderer.render(
        this.stage === "craft" ? this.craftScene : this.trackScene,
        this.camera,
      );
    } finally {
      // These getters expose default-framebuffer settings. Restore them before
      // rebinding a target, whose own viewport/scissor must take precedence.
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(target, cubeFace, mipLevel);
    }
  }

  dispose() {
    releaseScene(this.trackScene);
    releaseScene(this.craftScene);
    this.crafts.clear();
    this.course = this.coursePivot = this.craft = null;
  }
}
