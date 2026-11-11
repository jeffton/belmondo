import * as THREE from "three";
import { mod, clamp } from "./track.js";
import { PAD_POSITIONS } from "./race.js";
import { circuitTextures } from "./materials.js";
import { buildEnvironment } from "./environment.js";

const UP = new THREE.Vector3(0, 1, 0);
const mat = (color, extra = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const basic = (color) => new THREE.MeshBasicMaterial({ color });
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const colors = {
  concrete: 0x9da7ac,
  dark: 0x242e38,
  road: 0xaeb6b2,
  white: 0xe9e7dd,
  orange: 0xff651d,
  cyan: 0x18ddec,
  lime: 0xc6ff21,
};

function quadGeometry(quads) {
  const vertices = [],
    c = [],
    uv = [];
  for (const q of quads) {
    const color = new THREE.Color(q.color);
    for (const i of [0, 2, 1, 0, 3, 2]) {
      vertices.push(...q.p[i].toArray());
      c.push(color.r, color.g, color.b);
      uv.push(
        ...(q.uv || [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ])[i],
      );
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function textTexture(text, bg = "#14202a", fg = "#e9ece6") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = fg;
  ctx.font = "italic 900 58px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 66, 480);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0xb7c7d5);
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.4, 1700);
    this.scene = new THREE.Scene();
    this.ships = [];
    this.effects = [];
    this.time = 0;
    this.cameraReady = false;
    this.quality = "clean";
    this.resize();
  }
  resize() {
    const scale =
      this.quality === "retro" ? 0.55 : Math.min(1, 1500 / innerWidth);
    this.renderer.setSize(
      Math.round(innerWidth * scale),
      Math.round(innerHeight * scale),
      false,
    );
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
  build(track) {
    if (this.scene) {
      const geometries = new Set(),
        materials = new Set(),
        textures = new Set();
      this.scene.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
        if (o.geometry) geometries.add(o.geometry);
        if (o.material)
          for (const m of Array.isArray(o.material)
            ? o.material
            : [o.material]) {
            materials.add(m);
            if (m.map) textures.add(m.map);
          }
      });
      this.scene.background?.dispose?.();
      geometries.forEach((g) => {
        if (g !== boxGeo) g.dispose();
      });
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    }
    this.scene = new THREE.Scene();
    this.track = track;
    this.ships = [];
    this.effects = [];
    this.cameraReady = false;
    const cfg = track.config;
    const textures = circuitTextures(
      "#" + new THREE.Color(cfg.color).getHexString(),
    );
    this.textures = textures;
    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = 4;
    skyCanvas.height = 256;
    const skyContext = skyCanvas.getContext("2d");
    const gradient = skyContext.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(
      0,
      "#" + new THREE.Color(cfg.sky).multiplyScalar(0.65).getHexString(),
    );
    gradient.addColorStop(0.65, "#" + new THREE.Color(cfg.fog).getHexString());
    gradient.addColorStop(1, "#" + new THREE.Color(cfg.fog).getHexString());
    skyContext.fillStyle = gradient;
    skyContext.fillRect(0, 0, 4, 256);
    this.scene.background = new THREE.CanvasTexture(skyCanvas);
    this.scene.background.colorSpace = THREE.SRGBColorSpace;
    this.scene.fog = new THREE.Fog(cfg.fog, 180, 1100);
    this.scene.add(new THREE.HemisphereLight(0xe4f6ff, 0x394358, 2.1));
    const sun = new THREE.DirectionalLight(0xffe8cf, 2.2);
    sun.position.set(-300, 500, 150);
    this.scene.add(sun);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(12000, 12000, 1, 1),
      mat(cfg.sea, { map: textures.water }),
    );
    textures.water.repeat.set(250, 250);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -16;
    this.scene.add(sea);
    const environment = buildEnvironment(this.scene, track, textures);
    const quads = [];
    const addStrip = (a, b, left, right, y, color, kind = "paint") => {
      const edgeAt = (frame, value) =>
        Math.abs(value) > a.width - 0.6
          ? value + Math.sign(value) * (frame.width - a.width)
          : value;
      const leftA = clamp(left, a.clipMin, a.clipMax),
        rightA = clamp(right, a.clipMin, a.clipMax);
      const leftB = clamp(edgeAt(b, left), b.clipMin, b.clipMax),
        rightB = clamp(edgeAt(b, right), b.clipMin, b.clipMax);
      if (leftA === rightA && leftB === rightB) return;
      const points = [
        a.p.clone().addScaledVector(a.right, leftA).addScaledVector(a.up, y),
        a.p.clone().addScaledVector(a.right, rightA).addScaledVector(a.up, y),
        b.p.clone().addScaledVector(b.right, rightB).addScaledVector(b.up, y),
        b.p.clone().addScaledVector(b.right, leftB).addScaledVector(b.up, y),
      ];
      const v0 = (a.u * track.length) / 32,
        v1 = ((b.u < a.u ? b.u + 1 : b.u) * track.length) / 32;
      quads.push({
        p: points,
        color,
        kind,
        uv: [
          [left / 32, v0],
          [right / 32, v0],
          [right / 32, v1],
          [left / 32, v1],
        ],
      });
    };
    const steps = 900;
    for (let i = 0; i < steps; i++) {
      const u = i / steps;
      const split = u >= cfg.split[0] && u < cfg.split[1];
      if (track.gap(u)) continue;
      for (const branch of split ? [-1, 1] : [0]) {
        const a = track.frame((i / steps) * track.length, branch),
          b = track.frame(((i + 1) / steps) * track.length, branch),
          w = a.width;
        for (const f of [a, b]) {
          f.clipMin = -f.width;
          f.clipMax = f.width;
          if (split) {
            const other = track.frame(f.u * track.length, -branch);
            const middle = other.p.clone().sub(f.p).dot(f.right) / 2;
            if (branch === -1) f.clipMax = Math.min(f.width, middle);
            else f.clipMin = Math.max(-f.width, middle);
          }
        }
        const shared =
          split &&
          (branch === -1
            ? a.clipMax < a.width || b.clipMax < b.width
            : a.clipMin > -a.width || b.clipMin > -b.width);
        addStrip(a, b, -w, w, 0, i % 5 === 0 ? 0xabb3ac : colors.road, "road");
        addStrip(a, b, -w, w, -2, 0x8f9c96, "concrete");
        if (!shared || branch === -1)
          addStrip(
            a,
            b,
            -w,
            -w + 0.5,
            0.06,
            i % 8 < 4 ? colors.white : colors.orange,
          );
        if (!shared || branch === 1)
          addStrip(
            a,
            b,
            w - 0.5,
            w,
            0.06,
            i % 8 < 4 ? colors.white : colors.orange,
          );
        if (i % 7 < 3) addStrip(a, b, -0.13, 0.13, 0.04, 0x82939a);
        for (const side of [-1, 1]) {
          if (shared && side === -branch) continue;
          const edgeA = a.width * side,
            edgeB = b.width * side;
          const lowerA = a.p
            .clone()
            .addScaledVector(a.right, edgeA)
            .addScaledVector(a.up, -2);
          const lowerB = b.p
            .clone()
            .addScaledVector(b.right, edgeB)
            .addScaledVector(b.up, -2);
          quads.push({
            p: [
              lowerA,
              lowerB,
              b.p.clone().addScaledVector(b.right, edgeB),
              a.p.clone().addScaledVector(a.right, edgeA),
            ],
            color: 0xbac0b0,
            kind: "concrete",
          });
          const p = [
            a.p.clone().addScaledVector(a.right, edgeA),
            b.p.clone().addScaledVector(b.right, edgeB),
            b.p
              .clone()
              .addScaledVector(b.right, edgeB)
              .addScaledVector(b.up, 1.7),
            a.p
              .clone()
              .addScaledVector(a.right, edgeA)
              .addScaledVector(a.up, 1.7),
          ];
          quads.push({
            p,
            color: i % 10 < 8 ? 0xe0dfcd : 0xa8b3ae,
            kind: "concrete",
            uv: [
              [(a.u * track.length) / 8, 0],
              [(b.u * track.length) / 8, 0],
              [(b.u * track.length) / 8, 0.22],
              [(a.u * track.length) / 8, 0.22],
            ],
          });
          if (i % 6 < 4) {
            const p2 = p.map((v, vertex) =>
              v
                .clone()
                .addScaledVector(
                  vertex === 0 || vertex === 3 ? a.right : b.right,
                  -side * 0.025,
                ),
            );
            p2[0].addScaledVector(a.up, 0.75);
            p2[1].addScaledVector(b.up, 0.75);
            p2[2].addScaledVector(b.up, -0.45);
            p2[3].addScaledVector(a.up, -0.45);
            quads.push({
              p: p2,
              color: branch === 1 ? 0xe55da5 : cfg.color,
              kind: "paint",
            });
          }
        }
        // Repeating overhead ribs and tunnel skin create near-field motion cues.
        if (u > cfg.tunnel[0] && u < cfg.tunnel[1]) {
          addStrip(
            a,
            b,
            -w,
            w,
            16,
            i % 12 < 2 ? 0x7d8782 : 0xb0b8ac,
            "concrete",
          );
          for (const side of [-1, 1])
            quads.push({
              p: [
                a.p.clone().addScaledVector(a.right, side * w),
                a.p
                  .clone()
                  .addScaledVector(a.right, side * w)
                  .addScaledVector(a.up, 16),
                b.p
                  .clone()
                  .addScaledVector(b.right, side * w)
                  .addScaledVector(b.up, 16),
                b.p.clone().addScaledVector(b.right, side * w),
              ],
              color: i % 12 < 2 ? 0x7b8c8a : 0xd2d5c5,
              kind: "concrete",
              uv: [
                [(a.u * track.length) / 12, 0],
                [(a.u * track.length) / 12, 1],
                [(b.u * track.length) / 12, 1],
                [(b.u * track.length) / 12, 0],
              ],
            });
          if (i % 12 === 0) this.crossbar(a, w, 13, cfg.color);
        }
      }
    }
    for (const kind of ["road", "concrete", "paint"])
      this.scene.add(
        new THREE.Mesh(
          quadGeometry(quads.filter((q) => q.kind === kind)),
          new THREE.MeshLambertMaterial({
            vertexColors: true,
            map: textures[kind],
            side: THREE.DoubleSide,
            flatShading: true,
          }),
        ),
      );
    // Instanced waterfront towers: original concrete city, not a backdrop image.
    const cityMat = mat(0xc6cfcb, { map: textures.facade });
    const towers = new THREE.InstancedMesh(boxGeo, cityMat, 160);
    const foundations = new THREE.InstancedMesh(
      boxGeo,
      mat(0xd6d5bd, { map: textures.concrete }),
      160,
    );
    const windows = new THREE.InstancedMesh(boxGeo, basic(cfg.color), 320);
    const obj = new THREE.Object3D();
    let seed = 719;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 160; i++) {
      const f = track.frame(random() * track.length);
      const side = i % 2 ? 1 : -1;
      let p = f.p
        .clone()
        .addScaledVector(f.right, side * (100 + random() * 320));
      p = environment.buildingPosition(p);
      const h = 30 + random() * 145,
        width = 15 + random() * 35,
        depth = 18 + random() * 36;
      const ground =
        Math.min(
          ...[-width / 2, width / 2].flatMap((dx) =>
            [-depth / 2, depth / 2].map((dz) =>
              environment.heightAt(p.x + dx, p.z + dz),
            ),
          ),
        ) - 1;
      const slabHeight = p.y - ground + 0.6;
      obj.position.set(p.x, ground + slabHeight / 2, p.z);
      obj.rotation.set(0, 0, 0);
      obj.scale.set(width + 4, slabHeight, depth + 4);
      obj.updateMatrix();
      foundations.setMatrixAt(i, obj.matrix);
      const base = p.y + 0.6;
      obj.position.set(p.x, base + h / 2, p.z);
      obj.rotation.set(0, 0, 0);
      obj.scale.set(width, h, depth);
      obj.updateMatrix();
      towers.setMatrixAt(i, obj.matrix);
      towers.setColorAt(
        i,
        new THREE.Color().setHSL(0.56, 0.04, 0.58 + random() * 0.22),
      );
      for (let j = 0; j < 2; j++) {
        obj.position.set(
          p.x + (j ? 1 : -1) * width * 0.24,
          base + h * 0.68,
          p.z - depth / 2 - 0.08,
        );
        obj.scale.set(0.8, h * 0.24, 0.12);
        obj.updateMatrix();
        windows.setMatrixAt(i * 2 + j, obj.matrix);
      }
    }
    this.scene.add(towers, windows, foundations);
    const supportFrames = Array.from({ length: 60 }, (_, i) => {
      const u = i / 60;
      return (u > cfg.split[0] && u < cfg.split[1] ? [-1, 1] : [0]).map(
        (branch) => track.frame(u * track.length, branch),
      );
    }).flat();
    const supports = new THREE.InstancedMesh(
      boxGeo,
      mat(0xc3c6b9, { map: textures.concrete }),
      supportFrames.length,
    );
    supportFrames.forEach((f, i) => {
      const bottom = environment.heightAt(f.p.x, f.p.z) - 3,
        top = f.p.y - 2;
      obj.position.set(f.p.x, (top + bottom) / 2, f.p.z);
      obj.scale.set(8, top - bottom, 8);
      obj.rotation.set(0, 0, 0);
      obj.updateMatrix();
      supports.setMatrixAt(i, obj.matrix);
    });
    this.scene.add(supports);
    for (const [i, u] of PAD_POSITIONS.entries()) {
      for (const branch of u > cfg.split[0] && u < cfg.split[1]
        ? [-1, 1]
        : [0]) {
        const f = track.frame(u * track.length, branch);
        const pad = new THREE.Mesh(
          new THREE.PlaneGeometry(12, 7),
          new THREE.MeshBasicMaterial({
            map: i % 3 === 0 ? textures.boost : textures.arms,
          }),
        );
        pad.position.copy(f.p).addScaledVector(f.up, 0.09);
        pad.quaternion.setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(
            f.right,
            f.tangent.clone().negate(),
            f.up,
          ),
        );
        this.scene.add(pad);
        if (i % 3 !== 0) this.sign(u - 0.012, "[+] ARMS", "#c5f52a", branch);
      }
    }
    const startFrame = track.frame(0);
    for (let x = -16; x < 16; x += 2)
      for (let z = 0; z < 4; z += 2) {
        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(2, 0.05, 2),
          basic((x + z) % 4 === 0 ? 0xe8ebe1 : 0x15232d),
        );
        tile.position
          .copy(startFrame.p)
          .addScaledVector(startFrame.right, x + 1)
          .addScaledVector(startFrame.tangent, z)
          .addScaledVector(startFrame.up, 0.08);
        tile.rotation.y = Math.atan2(
          startFrame.tangent.x,
          startFrame.tangent.z,
        );
        this.scene.add(tile);
      }
    this.sign(0.007, "NULL // VECTOR", "#e8ece4");
    this.sign(cfg.split[0] - 0.024, "← COAST / SKY →", "#e8ece4");
    this.sign(cfg.jump - 0.032, ">>> FLIGHT", "#ff641f");
    this.sign(cfg.tunnel[0] - 0.013, "SECTOR / 02", "#e8ece4");
    this.sign(0.97, "START / FINISH", "#e8ece4");
    for (let i = 0; i < 12; i++) {
      const u = 0.02 + i * 0.08;
      for (const branch of u > cfg.split[0] && u < cfg.split[1]
        ? [-1, 1]
        : [0]) {
        const f = track.frame(u * track.length, branch);
        const g = new THREE.Group();
        const archMat = mat(i % 2 ? 0xd6d7cb : 0xb0beb6, {
          map: textures.concrete,
        });
        for (const side of [-1, 1]) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(3, 32, 5), archMat);
          p.position.set(side * 23, 12, 0);
          g.add(p);
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(49, 4, 5), archMat);
        beam.position.y = 28;
        g.add(beam);
        g.position.copy(f.p);
        g.rotation.y = Math.atan2(f.tangent.x, f.tangent.z);
        this.scene.add(g);
      }
    }
    this.effectMat = basic(0xff9730);
    this.sparks = new THREE.InstancedMesh(
      new THREE.TetrahedronGeometry(0.18),
      this.effectMat,
      64,
    );
    this.sparkData = Array.from({ length: 64 }, () => ({
      life: 0,
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
    }));
    this.sparkCursor = 0;
    this.scene.add(this.sparks);
  }
  crossbar(f, w, h, color) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w * 2, 0.35, 1),
      basic(color),
    );
    mesh.position.copy(f.p).addScaledVector(f.up, h);
    mesh.rotation.y = Math.atan2(f.tangent.x, f.tangent.z);
    this.scene.add(mesh);
  }
  sign(u, text, fg, branch = 0) {
    const f = this.track.frame(u * this.track.length, branch);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 8),
      new THREE.MeshBasicMaterial({
        map: textTexture(text, "#17222a", fg),
        side: THREE.DoubleSide,
      }),
    );
    sign.position.copy(f.p).addScaledVector(f.up, 16);
    sign.rotation.y = Math.atan2(f.tangent.x, f.tangent.z) + Math.PI;
    this.scene.add(sign);
    this.crossbar(f, 20, 20, 0x485964);
  }
  makeShip(color) {
    const group = new THREE.Group();
    const hullMat = mat(color, { map: this.textures.paint }),
      white = mat(0xdce5df, { map: this.textures.paint }),
      dark = mat(0x233747);
    const shape = new THREE.BufferGeometry();
    const v = [
      0, 0.4, 4.5, -1.7, 0, -2.4, 1.7, 0, -2.4, 0, 1.3, -0.9, 0, -0.55, -1.9,
    ];
    shape.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    shape.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(
        [0.5, 1, 0, 0, 1, 0, 0.5, 0.36, 0.5, 0.07],
        2,
      ),
    );
    shape.setIndex([0, 1, 3, 0, 3, 2, 1, 2, 3, 0, 4, 1, 0, 2, 4, 1, 4, 2]);
    shape.computeVertexNormals();
    group.add(new THREE.Mesh(shape, hullMat));
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 0.65, 4.5),
        hullMat,
      );
      wing.position.set(side * 2.1, -0.12, -0.5);
      wing.rotation.y = side * -0.18;
      group.add(wing);
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.68, 3.3),
        white,
      );
      stripe.position.set(side * 2.1, -0.1, -0.2);
      stripe.rotation.y = side * -0.18;
      group.add(stripe);
      const nozzle = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.4), dark);
      nozzle.position.set(side * 2.1, 0, -2.8);
      group.add(nozzle);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.5, 3.5, 4),
        basic(0x35e6ff),
      );
      flame.rotation.x = -Math.PI / 2;
      flame.position.set(side * 2.1, 0, -4.4);
      flame.name = "flame";
      group.add(flame);
    }
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 1.8), dark);
    cockpit.position.set(0, 1, 0.1);
    group.add(cockpit);
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(4, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0x65f1ff,
        wireframe: true,
        transparent: true,
        opacity: 0.22,
      }),
    );
    shield.visible = false;
    shield.name = "shield";
    group.add(shield);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(3.7, 12),
      new THREE.MeshBasicMaterial({
        color: 0x10202b,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    this.scene.add(shadow);
    group.userData.shadow = shadow;
    this.scene.add(group);
    return group;
  }
  setupRacers(race, specs) {
    this.ships = race.racers.map((r) => this.makeShip(specs[r.craft].color));
  }
  burst(racer) {
    const f = this.track.frame(racer.s, racer.branch);
    for (let i = 0; i < 10; i++) {
      const particle =
        this.sparkData[this.sparkCursor++ % this.sparkData.length];
      particle.life = 0.25 + Math.random() * 0.4;
      particle.p
        .copy(f.p)
        .addScaledVector(f.right, racer.x)
        .addScaledVector(f.up, 1.6);
      particle.v
        .copy(f.tangent)
        .multiplyScalar(-12 - Math.random() * 18)
        .addScaledVector(f.right, (Math.random() - 0.5) * 20)
        .addScaledVector(f.up, Math.random() * 12);
    }
  }
  draw(race, dt, demo = false) {
    this.time += dt;
    const player = race.player,
      track = this.track;
    const f = track.frame(player.s, player.branch);
    const base = f.p.clone().addScaledVector(f.right, player.x);
    const focus = base.clone().addScaledVector(f.up, 2 + Math.max(0, player.h));
    const desired = focus
      .clone()
      .addScaledVector(f.tangent, -15 - player.speed * 0.035)
      .addScaledVector(UP, 7);
    const ahead = track
      .frame(player.s + 24, player.branch)
      .p.addScaledVector(f.right, player.x * 0.5)
      .addScaledVector(UP, 3 + Math.max(0, player.h) * 0.5);
    if (demo) {
      desired
        .copy(f.p)
        .addScaledVector(f.right, 45)
        .addScaledVector(UP, 24)
        .addScaledVector(f.tangent, -40);
      ahead.copy(f.p).addScaledVector(f.tangent, 65);
    }
    if (!this.cameraReady) {
      this.camera.position.copy(desired);
      this.cameraReady = true;
    } else this.camera.position.lerp(desired, 1 - Math.exp(-dt * 9));
    this.camera.up
      .set(
        f.right.x * clamp(0.006 * player.vx, -0.07, 0.07),
        1,
        f.right.z * clamp(0.006 * player.vx, -0.07, 0.07),
      )
      .normalize();
    this.camera.lookAt(ahead);
    this.camera.fov = 68 + player.speed * 0.065 + (player.surge > 0 ? 4 : 0);
    this.camera.updateProjectionMatrix();
    for (const r of race.racers) {
      const ship = this.ships[r.id];
      if (!ship) continue;
      const behind =
        mod(player.s - r.s + track.length / 2, track.length) - track.length / 2;
      ship.visible = demo || r.id === 0 || behind < 3 || behind > 28;
      const rf = track.frame(r.s, r.branch);
      ship.position
        .copy(rf.p)
        .addScaledVector(rf.right, r.x)
        .addScaledVector(
          rf.up,
          1.6 + r.h + Math.sin(this.time * 8 + r.id) * 0.13,
        );
      const matrix = new THREE.Matrix4().makeBasis(rf.right, rf.up, rf.tangent);
      ship.quaternion.setFromRotationMatrix(matrix);
      ship.rotateZ(-r.vx * 0.024);
      ship.rotateY(r.vx * 0.017);
      ship.rotateX(r.h > 0 ? -0.09 : 0);
      ship.getObjectByName("shield").visible = r.protect > 0;
      for (const child of ship.children)
        if (child.name === "flame") {
          child.scale.y =
            (r.speed / 90 + 0.2) *
            (r.surge > 0 ? 1.7 : 1) *
            (1 + Math.sin(this.time * 45) * 0.15);
        }
      const shadow = ship.userData.shadow;
      shadow.position
        .copy(rf.p)
        .addScaledVector(rf.right, r.x)
        .addScaledVector(rf.up, 0.12);
      shadow.visible = r.h < 15 && ship.visible && !track.gap(rf.u);
    }
    // Shared effect meshes are pooled rather than allocated on every animation frame.
    const live = [...race.shots, ...race.mines];
    while (this.effects.length < live.length) {
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(1.1),
        this.effectMat,
      );
      this.scene.add(m);
      this.effects.push(m);
    }
    for (let i = 0; i < this.effects.length; i++) {
      const m = this.effects[i],
        e = live[i];
      m.visible = !!e;
      if (e) {
        const ef = track.frame(e.s, e.branch);
        m.position
          .copy(ef.p)
          .addScaledVector(ef.right, e.x)
          .addScaledVector(ef.up, 2);
        m.rotation.set(this.time * 3, this.time * 5, 0);
        m.scale.setScalar(e.type === "PULSE" ? 6 : 1);
      }
    }
    const sparkTransform = new THREE.Object3D();
    for (let i = 0; i < this.sparkData.length; i++) {
      const particle = this.sparkData[i];
      particle.life = Math.max(0, particle.life - dt);
      if (particle.life > 0) {
        particle.p.addScaledVector(particle.v, dt);
        particle.v.y -= 22 * dt;
      }
      sparkTransform.position.copy(particle.p);
      sparkTransform.scale.setScalar(particle.life > 0 ? 1 : 0);
      sparkTransform.updateMatrix();
      this.sparks.setMatrixAt(i, sparkTransform.matrix);
    }
    this.sparks.instanceMatrix.needsUpdate = true;
    this.sparks.computeBoundingSphere();
    this.renderer.render(this.scene, this.camera);
  }
}
