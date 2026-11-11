import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const FORWARD = new THREE.Vector3(0, 0, 1);
const glow = (color, opacity = 1) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

function painted(parts) {
  const geometries = parts.map(([geometry, color, position, rotation]) => {
    if (rotation) geometry.rotateX(rotation);
    if (position) geometry.translate(...position);
    const rgb = new THREE.Color(color);
    const colors = [];
    for (let i = 0; i < geometry.attributes.position.count; i++)
      colors.push(rgb.r, rgb.g, rgb.b);
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    if (!geometry.index) return geometry;
    const unindexed = geometry.toNonIndexed();
    geometry.dispose();
    return unindexed;
  });
  const merged = mergeGeometries(geometries);
  for (const geometry of geometries) geometry.dispose();
  return merged;
}

function streakGeometry() {
  // Two crossed tapered ribbons keep the exhaust readable from both cameras.
  const positions = [];
  for (const vertical of [false, true]) {
    const points = [
      [-0.42, 0],
      [0.42, 0],
      [0.04, -1],
      [-0.04, -1],
    ].map(([width, z]) => (vertical ? [0, width, z] : [width, 0, z]));
    for (const i of [0, 1, 2, 0, 2, 3]) positions.push(...points[i]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  return geometry;
}

export class WeaponEffects {
  constructor(scene) {
    this.scene = scene;
    this.active = new Map();
    this.blasts = [];
    this.pools = new Map();
    this.bodyMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
    });
    this.seekerGeometry = painted([
      [
        new THREE.CylinderGeometry(0.18, 0.42, 2.4, 6),
        0xf5f0d9,
        [0, 0, 0],
        Math.PI / 2,
      ],
      [
        new THREE.ConeGeometry(0.42, 1.1, 6),
        0xff493d,
        [0, 0, 1.7],
        Math.PI / 2,
      ],
      [new THREE.BoxGeometry(2.3, 0.12, 1), 0xec4c3c, [0, 0, -0.8]],
      [new THREE.BoxGeometry(0.12, 1.7, 1), 0x233747, [0, 0, -0.8]],
    ]);
    this.mineGeometry = painted([
      [new THREE.CylinderGeometry(1.15, 1.65, 0.5, 6), 0x253644],
      ...[0, 1, 2].map((i) => [
        new THREE.BoxGeometry(0.65, 0.3, 1.5).rotateY((i * Math.PI * 2) / 3),
        i === 0 ? 0xffb62e : 0xe8d9a8,
        [
          Math.sin((i * Math.PI * 2) / 3) * 1.25,
          0,
          Math.cos((i * Math.PI * 2) / 3) * 1.25,
        ],
      ]),
    ]);
    this.streakGeometry = streakGeometry();
    this.waveGeometry = new THREE.TorusGeometry(1, 0.055, 4, 24);
    this.coreGeometry = new THREE.IcosahedronGeometry(0.5, 0);
    this.shardsGeometry = painted(
      Array.from({ length: 12 }, (_, i) => {
        const angle = i * Math.PI * (3 - Math.sqrt(5));
        const height = (i / 11 - 0.5) * 2;
        const radius = Math.sqrt(1 - height * height);
        return [
          new THREE.TetrahedronGeometry(0.2),
          i % 2 ? 0xffe1a5 : 0xff5b39,
          [Math.cos(angle) * radius, height, Math.sin(angle) * radius],
        ];
      }),
    );
    // Every resource is attached to a hidden reusable slot, so the world's scene
    // disposal owns it even on courses where a weapon has not yet been fired.
    for (const kind of ["MISSILE", "PULSE", "MINE", "TURBO", "BLAST"])
      this.allocate(kind);
  }

  allocate(kind) {
    const root = new THREE.Group();
    root.name = `weapon-${kind.toLowerCase()}`;
    const mesh = (geometry, material) => {
      const object = new THREE.Mesh(geometry, material);
      root.add(object);
      return object;
    };
    if (kind === "MISSILE") {
      mesh(this.seekerGeometry, this.bodyMaterial);
      const flame = mesh(this.streakGeometry, glow(0x49eaff, 0.8));
      flame.position.z = -1.3;
      const core = mesh(this.coreGeometry, glow(0xe9ffff));
      core.position.z = -1.2;
    } else if (kind === "MINE") {
      mesh(this.mineGeometry, this.bodyMaterial);
      const ring = mesh(this.waveGeometry, glow(0xffa322, 0.8));
      ring.rotation.x = Math.PI / 2;
      ring.scale.setScalar(1.7);
      ring.position.y = 0.35;
      const beacon = mesh(this.coreGeometry, glow(0xffe7ab));
      beacon.position.y = 0.65;
      beacon.scale.setScalar(0.6);
    } else if (kind === "PULSE") {
      for (let i = 0; i < 3; i++) {
        const ring = mesh(
          this.waveGeometry,
          glow(i === 1 ? 0xffffff : 0xfb4db2, 0.8),
        );
        ring.scale.setScalar(2 + i * 1.5);
      }
    } else if (kind === "TURBO") {
      for (const side of [-1, 1]) {
        const wake = mesh(this.streakGeometry, glow(0x4c96ff, 0.5));
        wake.position.set(side * 2.55, -0.08, -3.4);
      }
    } else {
      mesh(this.coreGeometry, glow(0xffc581, 0.9));
      mesh(this.waveGeometry, glow(0xff7d43, 0.9));
      mesh(this.shardsGeometry, glow(0xffb26b, 0.9));
    }
    root.visible = false;
    this.scene.add(root);
    const slot = { root, busy: false, age: 0 };
    if (!this.pools.has(kind)) this.pools.set(kind, []);
    this.pools.get(kind).push(slot);
    return slot;
  }

  acquire(kind) {
    const slot =
      this.pools.get(kind).find((s) => !s.busy) || this.allocate(kind);
    slot.busy = slot.root.visible = true;
    slot.age = 0;
    return slot;
  }

  reset() {
    this.active.clear();
    this.blasts.length = 0;
    for (const pool of this.pools.values())
      for (const slot of pool) slot.busy = slot.root.visible = false;
  }

  update(race, dt, time) {
    const live = new Set([...race.shots, ...race.mines]);
    for (const [effect, slot] of this.active) {
      if (live.has(effect)) continue;
      slot.busy = slot.root.visible = false;
      this.active.delete(effect);
      if (effect.type === "PULSE") continue;
      const blast = this.acquire("BLAST");
      blast.root.position.copy(effect.position);
      blast.root.quaternion.copy(slot.root.quaternion);
      this.blasts.push(blast);
    }
    for (const effect of live) {
      const kind = effect.type || "MINE";
      let slot = this.active.get(effect);
      if (!slot) {
        slot = this.acquire(kind);
        this.active.set(effect, slot);
      }
      const root = slot.root;
      root.position.copy(effect.position);
      if (kind === "MISSILE") {
        root.quaternion.setFromUnitVectors(
          FORWARD,
          effect.velocity.clone().normalize(),
        );
        root.children[1].scale.set(1, 1, 12 + Math.sin(time * 41) * 2);
      } else if (kind === "PULSE") {
        root.quaternion.setFromUnitVectors(FORWARD, effect.direction);
        const age = 1 - effect.life / 0.35;
        for (const [i, ring] of root.children.entries()) {
          ring.position.z = 4 + age * 78 + i * 3;
          ring.scale.set(3 + age * 5 + i, 2 + age * 2 + i * 0.4, 1);
          ring.material.opacity = (1 - age) * 0.85;
        }
      } else {
        root.rotation.set(0, time * 0.5, 0);
        root.children[1].material.opacity = 0.45 + Math.sin(time * 6) * 0.2;
      }
    }
    for (const blast of this.blasts) {
      blast.age += dt;
      const t = blast.age / 0.55;
      blast.root.visible = t < 1;
      blast.busy = t < 1;
      blast.root.children[0].scale.setScalar(1 + t * 7);
      blast.root.children[1].scale.setScalar(2 + t * 13);
      blast.root.children[2].scale.setScalar(2 + t * 18);
      for (const mesh of blast.root.children)
        mesh.material.opacity = Math.max(0, 1 - t);
    }
    this.blasts = this.blasts.filter((b) => b.busy);
    for (const [i, racer] of race.racers.entries()) {
      const pool = this.pools.get("TURBO");
      const slot = pool[i] || this.allocate("TURBO");
      slot.root.visible = racer.boost > 0.1;
      slot.root.position.copy(racer.position);
      slot.root.rotation.set(
        racer.pitch,
        racer.yaw,
        -racer.yawRate * 0.45,
        "YXZ",
      );
      for (const wake of slot.root.children) {
        wake.scale.set(1 + racer.boost, 1 + racer.boost, 5 + racer.boost * 13);
        wake.material.opacity = racer.boost * 0.38;
      }
    }
  }
}
