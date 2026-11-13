import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { SPEED_CLASSES } from "./speed-classes.js";
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

function trackModel(track, materials) {
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
  const deck = new THREE.Mesh(geometry, materials.deck);
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(edges, 3),
  );
  const group = new THREE.Group();
  group.add(deck, new THREE.LineSegments(edgeGeometry, materials.edge));
  return group;
}

function classSymbol(index) {
  const parts = new Map();
  const add = (
    geometry,
    material,
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = [1, 1, 1],
  ) => {
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(...scale),
    );
    let baked = geometry;
    if (geometry.index) {
      baked = geometry.toNonIndexed();
      geometry.dispose();
    }
    baked.deleteAttribute("uv");
    baked.applyMatrix4(transform);
    if (!parts.has(material)) parts.set(material, []);
    parts.get(material).push(baked);
  };
  if (index === 0) {
    // INDUCTION: an open laminated stator, two terminal shoes and a suspended
    // diamond armature. The large horseshoe aperture remains open as it turns.
    const arc = Math.PI * 1.5;
    const turn = Math.PI * 0.75;
    add(
      new THREE.TorusGeometry(0.65, 0.15, 6, 24, arc),
      "shell",
      [0, 0, 0],
      [0, 0, turn],
    );
    add(
      new THREE.TorusGeometry(0.65, 0.044, 4, 24, arc),
      "emitter",
      [0, 0, 0.143],
      [0, 0, turn],
    );
    add(
      new THREE.TorusGeometry(0.65, 0.044, 4, 24, arc),
      "emitter",
      [0, 0, -0.143],
      [0, 0, turn],
    );
    for (const angle of [Math.PI * 0.25, Math.PI * 0.75]) {
      add(
        new THREE.BoxGeometry(0.25, 0.19, 0.34),
        "copper",
        [Math.cos(angle) * 0.65, Math.sin(angle) * 0.65, 0],
        [0, 0, angle],
      );
    }
    add(
      new THREE.OctahedronGeometry(0.27),
      "ferrite",
      [0, 0, 0],
      [0, 0, 0],
      [0.75, 1.9, 0.75],
    );
    add(
      new THREE.OctahedronGeometry(0.16),
      "emitter",
      [0, 0.12, 0],
      [0, 0, 0],
      [0.6, 1.6, 0.6],
    );
    add(new THREE.BoxGeometry(0.24, 0.12, 0.32), "ferrite", [0, -0.77, 0]);
  } else if (index === 1) {
    // RESONANCE: three orthogonal hexagonal resonators with exposed tuning
    // shoes. Unlike the open stator this is an airy, interlocking spatial knot.
    for (const [rotation, material] of [
      [[0, 0, Math.PI / 6], "shell"],
      [[Math.PI / 2, 0, Math.PI / 6], "copper"],
      [[0, Math.PI / 2, Math.PI / 6], "shell"],
    ]) {
      add(
        new THREE.TorusGeometry(0.68, 0.075, 4, 6),
        material,
        [0, 0, 0],
        rotation,
      );
    }
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(0.2, 0.12, 0.24), "ferrite", [
        side * 0.65,
        0,
        0,
      ]);
      add(new THREE.BoxGeometry(0.12, 0.045, 0.25), "emitter", [
        side * 0.65,
        0.08,
        0,
      ]);
    }
    add(
      new THREE.OctahedronGeometry(0.23),
      "emitter",
      [0, 0, 0],
      [0, Math.PI / 4, 0],
      [1, 1.6, 1],
    );
    add(new THREE.CylinderGeometry(0.055, 0.055, 1.1, 6), "ferrite");
  } else {
    // SINGULARITY: disconnected trihedral containment jaws frame a compressed
    // dark core. Gaps at every edge midpoint make a cubic negative-space cage,
    // rather than another set of rings or a solid box.
    for (const x of [-1, 1])
      for (const y of [-1, 1])
        for (const z of [-1, 1]) {
          const corner = new THREE.Vector3(x, y, z).multiplyScalar(0.5);
          add(new THREE.OctahedronGeometry(0.09), "copper", corner.toArray());
          for (let axis = 0; axis < 3; axis++) {
            const center = corner.clone();
            center.setComponent(axis, center.getComponent(axis) * 0.58);
            const size = [0.065, 0.065, 0.065];
            size[axis] = 0.42;
            add(new THREE.BoxGeometry(...size), "shell", center.toArray());
          }
        }
    add(
      new THREE.OctahedronGeometry(0.34),
      "ferrite",
      [0, 0, 0],
      [0, Math.PI / 4, 0],
    );
    // A single tilted accretion collar, deliberately smaller than the jaws.
    add(
      new THREE.TorusGeometry(0.4, 0.035, 4, 12),
      "emitter",
      [0, 0, 0],
      [Math.PI / 3, 0, Math.PI / 6],
    );
    add(new THREE.OctahedronGeometry(0.08), "emitter", [0, 0.35, 0]);
    add(new THREE.OctahedronGeometry(0.08), "emitter", [0, -0.35, 0]);
  }
  const group = new THREE.Group();
  group.name = SPEED_CLASSES[index].name;
  const colors = {
    shell: 0xd5e1df,
    ferrite: 0x172a36,
    copper: 0xca9561,
    emitter: 0x8affd6,
  };
  for (const [kind, geometries] of parts) {
    const geometry = mergeGeometries(geometries);
    geometries.forEach((part) => part.dispose());
    const material = new THREE.MeshStandardMaterial({
      color: colors[kind],
      metalness: kind === "emitter" ? 0.15 : 0.65,
      roughness: kind === "ferrite" ? 0.36 : 0.28,
      emissive: kind === "emitter" ? colors[kind] : 0x000000,
      emissiveIntensity: 0.7,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = kind;
    group.add(mesh);
  }
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
  const pivot = new THREE.Group();
  group.position.copy(center).multiplyScalar(-1 / radius);
  group.scale.setScalar(1 / radius);
  pivot.name = group.name;
  pivot.add(group);
  return pivot;
}

/** Native-resolution transparent inset, independent of World's LOWRES canvas. */
export class MenuPreview {
  constructor(element) {
    this.renderer = null;
    this.size = { width: 0, height: 0, pixelRatio: 0 };
    this.element = element;
    this.stage = "class";
    this.time = 0;
    this.trackScene = new THREE.Scene();
    this.craftScene = new THREE.Scene();
    this.classScene = new THREE.Scene();
    lightScene(this.trackScene);
    lightScene(this.craftScene);
    lightScene(this.classScene);
    this.crafts = new Map();
    this.classes = new Map();
    this.trackMaterials = null;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    this.camera.position.set(0, 1.25, 1.8).normalize().multiplyScalar(5);
    this.camera.lookAt(0, 0, 0);
  }

  setTrack(track) {
    if (this.track === track) return;
    if (this.coursePivot) {
      this.trackScene.remove(this.coursePivot);
      this.course.traverse((object) => object.geometry?.dispose());
    }
    // Course selection changes geometry/color, not shader programs. Retain both
    // material instances until final disposal to keep their compiled programs.
    this.trackMaterials ??= {
      deck: new THREE.MeshStandardMaterial({
        color: 0xaac3cc,
        metalness: 0.35,
        roughness: 0.55,
        side: THREE.DoubleSide,
        flatShading: true,
      }),
      edge: new THREE.LineBasicMaterial(),
    };
    this.trackMaterials.edge.color.set(track.config.color);
    this.track = track;
    this.course = trackModel(track, this.trackMaterials);
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

  setClass(index) {
    if (this.classModel) this.classModel.visible = false;
    if (!this.classes.has(index)) {
      const model = classSymbol(index);
      this.classes.set(index, model);
      this.classScene.add(model);
    }
    this.classModel = this.classes.get(index);
    this.classModel.visible = true;
  }

  setStage(stage) {
    this.stage = stage;
  }

  createRenderer() {
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    return renderer;
  }

  get resources() {
    return {
      geometries: this.renderer?.info.memory.geometries ?? 0,
      textures: this.renderer?.info.memory.textures ?? 0,
      width: this.renderer?.domElement.width ?? 0,
      height: this.renderer?.domElement.height ?? 0,
      pixelRatio: this.size.pixelRatio,
      renderCalls: this.renderer?.info.render.calls ?? 0,
      frames: this.renderer?.info.render.frame ?? 0,
    };
  }

  draw(dt) {
    if (this.element.ownerDocument.hidden) return;
    const model = {
      class: this.classModel,
      track: this.coursePivot,
      craft: this.craft,
    }[this.stage];
    if (!model) return;
    const rect = this.element.getBoundingClientRect();
    const view = this.element.ownerDocument.defaultView;
    if (
      !rect.width ||
      !rect.height ||
      rect.right <= 0 ||
      rect.bottom <= 0 ||
      rect.left >= view.innerWidth ||
      rect.top >= view.innerHeight
    )
      return;
    if (!this.renderer) {
      this.renderer = this.createRenderer();
      const canvas = this.renderer.domElement;
      canvas.className = "menu-preview-canvas";
      canvas.setAttribute("aria-hidden", "true");
      Object.assign(canvas.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      });
      // Existing positioned labels follow the canvas in paint order.
      this.element.prepend(canvas);
    }
    const renderer = this.renderer;
    const canvas = renderer.domElement.getBoundingClientRect();
    const pixelRatio = view.devicePixelRatio;
    if (
      canvas.width !== this.size.width ||
      canvas.height !== this.size.height ||
      pixelRatio !== this.size.pixelRatio
    ) {
      renderer.setDrawingBufferSize(canvas.width, canvas.height, pixelRatio);
      this.size = { width: canvas.width, height: canvas.height, pixelRatio };
    }

    this.time += dt;
    model.rotation.y =
      this.time * { class: 0.25, track: 0.16, craft: 0.32 }[this.stage];
    const aspect = canvas.width / canvas.height;
    const span = 1.16;
    this.camera.left = -span * Math.max(1, aspect);
    this.camera.right = -this.camera.left;
    this.camera.top = span * Math.max(1, 1 / aspect);
    this.camera.bottom = -this.camera.top;
    this.camera.updateProjectionMatrix();

    renderer.render(
      {
        class: this.classScene,
        track: this.trackScene,
        craft: this.craftScene,
      }[this.stage],
      this.camera,
    );
  }

  dispose() {
    releaseScene(this.trackScene);
    releaseScene(this.craftScene);
    releaseScene(this.classScene);
    this.crafts.clear();
    this.classes.clear();
    this.trackMaterials = null;
    this.course = this.coursePivot = this.craft = this.classModel = null;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
      this.renderer = null;
    }
    this.size = { width: 0, height: 0, pixelRatio: 0 };
  }
}
