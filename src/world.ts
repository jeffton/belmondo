import * as THREE from "three";
import type { Track, TrackFrame, RoadBounds } from "./track.ts";
import type { Race, Racer } from "./race.ts";
import type { Craft } from "./craft.ts";
import type { EnvironmentSurface, CircuitTextures } from "./environment.ts";
import type { PreparedCourse } from "./course-preparation.ts";

type RoadFrame = TrackFrame & RoadBounds & { branch?: number };
interface SceneResourceObject extends THREE.Object3D {
  isInstancedMesh?: boolean;
  geometry?: THREE.BufferGeometry;
  material?:
    | (THREE.Material & { map?: THREE.Texture })
    | (THREE.Material & { map?: THREE.Texture })[];
}
interface SurfaceQuad {
  p: THREE.Vector3[];
  color: THREE.ColorRepresentation;
  kind?: string;
  uv?: number[][];
  indices?: number[];
}
interface SparkParticle {
  life: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
}

/** Scene resources prepared off-screen; renderer and camera stay on the live world. */
export type PreparedWorldScene = Omit<
  World,
  | "renderer"
  | "camera"
  | "cameraFocus"
  | "time"
  | "view"
  | "quality"
  | "resize"
  | "setView"
  | "prepare"
  | "adopt"
  | "draw"
>;

import { mod, clamp, isCoastLayout } from "./track.ts";
import { steeringBank, updateShipBank } from "./ship-bank.ts";
import { clearChaseCamera } from "./chase-camera.ts";
import { aimMenuFlyover } from "./menu-flyover.ts";
import { RAIL_PROFILE } from "./rail-profile.ts";
import { railPoint, railBackDepth, railHeight } from "./rail-geometry.ts";
import { createRailFaceTexture, railFaceUV } from "./rail-face.ts";
import { buildTrackPads } from "./track-pads.ts";
import { tunnelSegment } from "./tunnel-architecture.ts";
import { applyJumpMarkings } from "./jump-markings.ts";
import { createRoadFinish } from "./road-finish.ts";
import { createOceanGeometry } from "./water-surfaces.ts";
import {
  roadFrame,
  roadPoint,
  roadStations,
  roadStrip,
  getRoadSurface,
} from "./road-surface.ts";
import { buildStartGantry } from "./start-gantry.ts";
import { gridApproachBlend } from "./start-sequence.ts";
import { buildFinishDistrict } from "./finish-district.ts";
import { WeaponEffects } from "./weapon-effects.ts";
import { ImpactSparks } from "./impact-sparks.ts";
import { shakeHitShip, shakeHitCockpit } from "./weapon-hit.ts";
import { circuitTextures } from "./materials.ts";
import { buildTrackLighting } from "./track-lighting.ts";
import { createSky } from "./sky.ts";
import { buildEnvironment } from "./environment.ts";
import { buildSceneryActivity } from "./scenery-activity.ts";
import { buildRacingInfrastructure } from "./racing-infrastructure.ts";
import { buildCity } from "./city.ts";
import { buildNightHarbor } from "./night-harbor.ts";
import { buildCinderWorks } from "./cinder-works.ts";
import { buildVegetation } from "./vegetation.ts";
import { buildSplitMarkers, buildTrackAdvertising } from "./advertising.ts";
import {
  createCraft,
  collectCraftResources,
  releaseCraftShadow,
} from "./craft.ts";
import { buildFlagship, loadFlagshipAssets } from "./flagship.ts";
import { buildPalmBreakerAirport } from "./palm-breaker-airport.ts";

const UP = new THREE.Vector3(0, 1, 0);
const mat = (
  color: THREE.ColorRepresentation,
  extra: THREE.MeshLambertMaterialParameters = {},
) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const basic = (color: THREE.ColorRepresentation) =>
  new THREE.MeshBasicMaterial({ color });
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

