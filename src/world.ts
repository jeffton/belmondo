import * as THREE from "three";
import type { Track, TrackFrame } from "./track.ts";
import type { Race, Racer } from "./race.ts";
import type { Craft } from "./craft.ts";
import type { EnvironmentSurface, CircuitTextures } from "./environment.ts";
import type { PreparedCourse } from "./course-preparation.ts";

interface SceneResourceObject extends THREE.Object3D {
  isInstancedMesh?: boolean;
  geometry?: THREE.BufferGeometry;
  material?:
    | (THREE.Material & { map?: THREE.Texture })
    | (THREE.Material & { map?: THREE.Texture })[];
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

import { isCoastLayout } from "./track.ts";
import { steeringBank, updateShipBank } from "./ship-bank.ts";
import { clearChaseCamera } from "./chase-camera.ts";
import { aimMenuFlyover } from "./menu-flyover.ts";
import { createRailFaceTexture } from "./rail-face.ts";
import { buildTrackPads } from "./track-pads.ts";
import { createOceanGeometry } from "./water-surfaces.ts";
import { getRoadSurface } from "./road-surface.ts";
import { roadStations } from "./road-cross-section.ts";
import { buildRoadMesh } from "./world-road.ts";
import {
  buildRoadFoundations,
  buildRoadSupports,
  supportGeometry,
} from "./world-road-support.ts";
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
import { buildTrackAdvertising } from "./advertising.ts";
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
        if (g !== supportGeometry) g.dispose();
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
    const stations = roadStations(track);
    sliceStart = yield* buildRoadMesh(
      this.scene,
      track,
      stations,
      textures,
      this.lighting,
      sliceStart,
    );
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
    yield* buildRoadFoundations(
      this.scene,
      track,
      stations,
      textures,
      this.lighting,
      environment,
      sliceStart,
    );
    buildRoadSupports(this.scene, track, textures, environment);
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
    const chase = demo
      ? undefined
      : this.updateChaseCamera(player, dt, approach);
    if (demo) aimMenuFlyover(this.camera, track, player.contactS);
    const fov = 68 + player.speed * 0.085 + player.boost * 5;
    this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-dt * 3.5));
    this.camera.updateProjectionMatrix();
    this.updateShips(race, dt, demo, approach, steeringKind);
    if (chase && this.view === "first-person")
      this.updateCockpitCamera(player, approach, chase);
    if (!demo) {
      for (const r of race.racers) {
        const ship = this.ships[r.id];
        if (ship?.visible) shakeHitShip(ship, r.weaponHit);
      }
      if (approach === 0) shakeHitCockpit(this.camera, player.weaponHit);
    }
    this.weaponEffects.update(race, dt, this.time);
    this.impactSparks.update(dt);
    this.updateSparks(dt);
    this.lighting.update(this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  private updateChaseCamera(player: Racer, dt: number, approach: number) {
    const track = this.track;
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
    return { focus, desired };
  }

  private updateShips(
    race: Race,
    dt: number,
    demo: boolean,
    approach: number,
    steeringKind: string,
  ) {
    const { player } = race;
    const track = this.track;
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
  }

  private updateCockpitCamera(
    player: Racer,
    approach: number,
    chase: ReturnType<World["updateChaseCamera"]>,
  ) {
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

  private updateSparks(dt: number) {
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
  }
}
