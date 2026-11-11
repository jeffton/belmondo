import * as THREE from "three";
import { mod, clamp } from "./track.js";
import { PAD_POSITIONS } from "./race.js";
import { circuitTextures } from "./materials.js";
import { buildEnvironment } from "./environment.js";
import { buildCity } from "./city.js";
import { buildSplitMarkers } from "./advertising.js";
import { createCraft } from "./craft.js";
import { buildFlagship, loadFlagshipAssets } from "./flagship.js";

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

export class World {
  constructor(canvas) {
    this.flagshipAssets = loadFlagshipAssets();
    this.assetTextures = new Set(Object.values(this.flagshipAssets));
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
    this.view = "chase";
    this.quality = "clean";
    this.resize();
  }
  setView(view) {
    this.view = view;
    this.cameraReady = false;
    this.cameraForward = null;
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
      textures.forEach((t) => {
        if (!this.assetTextures.has(t)) t.dispose();
      });
    }
    this.scene = new THREE.Scene();
    this.track = track;
    this.ships = [];
    this.effects = [];
    this.cameraReady = false;
    const cfg = track.config;
    const flagship = cfg.name === "KAISEKI COAST";
    const fogColor = flagship ? 0x788391 : cfg.fog;
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
    gradient.addColorStop(
      0.65,
      flagship ? "#666a85" : "#" + new THREE.Color(cfg.fog).getHexString(),
    );
    gradient.addColorStop(
      0.88,
      flagship ? "#a3939d" : "#" + new THREE.Color(cfg.fog).getHexString(),
    );
    gradient.addColorStop(1, "#" + new THREE.Color(fogColor).getHexString());
    skyContext.fillStyle = gradient;
    skyContext.fillRect(0, 0, 4, 256);
    this.scene.background = new THREE.CanvasTexture(skyCanvas);
    this.scene.background.colorSpace = THREE.SRGBColorSpace;
    this.scene.fog = new THREE.Fog(fogColor, flagship ? 240 : 180, 1100);
    this.scene.add(
      new THREE.HemisphereLight(
        flagship ? 0xb9ccf4 : 0xb9d6ff,
        flagship ? 0x29283d : 0x253451,
        flagship ? 1.15 : 1.8,
      ),
    );
    if (flagship) this.scene.add(new THREE.AmbientLight(0xb0c5de, 0.3));
    const sun = new THREE.DirectionalLight(
      flagship ? 0xffc3a4 : 0xffd4bc,
      flagship ? 1.4 : 2.1,
    );
    sun.position.set(-300, 500, 150);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x53d9ff, 0.6);
    fill.position.set(400, 80, -300);
    this.scene.add(fill);
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
          addStrip(a, b, -w, -w + 1.1, 0.06, 0xef4d43);
        if (!shared || branch === 1)
          addStrip(a, b, w - 0.5, w, 0.06, colors.white);
        if (i % 7 < 3) addStrip(a, b, -0.13, 0.13, 0.04, 0xb4c3cf);
        if (i % 28 === 0) {
          const point = ([x, z]) =>
            a.p
              .clone()
              .addScaledVector(a.right, x)
              .addScaledVector(a.tangent, z)
              .addScaledVector(a.up, 0.1);
          for (const side of [-1, 1])
            quads.push({
              p: [
                [0, 5],
                [side * 3, 0],
                [side * 3, -1.5],
                [0, 3.5],
              ].map(point),
              color: 0xe8f2ee,
              kind: "light",
            });
        }
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
            color: i % 12 === 0 ? 0xf4eee2 : 0x3c8d9e,
            kind: i % 12 === 0 ? "concrete" : "glass",
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
            p2[0].addScaledVector(a.up, flagship ? 1.4 : 0.75);
            p2[1].addScaledVector(b.up, flagship ? 1.4 : 0.75);
            p2[2].addScaledVector(b.up, flagship ? -0.2 : -0.45);
            p2[3].addScaledVector(a.up, flagship ? -0.2 : -0.45);
            quads.push({
              p: p2,
              color: branch === 1 ? 0xe55da5 : cfg.color,
              kind: "light",
            });
          }
        }
        // Repeating overhead ribs and tunnel skin create near-field motion cues.
        if (!flagship && u > cfg.tunnel[0] && u < cfg.tunnel[1]) {
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
    for (const kind of ["road", "concrete", "paint", "glass", "light"]) {
      const material =
        kind === "glass"
          ? new THREE.MeshBasicMaterial({
              vertexColors: true,
              transparent: true,
              opacity: 0.48,
              depthWrite: false,
              side: THREE.DoubleSide,
            })
          : flagship && kind === "road"
            ? new THREE.MeshPhongMaterial({
                vertexColors: true,
                map: textures.road,
                specular: 0x56516c,
                shininess: 38,
                side: THREE.DoubleSide,
                flatShading: true,
              })
            : kind === "light"
              ? new THREE.MeshBasicMaterial({
                  vertexColors: true,
                  side: THREE.DoubleSide,
                })
              : new THREE.MeshLambertMaterial({
                  vertexColors: true,
                  map: textures[kind],
                  side: THREE.DoubleSide,
                  flatShading: true,
                });
      const chunks = new Map();
      for (const q of quads.filter((q) => q.kind === kind)) {
        const key = `${Math.floor(q.p[0].x / 256)}:${Math.floor(q.p[0].z / 256)}`;
        if (!chunks.has(key)) chunks.set(key, []);
        chunks.get(key).push(q);
      }
      for (const chunk of chunks.values())
        this.scene.add(new THREE.Mesh(quadGeometry(chunk), material));
    }
    this.city = buildCity(this.scene, track, textures, environment);
    if (flagship)
      buildFlagship(
        this.scene,
        track,
        textures,
        environment,
        this.flagshipAssets,
      );
    const obj = new THREE.Object3D();
    const supportFrames = Array.from({ length: 60 }, (_, i) => {
      const u = i / 60;
      return (u > cfg.split[0] && u < cfg.split[1] ? [-1, 1] : [0]).map(
        (branch) => track.frame(u * track.length, branch),
      );
    }).flat();
    const supports = new THREE.InstancedMesh(
      boxGeo,
      mat(0xf4eee1, { map: textures.concrete }),
      supportFrames.length * 3,
    );
    const trusses = new THREE.InstancedMesh(
      boxGeo,
      mat(0xed4d49),
      supportFrames.length * 2,
    );
    const beam = (mesh, index, start, end, width, depth) => {
      const direction = end.clone().sub(start);
      obj.position.copy(start).lerp(end, 0.5);
      obj.quaternion.setFromUnitVectors(UP, direction.clone().normalize());
      obj.scale.set(width, direction.length(), depth);
      obj.updateMatrix();
      mesh.setMatrixAt(index, obj.matrix);
    };
    supportFrames.forEach((f, i) => {
      const bottom = environment.heightAt(f.p.x, f.p.z) - 3;
      const foot = new THREE.Vector3(f.p.x, bottom, f.p.z),
        fork = f.p
          .clone()
          .addScaledVector(UP, -Math.min(13, (f.p.y - bottom) * 0.35));
      beam(supports, i * 3, foot, fork, 4.6, 4.6);
      for (const [j, side] of [-1, 1].entries()) {
        const edge = f.p
          .clone()
          .addScaledVector(f.right, side * f.width * 0.72)
          .addScaledVector(f.up, -2.2);
        beam(supports, i * 3 + j + 1, fork, edge, 3, 4.2);
        beam(
          trusses,
          i * 2 + j,
          fork.clone().addScaledVector(UP, 3),
          edge,
          1.1,
          1.5,
        );
      }
    });
    this.scene.add(supports, trusses);
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
      }
    }
    const startFrame = track.frame(0);
    for (let x = -startFrame.width; x < startFrame.width; x += 2)
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
    buildSplitMarkers(this.scene, track);
    if (!flagship) {
      const ribMaterial = mat(0xf5eee1, { map: textures.paint });
      const ribLight = basic(cfg.color);
      for (let i = 0; i < 6; i++) {
        const u = 0.025 + i * 0.16;
        for (const branch of u > cfg.split[0] && u < cfg.split[1]
          ? [-1, 1]
          : [0]) {
          const f = track.frame(u * track.length, branch),
            w = f.width + 4;
          const points = [
            [-w, -2],
            [-w + 1, 10],
            [0, 21],
            [w - 1, 10],
            [w, -2],
          ].map(([x, y]) =>
            f.p.clone().addScaledVector(f.right, x).addScaledVector(f.up, y),
          );
          const path = new THREE.CatmullRomCurve3(points);
          this.scene.add(
            new THREE.Mesh(
              new THREE.TubeGeometry(path, 20, 0.8, 4, false),
              ribMaterial,
            ),
          );
          const lightPath = new THREE.CatmullRomCurve3(
            points.map((p) => p.clone().addScaledVector(f.tangent, -0.9)),
          );
          this.scene.add(
            new THREE.Mesh(
              new THREE.TubeGeometry(lightPath, 20, 0.13, 4, false),
              ribLight,
            ),
          );
          const footing = new THREE.Mesh(
            new THREE.BoxGeometry(w * 2 + 2, 1.2, 3),
            ribMaterial,
          );
          footing.position.copy(f.p).addScaledVector(f.up, -2.5);
          footing.rotation.y = Math.atan2(f.tangent.x, f.tangent.z);
          this.scene.add(footing);
        }
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
  makeShip(color) {
    return createCraft(this.scene, color);
  }
  setupRacers(race, specs) {
    for (const ship of this.ships)
      this.scene.remove(ship, ship.userData.shadow);
    for (const particle of this.sparkData) particle.life = 0;
    this.cameraForward = null;
    this.cameraReady = false;
    this.ships = race.racers.map((r) => this.makeShip(specs[r.craft].color));
  }
  burst(racer) {
    const f = this.track.frame(racer.s, racer.branch);
    for (let i = 0; i < 10; i++) {
      const particle =
        this.sparkData[this.sparkCursor++ % this.sparkData.length];
      particle.life = 0.25 + Math.random() * 0.4;
      particle.p.copy(racer.position);
      particle.v
        .copy(f.tangent)
        .multiplyScalar(-12 - Math.random() * 18)
        .addScaledVector(f.right, (Math.random() - 0.5) * 20)
        .addScaledVector(f.up, Math.random() * 12);
    }
  }
  draw(race, dt, demo = false) {
    this.time += dt;
    this.city.update(this.time);
    const player = race.player,
      track = this.track;
    const f = track.frame(player.s, player.branch);
    const focus = player.position.clone().addScaledVector(UP, 0.7);
    const forward = new THREE.Vector3(
      Math.sin(player.yaw),
      0,
      Math.cos(player.yaw),
    );
    this.cameraForward ??= forward.clone();
    this.cameraForward.lerp(forward, 1 - Math.exp(-dt * 5)).normalize();
    const desired = focus
      .clone()
      .addScaledVector(this.cameraForward, -11 - player.speed * 0.018)
      .addScaledVector(UP, 4.2);
    const ahead = focus.clone().addScaledVector(this.cameraForward, 28);
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
    this.camera.up.copy(UP);
    this.camera.lookAt(ahead);
    const fov = 68 + player.speed * 0.085 + player.boost * 5;
    this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-dt * 3.5));
    this.camera.updateProjectionMatrix();
    for (const r of race.racers) {
      const ship = this.ships[r.id];
      if (!ship) continue;
      ship.visible = demo || r !== player || this.view !== "first-person";
      const rf = track.frame(r.contactS, r.branch);
      ship.position.copy(r.position);
      const pitch = r.pitch;
      ship.rotation.set(
        pitch,
        r.yaw,
        clamp(-r.yawRate * 0.45, -0.5, 0.5),
        "YXZ",
      );
      ship.getObjectByName("shield").visible = r.protect > 0;
      ship.userData.updateExhaust(r.speed, r.boost, this.time);
      const shadow = ship.userData.shadow;
      shadow.position.copy(r.position);
      shadow.position.y = rf.p.y + 0.12;
      shadow.visible = r.h < 15 && ship.visible && !track.gap(rf.u);
    }
    if (!demo && this.view === "first-person") {
      const ship = this.ships[player.id];
      const up = UP.clone().applyQuaternion(ship.quaternion);
      const gaze = new THREE.Vector3(0, 0, 1).applyQuaternion(ship.quaternion);
      this.camera.position
        .copy(player.position)
        .add(new THREE.Vector3(0, 1.15, 0.6).applyQuaternion(ship.quaternion));
      this.camera.up.copy(up);
      this.camera.lookAt(this.camera.position.clone().add(gaze));
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
        if (e.position) m.position.copy(e.position);
        else {
          const ef = track.frame(e.s, e.branch);
          m.position
            .copy(ef.p)
            .addScaledVector(ef.right, e.x)
            .addScaledVector(ef.up, 2);
        }
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