function quadGeometry(
  quads: SurfaceQuad[],
  lighting: ReturnType<typeof buildTrackLighting>,
) {
  const vertices = [],
    c = [],
    uv: number[] = [];
  for (const q of quads) {
    const cornerColors = q.p.map(
      (point) => new THREE.Color(lighting.shade(point, q.color)),
    );
    for (const i of q.indices ?? [0, 2, 1, 0, 3, 2]) {
      const color = cornerColors[i];
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
  declare flagshipAssets: ReturnType<typeof loadFlagshipAssets>;
  declare assetTextures: Set<THREE.Texture>;
  declare renderer: THREE.WebGLRenderer;
  declare camera: THREE.PerspectiveCamera;
  declare scene: THREE.Scene;
  declare ships: Craft[];
  declare time: number;
  declare cameraReady: boolean;
  declare cameraForward: THREE.Vector3 | null;
  declare cameraFocus: THREE.Vector3;
  declare view: string;
  declare quality: string;
  declare track: Track;
  declare textures: CircuitTextures;
  declare lighting: ReturnType<typeof buildTrackLighting>;
  declare environment: EnvironmentSurface;
  declare city: ReturnType<typeof buildCity>;
  declare scenery: ReturnType<typeof buildSceneryActivity>;
  declare startGantry: ReturnType<typeof buildStartGantry>;
  declare finishDistrict: ReturnType<typeof buildFinishDistrict>;
  declare weaponEffects: WeaponEffects;
  declare impactSparks: ImpactSparks;
  declare effectMat: THREE.MeshBasicMaterial;
  declare sparks: THREE.InstancedMesh;
  declare sparkData: SparkParticle[];
  declare sparkCursor: number;

  constructor(canvas: HTMLCanvasElement) {
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
    this.quality = "retro";
    this.resize();
  }
  setView(view: string) {
    this.view = view;
    this.cameraReady = false;
    this.cameraForward = null;
  }
  resize() {
    const { clientWidth: width, clientHeight: height } =
      this.renderer.domElement;
    const scale = this.quality === "retro" ? 0.55 : Math.min(1, 1500 / width);
    this.renderer.setSize(
      Math.round(width * scale),
      Math.round(height * scale),
      false,
    );
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
  disposeScene() {
    this.lighting?.dispose();
    if (this.scene) {
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>(),
        textures = new Set<THREE.Texture>();
      this.scene.traverse((o: SceneResourceObject) => {
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
      collectCraftResources(this.scene, { geometries, materials, textures });
      (this.scene.background as THREE.Texture | null)?.dispose?.();
      geometries.forEach((g) => {
        if (g !== boxGeo) g.dispose();
      });
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => {
        if (!this.assetTextures.has(t)) t.dispose();
      });
    }
  }
  build(track: Track, prepared?: PreparedCourse | null) {
    for (const _ of this.buildSteps(track, prepared)) {
      // Synchronous construction remains useful for deterministic CPU fixtures.
    }
  }
  async prepare(
    track: Track,
    prepared: PreparedCourse | null | undefined,
    isCurrent: () => boolean,
    setup: (candidate: PreparedWorldScene) => void,
  ): Promise<PreparedWorldScene | null> {
    // The generator initializes scene-owned fields without creating a second renderer.
    const candidate = Object.create(World.prototype) as PreparedWorldScene;
    candidate.flagshipAssets = this.flagshipAssets;
    candidate.assetTextures = this.assetTextures;
    const steps = candidate.buildSteps(track, prepared);
    let complete = false;
    try {
      while (isCurrent()) {
        if (steps.next().done) {
          setup(candidate);
          // Compile the completed scene before committing it. Parallel shader
          // compilation avoids first-frame driver stalls while the old feed runs.
          await this.renderer.compileAsync(candidate.scene, this.camera);
          if (!isCurrent()) return null;
          complete = true;
          return candidate;
        }
        // A task boundary lets pointer input and animation run between build slices.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      return null;
    } finally {
      if (!complete) {
        steps.return();
        candidate.disposeScene();
      }
    }
  }
  adopt(candidate: PreparedWorldScene) {
    this.disposeScene();
    Object.assign(this, candidate);
  }
  *buildSteps(
    track: Track,
    prepared?: PreparedCourse | null,
  ): Generator<void, void, unknown> {
    this.disposeScene();
    let sliceStart = performance.now();
    this.scene = new THREE.Scene();
    this.track = track;
    this.ships = [];
    this.cameraReady = false;
    const cfg = track.config;
    const flagship = isCoastLayout(cfg.layoutId);
    const faultline = cfg.name === "FAULTLINE";
    const fogColor = cfg.fog;
    const textures: ReturnType<typeof circuitTextures> & {
      rail?: THREE.Texture;
    } = circuitTextures("#" + new THREE.Color(cfg.color).getHexString());
    textures.rail = createRailFaceTexture(cfg.name);
    this.textures = textures;
    this.scene.background = createSky(cfg, fogColor, prepared?.sky);
    this.scene.fog = new THREE.Fog(
      fogColor,
      faultline ? 900 : flagship ? 240 : 180,
      faultline ? 3600 : 1100,
    );
    this.lighting = buildTrackLighting(this.scene, track);
    yield;
    const environment = buildEnvironment(
      this.scene,
      track,
      textures,
      prepared?.terrain,
    );
    this.environment = environment;
    const sea = new THREE.Mesh(
      createOceanGeometry(flagship ? environment.heightAt : undefined),
      mat(flagship ? 0xffffff : cfg.sea, {
        map: textures.water,
        vertexColors: flagship,
      }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = faultline ? -200 : -16;
    this.scene.add(sea);
    yield;
    buildRacingInfrastructure(this.scene, track, textures, environment);
    yield;
    const quads: SurfaceQuad[] = [];
    const addStrip = (
      a: RoadFrame,
      b: RoadFrame,
      left: number,
      right: number,
      y: number,
      color: THREE.ColorRepresentation,
      kind = "paint",
    ) => {
      const edgeAt = (frame: RoadFrame, value: number) =>
        Math.abs(value) > a.width - 0.6
          ? value + Math.sign(value) * (frame.width - a.width)
          : value;
      const leftA = clamp(left, a.clipMin, a.clipMax),
        rightA = clamp(right, a.clipMin, a.clipMax);
      const leftB = clamp(edgeAt(b, left), b.clipMin, b.clipMax),
        rightB = clamp(edgeAt(b, right), b.clipMin, b.clipMax);
      if (leftA === rightA && leftB === rightB) return;
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
          ...roadStrip(
            track,
            a,
            b,
            [x0, x1, x2, x3],
            y,
            [strip / divisions, (strip + 1) / divisions],
            (kind === "road" || kind === "concrete") &&
              left === -a.width &&
              right === a.width,
          ),
          color,
          kind,
        });
      }
    };
    const stations = roadStations(track);
    for (let i = 0; i < stations.length - 1; i++) {
      const u = stations[i];
      const split = u >= cfg.split[0] && u < cfg.split[1];
      if (performance.now() - sliceStart >= 1000 / 60) {
        yield;
        sliceStart = performance.now();
      }
      if (track.gap(u)) continue;
      for (const branch of split ? [-1, 1] : [0]) {
        const a = roadFrame(track, u * track.length, branch),
          b = roadFrame(
            track,
            stations[i + 1] * track.length -
              (stations[i + 1] === cfg.jump ? 0.000001 : 0),
            branch,
          ),
          w = a.width;
        const shared = split && a.connected && b.connected;
        addStrip(
          a,
          b,
          -w,
          w,
          0,
          cfg.biome === "metropolis"
            ? i % 9 < 2
              ? 0x526578
              : 0x46586c
            : i % 9 < 2
              ? 0xb6bdc4
              : 0xc1c3c3,
          "road",
        );
        addStrip(a, b, -w, w, -2, 0x7a8589, "concrete");
        // Recessed service shoulders, not car-racing curbs or painted lanes.
        // Chevrons belong exclusively to real boost pads.
        if (!shared || a.innerSide === 1)
          addStrip(a, b, -w, -w + 1.65, 0.025, 0x697176, "edge");
        if (!shared || a.innerSide === -1)
          addStrip(a, b, w - 1.65, w, 0.025, 0x697176, "edge");
        for (const side of [-1, 1]) {
          if (shared && side === a.innerSide) continue;
          const edgeA = clamp(a.width * side, a.clipMin, a.clipMax),
            edgeB = clamp(b.width * side, b.clipMin, b.clipMax);
          const lowerA = roadPoint(a, edgeA, -2);
          const lowerB = roadPoint(b, edgeB, -2);
          const nose = split && side === a.innerSide && u < cfg.split[0] + 0.07;
          quads.push({
            p: [lowerA, lowerB, roadPoint(b, edgeB, 0), roadPoint(a, edgeA, 0)],
            color: 0xbac0b0,
            kind: "concrete",
          });
          // The physical face slopes outwards; split tips taper from zero height
          // and meet at the median rather than overlapping the opposite lane.
          const H = RAIL_PROFILE.height;
          const backA = railBackDepth(track, a, side),
            backB = railBackDepth(track, b, side);
          const back = (f: RoadFrame) => (f === a ? backA : backB);
          const wallPoint = (
            frame: RoadFrame,
            edge: number,
            height: number,
            depth: number | ((frame: RoadFrame) => number) = 0,
          ) =>
            railPoint(
              frame,
              edge,
              side,
              height,
              typeof depth === "function" ? depth(frame) : depth,
            );
          const face = (
            low: number,
            high: number,
            color: THREE.ColorRepresentation,
            depth: number | ((frame: RoadFrame) => number) = 0,
            kind = "edge",
          ) => {
            quads.push({
              p: [
                wallPoint(a, edgeA, low, depth),
                wallPoint(b, edgeB, low, depth),
                wallPoint(b, edgeB, high, depth),
                wallPoint(a, edgeA, high, depth),
              ],
              color,
              kind,
              uv:
                kind === "rail"
                  ? [
                      railFaceUV(
                        a.u,
                        Math.min(low, railHeight(a, side)),
                        track.length,
                      ),
                      railFaceUV(
                        b.u < a.u ? b.u + 1 : b.u,
                        Math.min(low, railHeight(b, side)),
                        track.length,
                      ),
                      railFaceUV(
                        b.u < a.u ? b.u + 1 : b.u,
                        Math.min(high, railHeight(b, side)),
                        track.length,
                      ),
                      railFaceUV(
                        a.u,
                        Math.min(high, railHeight(a, side)),
                        track.length,
                      ),
                    ]
                  : [
                      [(a.u * track.length) / 8, low / 3],
                      [(b.u * track.length) / 8, low / 3],
                      [(b.u * track.length) / 8, high / 3],
                      [(a.u * track.length) / 8, high / 3],
                    ],
            });
          };
          const joint = i % 3 === 0;
          // Mineral-paint light/dark panels cover the physical slope itself;
          // there is no added banner, curb or luminous strip.
          face(0, 0.38, 0xffffff, 0, "rail");
          face(0.38, H - 0.25, 0xffffff, 0, "rail");
          face(H - 0.25, H, 0xffffff, 0, "rail");
          face(0, H, 0x737e84, back);
          quads.push({
            p: [
              wallPoint(a, edgeA, H),
              wallPoint(b, edgeB, H),
              wallPoint(b, edgeB, H, backB),
              wallPoint(a, edgeA, H, backA),
            ],
            color: 0xffffff,
            kind: "rail",
            uv: [
              railFaceUV(a.u, railHeight(a, side), track.length),
              railFaceUV(
                b.u < a.u ? b.u + 1 : b.u,
                railHeight(b, side),
                track.length,
              ),
              railFaceUV(
                b.u < a.u ? b.u + 1 : b.u,
                railHeight(b, side),
                track.length,
              ),
              railFaceUV(a.u, railHeight(a, side), track.length),
            ],
          });
          // Substantial cast impact blocks project OUT of the physical boundary.
          // The continuous inner face/height remains exactly the collision wall.
          if (joint && (branch === 0 || side !== a.innerSide)) {
            face(-2, H, 0x7e8a91, 2.6);
            quads.push({
              p: [
                wallPoint(a, edgeA, H, backA),
                wallPoint(b, edgeB, H, backB),
                wallPoint(b, edgeB, H, 2.6),
                wallPoint(a, edgeA, H, 2.6),
              ],
              color: 0xaeb1a8,
              kind: "edge",
            });
            for (const [f, edge] of [
              [a, edgeA],
              [b, edgeB],
            ] as [RoadFrame, number][])
              quads.push({
                p: [
                  wallPoint(f, edge, -2, back(f)),
                  wallPoint(f, edge, H, back(f)),
                  wallPoint(f, edge, H, 2.6),
                  wallPoint(f, edge, -2, 2.6),
                ],
                color: 0x68757e,
                kind: "edge",
              });
          }
          if (i % 8 === 0)
            face(0.65, 0.82, nose ? 0xffa348 : 0xc3c6a0, -0.018, "light");
        }
        if (track.isTunnel(u * track.length, branch))
          quads.push(...tunnelSegment(a, b, track));
      }
    }
    // The open quarry sees multiple stacked road sectors at once. Larger
    // render-only cells reduce submissions without merging the whole circuit.
    const roadChunkSize = faultline ? 512 : 256;
    for (const kind of [
      "road",
      "concrete",
      "paint",
      "edge",
      "rail",
      "light",
      "tunnel",
    ] as const) {
      const material =
        kind === "road"
          ? createRoadFinish(cfg.name, textures.road)
          : kind === "light"
            ? new THREE.MeshBasicMaterial({
                vertexColors: true,
                side: THREE.DoubleSide,
              })
            : new THREE.MeshLambertMaterial({
                vertexColors: true,
                map: textures[kind === "tunnel" ? "concrete" : kind],
                // Baked service-light bounce keeps the soffit readable without
                // adding per-bay real-time lights or lifting the outside world.
                emissive: kind === "tunnel" ? 0x202632 : 0x000000,
                side: THREE.DoubleSide,
                flatShading: true,
              });
      if (kind === "road") applyJumpMarkings(material, track);
      const chunks = new Map<string, SurfaceQuad[]>();
      for (const q of quads.filter((q) => q.kind === kind)) {
        const key = `${Math.floor(q.p[0].x / roadChunkSize)}:${Math.floor(q.p[0].z / roadChunkSize)}`;
        if (!chunks.has(key)) chunks.set(key, []);
        chunks.get(key)!.push(q);
      }
      for (const chunk of chunks.values()) {
        this.scene.add(
          new THREE.Mesh(quadGeometry(chunk, this.lighting), material),
        );
        if (performance.now() - sliceStart >= 1000 / 60) {
          yield;
          sliceStart = performance.now();
        }
      }
    }
    yield;
    this.city = faultline
      ? Object.assign(new THREE.Group(), { update(_time: number) {} })
      : buildCity(this.scene, track, textures, environment);
    if (cfg.name === "NOCTILUCENT")
      buildNightHarbor(this.scene, track, textures, environment);
    if (cfg.name === "CINDERLINE")
      buildCinderWorks(this.scene, track, textures, environment);
    yield;
    if (flagship) {
      buildFlagship(
        this.scene,
        track,
        textures,
        environment,
        this.flagshipAssets,
      );
      buildPalmBreakerAirport(this.scene, track, environment);
    }
    yield;
    const obj = new THREE.Object3D();
    const foundationQuads: SurfaceQuad[] = [];
    for (let i = 0; i < stations.length - 1; i++) {
      if (performance.now() - sliceStart >= 1000 / 60) {
        yield;
        sliceStart = performance.now();
      }
      const u = stations[i],
        next = stations[i + 1];
      if (track.gap(u)) continue;
      for (const branch of u >= cfg.split[0] && u < cfg.split[1]
        ? [-1, 1]
        : [0]) {
        if (
          environment.bridgeAt(u, branch) ||
          environment.bridgeAt(next % 1, branch)
        )
          continue;
        const a = track.frame(u * track.length, branch) as RoadFrame,
          b = track.frame(next * track.length, branch) as RoadFrame;
        Object.assign(a, track.bounds(u * track.length, branch), { branch });
        Object.assign(b, track.bounds(next * track.length, branch), { branch });
        for (const side of [-1, 1]) {
          if (a.connected && b.connected && side === a.innerSide) continue;
          const pa = roadPoint(a, side < 0 ? a.clipMin : a.clipMax, -2);
          const pb = roadPoint(b, side < 0 ? b.clipMin : b.clipMax, -2);
          const fa = pa.clone().setY(environment.heightAt(pa.x, pa.z) - 0.7);
          const fb = pb.clone().setY(environment.heightAt(pb.x, pb.z) - 0.7);
          foundationQuads.push({
            p: [pa, pb, fb, fa],
            color: cfg.name === "SOLAR ARRAY" ? 0x92765c : 0x737b78,
          });
        }
      }
    }
    const foundationMaterial = mat(0xffffff, {
      map: textures.concrete,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    this.scene.add(
      new THREE.Mesh(
        quadGeometry(foundationQuads, this.lighting),
        foundationMaterial,
      ),
    );
    const supportFrames = Array.from(
      { length: Math.ceil(track.length / 38) },
      (_, i) => {
        const u = i / Math.ceil(track.length / 38);
        if (cfg.jump !== null && u > cfg.jump - 0.025 && u < cfg.jump + 0.04)
          return [];
        return (u > cfg.split[0] && u < cfg.split[1] ? [-1, 1] : [0])
          .filter(
            (branch) =>
              environment.bridgeAt(u, branch) &&
              environment.supportClearAt(u, branch),
          )
          .map((branch) => track.frame(u * track.length, branch));
      },
    ).flat();
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
    const beam = (
      mesh: THREE.InstancedMesh,
      index: number,
      start: THREE.Vector3,
      end: THREE.Vector3,
      width: number,
      depth: number,
    ) => {
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
    yield;
    this.startGantry = buildStartGantry(this.scene, track);
    this.finishDistrict = buildFinishDistrict(
      this.scene,
      track,
      textures,
      environment,
    );
    yield;
    buildSplitMarkers(this.scene, track, environment.terrain);
    buildTrackAdvertising(this.scene, track, environment);
    yield;
    buildVegetation(this.scene, track, environment);
    this.scenery = buildSceneryActivity(this.scene, track, environment);
    yield;
    this.weaponEffects = new WeaponEffects(this.scene);
    this.impactSparks = new ImpactSparks(this.scene);
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
  crossbar(
    f: TrackFrame,
    w: number,
    h: number,
    color: THREE.ColorRepresentation,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w * 2, 0.35, 1),
      basic(color),
    );
    mesh.position.copy(f.p).addScaledVector(f.up, h);
    mesh.rotation.y = Math.atan2(f.tangent.x, f.tangent.z);
    this.scene.add(mesh);
  }
  makeShip(color: THREE.ColorRepresentation, variant = 0) {
    return createCraft(this.scene, color, variant);
  }
  setupRacers(
    race: Race,
    specs: readonly { color: THREE.ColorRepresentation }[],
  ) {
    this.weaponEffects.reset();
    this.impactSparks.reset();
    for (const ship of this.ships) {
      this.scene.remove(ship, ship.userData.shadow, ship.userData.shield);
      releaseCraftShadow(this.scene, ship);
    }
    for (const particle of this.sparkData) particle.life = 0;
    this.cameraForward = null;
    this.cameraReady = false;
    this.ships = race.racers.map((r) =>
      this.makeShip(specs[r.craft].color, r.craft),
    );
  }
  burst(racer: Racer, kind: string, text: string | undefined) {
    if (kind === "scrape" && text === "IMPACT") {
      this.impactSparks.burst(
        racer,
        this.track.frame(racer.contactS, racer.branch),
      );
      return;
    }
    const f = this.track.frame(racer.contactS, racer.branch);
    // Player weapon hits share this pool with landings and rescue. Keep their
    // fragments near the hull instead of leaving a long trail under the flash.
    const weaponImpact = kind === "hit" && text === "IMPACT";
    const count = weaponImpact ? 6 : 10;
    for (let i = 0; i < count; i++) {
      const particle =
        this.sparkData[this.sparkCursor++ % this.sparkData.length];
      particle.life = weaponImpact
        ? 0.09 + Math.random() * 0.09
        : 0.25 + Math.random() * 0.4;
      particle.p.copy(racer.position);
      particle.v
        .copy(f.tangent)
        .multiplyScalar(
          weaponImpact ? -5 - Math.random() * 6 : -12 - Math.random() * 18,
        )
        .addScaledVector(f.right, (Math.random() - 0.5) * 20)
        .addScaledVector(f.up, Math.random() * 12);
    }
  }
  draw(race: Race, dt: number, demo = false, steeringKind = "analog") {
    this.time += dt;
    const far = this.track.config.name === "FAULTLINE" ? 4400 : 1700;
    if (this.camera.far !== far) {
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
    this.city.update(this.time);
    this.scenery.update(this.time);
    this.startGantry.update(race, demo);
    this.finishDistrict.update(this.time);
    const player = race.player,
      track = this.track;
    const approach = demo ? 0 : gridApproachBlend(race.countdown);
    let chase: { focus: THREE.Vector3; desired: THREE.Vector3 } | undefined;
    if (demo) {
      aimMenuFlyover(this.camera, track, player.contactS);
    } else {
      const f = track.frame(player.contactS, player.branch);
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
        .addScaledVector(UP, 3.8)
        .addScaledVector(this.cameraForward, -30 * approach)
        .addScaledVector(UP, 12 * approach);
      const ahead = focus.clone().addScaledVector(this.cameraForward, 28);
      clearChaseCamera(desired, track, player, this.environment.terrain, 3.8);
      if (!this.cameraReady) {
        this.camera.position.copy(desired);
        this.cameraReady = true;
      } else {
        this.camera.position.add(focus.clone().sub(this.cameraFocus));
        this.camera.position.lerp(desired, 1 - Math.exp(-dt * 9));
      }
      // Focus transport follows sudden drops immediately; constrain the final
      // smoothed position too, so it cannot be carried through the deck.
      clearChaseCamera(
        this.camera.position,
        track,
        player,
        this.environment.terrain,
        1.2,
      );
      this.cameraFocus = focus;
      this.camera.up.lerp(f.up, 1 - Math.exp(-dt * 7)).normalize();
      this.camera.lookAt(ahead);
      chase = { focus, desired };
    }
    const fov = 68 + player.speed * 0.085 + player.boost * 5;
    this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-dt * 3.5));
    this.camera.updateProjectionMatrix();
    for (const r of race.racers) {
      const ship = this.ships[r.id];
      if (!ship) continue;
      ship.visible =
        (demo || !r.eliminated) &&
        (demo || r !== player || this.view !== "first-person" || approach > 0);
      const rf = track.frame(r.contactS, r.branch);
      ship.position.copy(r.position);
      const pitch = r.pitch;
      const targetBank = steeringBank(r.yawRate);
      ship.userData.steeringBank = updateShipBank(
        ship.userData.steeringBank ?? targetBank,
        targetBank,
        dt,
        !demo && r === player && steeringKind === "digital",
      );
      ship.rotation.set(
        pitch,
        r.yaw,
        -rf.bank + ship.userData.steeringBank,
        "YXZ",
      );
      const shield = ship.userData.shield;
      shield.position.copy(ship.position);
      shield.quaternion.copy(ship.quaternion);
      shield.visible = (demo || !r.eliminated) && r.protect > 0;
      ship.userData.updateExhaust(r.speed, r.boost, this.time);
      const projection = ship.userData.shadowProjection;
      if (ship.visible) {
        projection.update(
          getRoadSurface(track),
          r.position,
          r.yaw,
          track.length,
        );
      } else {
        projection.mesh.visible = false;
      }
    }
    if (chase && this.view === "first-person") {
      const { focus, desired } = chase;
      const ship = this.ships[player.id];
      const up = UP.clone().applyQuaternion(ship.quaternion);
      const gaze = new THREE.Vector3(0, 0, 1).applyQuaternion(ship.quaternion);
      const cockpit = player.position
        .clone()
        .add(new THREE.Vector3(0, 1.15, 0.6).applyQuaternion(ship.quaternion));
      this.camera.position.copy(cockpit).lerp(desired, approach);
      this.camera.up.copy(up).lerp(UP, approach).normalize();
      this.camera.lookAt(cockpit.clone().add(gaze).lerp(focus, approach));
    }
    if (!demo) {
      for (const r of race.racers) {
        const ship = this.ships[r.id];
        if (ship?.visible) shakeHitShip(ship, r.weaponHit);
      }
      if (approach === 0) shakeHitCockpit(this.camera, player.weaponHit);
    }
    this.weaponEffects.update(race, dt, this.time);
    this.impactSparks.update(dt);
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
