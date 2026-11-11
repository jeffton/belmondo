import * as THREE from "three";
import { mod, clamp } from "./track.js";
import { buildTrackPads } from "./track-pads.js";
import { WeaponEffects } from "./weapon-effects.js";
import { circuitTextures } from "./materials.js";
import { buildTrackLighting } from "./track-lighting.js";
import { buildEnvironment } from "./environment.js";
import { buildCity } from "./city.js";
import { buildSplitMarkers, buildTrackAdvertising } from "./advertising.js";
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

function quadGeometry(quads, lighting) {
  const vertices = [],
    c = [],
    uv = [];
  for (const q of quads) {
    for (const i of [0, 2, 1, 0, 3, 2]) {
      const color = new THREE.Color(lighting.shade(q.p[i], q.color));
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
    this.lighting?.dispose();
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
    this.lighting = buildTrackLighting(this.scene, track);
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
    const roadPoint = (frame, x, y) => {
      const inner =
        frame.seam &&
        ((frame.branch === -1 && x === frame.clipMax) ||
          (frame.branch === 1 && x === frame.clipMin));
      return (
        inner
          ? frame.seam.clone()
          : frame.p.clone().addScaledVector(frame.right, x)
      ).addScaledVector(frame.up, y);
    };
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
      const v0 = (a.u * track.length) / 32,
        v1 = ((b.u < a.u ? b.u + 1 : b.u) * track.length) / 32;
      // Night projectors need vertices across the deck, not just at its edges.
      // Boundaries and root stations are unchanged; subdivision is render-only.
      const divisions = kind === "road" && cfg.name === "NOCTILUCENT" ? 8 : 1;
      for (let strip = 0; strip < divisions; strip++) {
        const x0 =
          strip === 0
            ? leftA
            : THREE.MathUtils.lerp(leftA, rightA, strip / divisions);
        const x1 =
          strip + 1 === divisions
            ? rightA
            : THREE.MathUtils.lerp(leftA, rightA, (strip + 1) / divisions);
        const x2 =
          strip + 1 === divisions
            ? rightB
            : THREE.MathUtils.lerp(leftB, rightB, (strip + 1) / divisions);
        const x3 =
          strip === 0
            ? leftB
            : THREE.MathUtils.lerp(leftB, rightB, strip / divisions);
        quads.push({
          p: [
            roadPoint(a, x0, y),
            roadPoint(a, x1, y),
            roadPoint(b, x2, y),
            roadPoint(b, x3, y),
          ],
          color,
          kind,
          uv: [
            [x0 / 32, v0],
            [x1 / 32, v0],
            [x2 / 32, v1],
            [x3 / 32, v1],
          ],
        });
      }
    };
    const steps = 900;
    const stations = [
      ...new Set([
        ...Array.from({ length: steps + 1 }, (_, i) => i / steps),
        ...cfg.split,
      ]),
    ].sort((a, b) => a - b);
    const connectedAt = (u) => {
      const f = track.frame(u * track.length, -1);
      return track.bounds(f.u * track.length, -1).connected;
    };
    const transitions = [];
    for (let i = 0; i < stations.length - 1; i++) {
      let left = stations[i],
        right = stations[i + 1];
      if (left < cfg.split[0] || right > cfg.split[1]) continue;
      const leftConnected = connectedAt(left);
      if (leftConnected === connectedAt(right)) continue;
      // Both road halves must end at the same physical fork tip. Interpolating
      // directly from a joined station to a separated one opens an early hole.
      while (true) {
        const middle = (left + right) / 2;
        if (middle === left || middle === right) break;
        if (connectedAt(middle) === leftConnected) left = middle;
        else right = middle;
      }
      transitions.push(leftConnected ? left : right);
    }
    stations.push(...transitions);
    stations.sort((a, b) => a - b);
    for (let i = 0; i < stations.length - 1; i++) {
      const u = stations[i];
      const split = u >= cfg.split[0] && u < cfg.split[1];
      if (track.gap(u)) continue;
      for (const branch of split ? [-1, 1] : [0]) {
        const a = track.frame(u * track.length, branch),
          b = track.frame(stations[i + 1] * track.length, branch),
          w = a.width;
        for (const f of [a, b]) {
          Object.assign(f, track.bounds(f.u * track.length, branch));
          f.branch = branch;
        }
        const shared = split && a.connected && b.connected;
        addStrip(a, b, -w, w, 0, i % 5 === 0 ? 0xabb3ac : colors.road, "road");
        addStrip(a, b, -w, w, -2, 0x8f9c96, "concrete");
        if (!shared || branch === -1)
          addStrip(a, b, -w, -w + 1.1, 0.06, 0xef4d43);
        if (!shared || branch === 1)
          addStrip(a, b, w - 0.5, w, 0.06, colors.white);
        if (i % 7 < 3) addStrip(a, b, -0.13, 0.13, 0.04, 0xb4c3cf);
        for (const side of [-1, 1]) {
          if (shared && side === -branch) continue;
          const edgeA = clamp(a.width * side, a.clipMin, a.clipMax),
            edgeB = clamp(b.width * side, b.clipMin, b.clipMax);
          const lowerA = roadPoint(a, edgeA, -2);
          const lowerB = roadPoint(b, edgeB, -2);
          const nose = split && side === -branch && u < cfg.split[0] + 0.07;
          quads.push({
            p: [lowerA, lowerB, roadPoint(b, edgeB, 0), roadPoint(a, edgeA, 0)],
            color: 0xbac0b0,
            kind: "concrete",
          });
          // Inner faces remain exactly on the collision boundary, including the
          // shared world-space seam. All visual thickness extends OUT of the road.
          const wallPoint = (frame, edge, height, depth = 0) =>
            roadPoint(frame, edge, height).addScaledVector(
              frame.right,
              side * depth,
            );
          const face = (low, high, color, depth = 0, kind = "concrete") => {
            quads.push({
              p: [
                wallPoint(a, edgeA, low, depth),
                wallPoint(b, edgeB, low, depth),
                wallPoint(b, edgeB, high, depth),
                wallPoint(a, edgeA, high, depth),
              ],
              color,
              kind,
              uv: [
                [(a.u * track.length) / 8, low / 3],
                [(b.u * track.length) / 8, low / 3],
                [(b.u * track.length) / 8, high / 3],
                [(a.u * track.length) / 8, high / 3],
              ],
            });
          };
          const joint = i % 12 === 0;
          face(0, 0.46, 0x37434e);
          face(
            0.46,
            1.45,
            nose ? (i % 2 ? 0xf2e3c7 : 0xff693c) : joint ? 0x525961 : 0xb9bab0,
          );
          face(1.45, 1.7, joint ? 0x6a7078 : 0xe2dbca);
          face(0, 1.7, 0x6b747d, 1.1);
          quads.push({
            p: [
              wallPoint(a, edgeA, 1.7),
              wallPoint(b, edgeB, 1.7),
              wallPoint(b, edgeB, 1.7, 1.1),
              wallPoint(a, edgeA, 1.7, 1.1),
            ],
            color: joint ? 0x656c73 : 0xe5dcc9,
            kind: "concrete",
          });
          // Sparse inset reflectors, not luminous wireframe along the whole wall.
          if (i % 6 === 0)
            face(0.72, 0.86, nose ? 0xff643c : 0xffca74, -0.018, "light");
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
    for (const kind of ["road", "concrete", "paint", "light"]) {
      const material =
        flagship && kind === "road"
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
        this.scene.add(
          new THREE.Mesh(quadGeometry(chunk, this.lighting), material),
        );
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
    buildTrackPads(this.scene, track, textures);
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
    buildTrackAdvertising(this.scene, track, environment);
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
    this.weaponEffects = new WeaponEffects(this.scene);
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
    this.weaponEffects.reset();
    for (const ship of this.ships)
      this.scene.remove(ship, ship.userData.shadow, ship.userData.shield);
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
      .addScaledVector(this.cameraForward, -10.5 - player.speed * 0.006)
      .addScaledVector(UP, 3.8);
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
    } else {
      this.camera.position.add(focus.clone().sub(this.cameraFocus));
      this.camera.position.lerp(desired, 1 - Math.exp(-dt * 9));
    }
    this.cameraFocus = focus;
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
      const shield = ship.userData.shield;
      shield.position.copy(ship.position);
      shield.quaternion.copy(ship.quaternion);
      shield.visible = r.protect > 0;
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
    this.weaponEffects.update(race, dt, this.time);
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
    this.lighting.update(this.camera);
    this.renderer.render(this.scene, this.camera);
  }
}
