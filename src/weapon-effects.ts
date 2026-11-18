import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { weaponTexture } from "./weapon-textures.ts";

const FORWARD = new THREE.Vector3(0, 0, 1);
const glow = (color: THREE.ColorRepresentation, opacity = 1) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

type PaintedPart = [
  THREE.BufferGeometry,
  THREE.ColorRepresentation,
  [number, number, number]?,
  number?,
];
function painted(parts: PaintedPart[]) {
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

function streakGeometry(profile: [halfWidth: number, distance: number][]) {
  // Crossed ribbons remain legible in chase view and from the side.
  const positions = [];
  const uvs = [];
  for (const vertical of [false, true]) {
    for (let row = 1; row < profile.length; row++) {
      const [a, start] = profile[row - 1];
      const [b, end] = profile[row];
      const points = [
        [-a, start],
        [a, start],
        [b, end],
        [-b, end],
      ].map(([width, z]) => (vertical ? [0, width, -z] : [width, 0, -z]));
      const corners = [
        [0, 1 - start],
        [1, 1 - start],
        [1, 1 - end],
        [0, 1 - end],
      ];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        positions.push(...points[i]);
        uvs.push(...corners[i]);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

type EffectMesh = THREE.Mesh<
  THREE.BufferGeometry,
  THREE.MeshBasicMaterial | THREE.MeshLambertMaterial
>;
interface EffectGroup extends THREE.Group {
  children: EffectMesh[];
}
interface EffectSlot {
  root: EffectGroup;
  busy: boolean;
  age: number;
  mine?: boolean;
}
type WeaponEffect =
  | import("./race.ts").Race["shots"][number]
  | import("./race.ts").Race["mines"][number];
export class WeaponEffects {
  declare scene: THREE.Object3D;
  declare active: Map<WeaponEffect, EffectSlot>;
  declare blasts: EffectSlot[];
  declare pools: Map<string, EffectSlot[]>;
  declare metalTexture: THREE.Texture;
  declare exhaustTexture: THREE.Texture;
  declare bodyMaterial: THREE.MeshLambertMaterial;
  declare arcGeometry: THREE.BufferGeometry;
  declare seekerGeometry: THREE.BufferGeometry;
  declare mineGeometry: THREE.BufferGeometry;
  declare streakGeometry: THREE.BufferGeometry;
  declare boostGeometry: THREE.BufferGeometry;
  declare waveGeometry: THREE.BufferGeometry;
  declare coreGeometry: THREE.BufferGeometry;
  declare shardsGeometry: THREE.BufferGeometry;
  constructor(scene: THREE.Object3D) {
    this.scene = scene;
    this.active = new Map();
    this.blasts = [];
    this.pools = new Map();
    this.metalTexture = weaponTexture("metal");
    this.exhaustTexture = weaponTexture("exhaust");
    this.bodyMaterial = new THREE.MeshLambertMaterial({
      map: this.metalTexture,
      vertexColors: true,
      flatShading: true,
    });
    this.arcGeometry = new THREE.TorusGeometry(1, 0.09, 3, 12, Math.PI * 1.35);
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
      [
        new THREE.CylinderGeometry(0.45, 0.45, 0.22, 6),
        0x182630,
        [0, 0, -1],
        Math.PI / 2,
      ],
      [new THREE.BoxGeometry(0.3, 0.18, 0.7), 0xffe3a6, [0, 0.36, 0.3]],
    ]);
    this.mineGeometry = painted([
      [new THREE.CylinderGeometry(1.15, 1.65, 0.5, 6), 0x253644],
      ...[0, 1, 2].map((i): PaintedPart => [
        new THREE.BoxGeometry(0.65, 0.3, 1.5).rotateY((i * Math.PI * 2) / 3),
        i === 0 ? 0xffb62e : 0xe8d9a8,
        [
          Math.sin((i * Math.PI * 2) / 3) * 1.25,
          0,
          Math.cos((i * Math.PI * 2) / 3) * 1.25,
        ],
      ]),
    ]);
    this.streakGeometry = streakGeometry([
      [0.42, 0],
      [0.04, 1],
    ]);
    // A shoulder and a long blade-like taper, not simply a brighter plume.
    this.boostGeometry = streakGeometry([
      [0.31, 0],
      [0.53, 0.12],
      [0.44, 0.47],
      [0.045, 1],
    ]);
    this.waveGeometry = new THREE.TorusGeometry(
      1,
      0.075,
      3,
      16,
      Math.PI * 1.62,
    );
    this.coreGeometry = new THREE.IcosahedronGeometry(0.5, 0);
    this.shardsGeometry = painted(
      Array.from({ length: 12 }, (_, i) => {
        const angle = i * Math.PI * (3 - Math.sqrt(5));
        const height = (i / 11 - 0.5) * 2;
        const radius = Math.sqrt(1 - height * height);
        return [
          new THREE.TetrahedronGeometry(0.15),
          i % 2 ? 0xffe1a5 : 0xff5b39,
          [Math.cos(angle) * radius, height, Math.sin(angle) * radius],
        ];
      }),
    );
    // Every resource is attached to a hidden reusable slot, so the world's scene
    // disposal owns it even on courses where a weapon has not yet been fired.
    for (const kind of [
      "MISSILE",
      "PULSE",
      "PULSE_HIT",
      "MINE",
      "TURBO",
      "BLAST",
    ])
      this.allocate(kind);
  }

  allocate(kind: string): EffectSlot {
    // Slots contain only meshes created by mesh() below.
    const root = new THREE.Group() as EffectGroup;
    root.name = `weapon-${kind.toLowerCase()}`;
    const mesh = (
      geometry: THREE.BufferGeometry,
      material: THREE.MeshBasicMaterial | THREE.MeshLambertMaterial,
    ) => {
      const object = new THREE.Mesh(geometry, material);
      root.add(object);
      return object;
    };
    if (kind === "MISSILE") {
      mesh(this.seekerGeometry, this.bodyMaterial);
      const exhaust = glow(0x55b9ed, 0.7);
      exhaust.map = this.exhaustTexture;
      const flame = mesh(this.streakGeometry, exhaust);
      flame.position.z = -1.3;
      const core = mesh(this.coreGeometry, glow(0xe9ffff));
      core.position.z = -1.2;
      const hot = glow(0xffd39a, 0.85);
      hot.map = this.exhaustTexture;
      const inner = mesh(this.streakGeometry, hot);
      inner.position.z = -1.25;
    } else if (kind === "MINE") {
      mesh(this.mineGeometry, this.bodyMaterial);
      const ring = mesh(this.arcGeometry, glow(0xffa322, 0.8));
      ring.rotation.x = Math.PI / 2;
      ring.scale.setScalar(1.7);
      ring.position.y = 0.35;
      const beacon = mesh(this.coreGeometry, glow(0xffe7ab));
      beacon.position.y = 0.65;
      beacon.scale.set(0.3, 1.8, 0.3);
      const antenna = mesh(this.arcGeometry, glow(0xfff0bf, 0.6));
      antenna.rotation.x = Math.PI / 2;
      antenna.scale.setScalar(2.15);
      antenna.position.y = 0.35;
    } else if (kind === "PULSE") {
      for (let i = 0; i < 3; i++) {
        const ring = mesh(
          this.arcGeometry,
          glow(i === 1 ? 0xb5faff : 0xfb4db2, 0.8),
        );
        ring.scale.setScalar(2 + i * 1.5);
        ring.rotation.z = i * Math.PI * 0.7;
      }
    } else if (kind === "PULSE_HIT") {
      // Broken electrical bands wrap the struck hull, rather than an explosion
      // at the firing position. Each racer keeps a reusable slot.
      for (let i = 0; i < 4; i++) {
        const arc = mesh(this.arcGeometry, glow(i % 2 ? 0xb5faff : 0xfb4db2));
        arc.position.z = (i - 1.5) * 1.8;
        arc.scale.set(2.8, 1.05, 1);
        arc.material.forceSinglePass = true;
      }
    } else if (kind === "TURBO") {
      for (const side of [-1, 1]) {
        const material = glow(0xffdf9a);
        material.map = this.exhaustTexture;
        material.forceSinglePass = true;
        const wake = mesh(this.boostGeometry, material);
        wake.position.set(side * 2.55, -0.08, -3.45);
      }
    } else {
      mesh(this.coreGeometry, glow(0xffc581, 0.9));
      const wave = mesh(this.waveGeometry, glow(0xff7d43, 0.9));
      wave.material.forceSinglePass = true;
      const debrisMaterial = new THREE.MeshBasicMaterial({
        vertexColors: true,
        map: this.metalTexture,
        transparent: true,
        depthWrite: false,
      });
      mesh(this.shardsGeometry, debrisMaterial);
    }
    root.visible = false;
    this.scene.add(root);
    const slot = { root, busy: false, age: 0 };
    if (!this.pools.has(kind)) this.pools.set(kind, []);
    this.pools.get(kind)!.push(slot);
    return slot;
  }

  acquire(kind: string): EffectSlot {
    const slot =
      this.pools.get(kind)!.find((s) => !s.busy) || this.allocate(kind);
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

  update(race: import("./race.ts").Race, dt: number, time: number) {
    const live = new Set([...race.shots, ...race.mines]);
    // A newly observed detonation gets its first frame at full strength.
    for (const blast of this.blasts) blast.age += dt;
    for (const [effect, slot] of this.active) {
      if (live.has(effect)) continue;
      slot.busy = slot.root.visible = false;
      this.active.delete(effect);
      if (effect.type === "PULSE") continue;
      const blast = this.acquire("BLAST");
      blast.mine = !effect.type;
      blast.root.children[0].material.color.setHex(
        blast.mine ? 0xffefb0 : 0xdff6ff,
      );
      blast.root.children[1].material.color.setHex(
        blast.mine ? 0xffac32 : 0xff6740,
      );
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
          (effect as import("./race.ts").MissileShot).velocity
            .clone()
            .normalize(),
        );
        const flutter = Math.sin(time * 41);
        root.children[1].scale.set(1.2, 1.2, 12 + flutter * 2);
        root.children[3].scale.set(0.4, 0.4, 5 + flutter);
        root.children[2].scale.setScalar(0.6 + flutter * 0.1);
      } else if (kind === "PULSE") {
        root.quaternion.setFromUnitVectors(
          FORWARD,
          (effect as import("./race.ts").PulseShot).direction,
        );
        const age = 1 - effect.life / 0.35;
        for (const [i, ring] of root.children.entries()) {
          ring.position.z = 4 + age * 78 + i * 3;
          ring.scale.set(3 + age * 5 + i, 2 + age * 2 + i * 0.4, 1);
          ring.rotation.z = i * Math.PI * 0.7 + age * (i % 2 ? -2 : 2);
          ring.material.opacity = (1 - age) * 0.85;
        }
      } else {
        root.rotation.set(0, time * 0.5, 0);
        root.children[1].material.opacity = 0.45 + Math.sin(time * 6) * 0.2;
        root.children[3].rotation.z = -time * 1.7;
      }
    }
    for (const blast of this.blasts) {
      const t = blast.age / 0.2;
      blast.root.visible = blast.busy = t < 1;
      if (!blast.busy) continue;
      const [flash, wave, fragments] = blast.root.children;
      const spread = 1 - (1 - t) ** 2;
      flash.visible = t < 0.4;
      flash.scale.setScalar(1.15 + spread);
      flash.material.opacity = Math.max(0, 1 - t * 2.5);
      wave.rotation.set(blast.mine ? Math.PI / 2 : 0, 0, spread * 0.7);
      wave.scale.setScalar(1.4 + spread * 3.4);
      wave.material.opacity = 0.85 * (1 - t) ** 2;
      fragments.scale.set(
        1 + spread * 3.5,
        1 + spread * 2.4,
        1 + spread * (blast.mine ? 3.5 : 5.5),
      );
      fragments.rotation.set(spread, spread * 1.5, spread);
      fragments.material.opacity = 0.92 * (1 - t);
    }
    this.blasts = this.blasts.filter((b) => b.busy);
    for (const [i, racer] of race.racers.entries()) {
      const hitPool = this.pools.get("PULSE_HIT")!;
      const hit = hitPool[i] || this.allocate("PULSE_HIT");
      hit.root.visible = racer.pulseHit > 0;
      if (hit.root.visible) {
        hit.root.position.copy(racer.position);
        hit.root.rotation.set(
          racer.pitch,
          racer.yaw,
          -racer.yawRate * 0.45,
          "YXZ",
        );
        const strength = racer.pulseHit / 0.65;
        // Read the strike first, then keep a dim hull-bound electrical trace
        // for the rest of the existing engine-disruption window.
        const strike = Math.max(0, (strength - 0.7) / 0.3);
        const travel = 1 - strength;
        for (const [j, arc] of hit.root.children.entries()) {
          arc.rotation.z = j * 1.7 + travel * (j % 2 ? -4 : 5);
          arc.material.opacity = strength * (0.24 + strike * 0.7);
        }
      }
      const pool = this.pools.get("TURBO")!;
      const slot = pool[i] || this.allocate("TURBO");
      slot.root.visible = racer.boost > 0.1;
      if (!slot.root.visible) continue;
      slot.root.position.copy(racer.position);
      slot.root.rotation.set(
        racer.pitch,
        racer.yaw,
        -racer.yawRate * 0.45,
        "YXZ",
      );
      const strength = THREE.MathUtils.smoothstep(racer.boost, 0.1, 0.8);
      for (const wake of slot.root.children) {
        wake.scale.set(
          0.85 + strength * 0.45,
          0.7 + strength * 0.23,
          4 + strength * 10,
        );
        wake.material.opacity = strength * 0.92;
      }
    }
  }
}
