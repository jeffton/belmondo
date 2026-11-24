import type { MenuPreview } from "./menu-preview.ts";
import type { Race, RaceInput } from "./race.ts";
import { mod, type Track } from "./track.ts";
import type { World } from "./world.ts";

type TelemetryState = {
  state: "menu" | "race" | "results";
  menuStage: "mode" | "class" | "track" | "craft";
  selectedTrack: number;
  loadedTrack: number;
  trackLoading: boolean;
  trackLoadTiming: {
    totalMs: number;
    buildMs: number;
    workerMs: number;
  } | null;
  selectedCraft: number;
  paused: boolean;
  race: Race;
  world: World;
  track: Track;
  lastControls: RaceInput;
  menuPreview: MenuPreview;
};

function readTelemetry({
  state,
  menuStage,
  selectedTrack,
  loadedTrack,
  trackLoading,
  trackLoadTiming,
  selectedCraft,
  paused,
  race,
  world,
  track,
  lastControls,
  menuPreview,
}: TelemetryState) {
  return {
    state,
    menuStage,
    selectedTrack,
    loadedTrack,
    trackLoading,
    trackLoadTiming,
    selectedCraft,
    paused,
    time: race.time,
    position: race.position,
    speed: race.player.speed,
    lateralPosition: race.player.x,
    yaw: race.player.yaw,
    pitch: race.player.pitch,
    view: world.view,
    controls: { ...lastControls },
    yawRate: race.player.yawRate,
    roll: world.ships[0].rotation.z,
    worldPosition: race.player.position.toArray(),
    velocity: race.player.velocity.toArray(),
    grounded: race.player.grounded,
    boost: race.player.boost,
    screenOffset:
      world.ships[0].position.clone().project(world.camera).x -
      track.frame(race.player.s, race.player.branch).p.project(world.camera).x,
    progress: mod(race.player.s, track.length) / track.length,
    raceProgress:
      mod(race.player.s - track.finishS, track.length) / track.length,
    finishS: track.finishS,
    lap: race.player.lap,
    laps: race.lapCount,
    speedClass: race.speedClass,
    classId: race.classSpec.id,
    layoutId: track.config.layoutId,
    trackLength: track.length,
    physicalLength: track.physicalLength,
    menuRacers:
      state === "menu"
        ? race.racers.map((r) => ({
            id: r.id,
            s: r.s,
            branch: r.branch,
            x: r.x,
            position: r.position.toArray(),
          }))
        : undefined,
    countdown: race.countdown,
    launch: { ...race.launch },
    lapTimes: [...race.laps],
    currentLapTime: race.time - race.lapStart,
    branch: race.player.branch,
    height: race.player.h,
    shield: race.player.shield,
    weapon: race.player.weapon,
    menuModelRotation:
      state === "menu"
        ? (menuStage === "class"
            ? menuPreview.classModel
            : menuStage === "craft"
              ? menuPreview.craft
              : menuPreview.coursePivot)!.rotation.y
        : null,
    resources: { ...world.renderer.info.memory },
    previewResources: menuPreview.resources,
    drawCalls: world.renderer.info.render.calls,
    triangles: world.renderer.info.render.triangles,
    render: world.quality,
  };
}

export function installTelemetry(getState: () => TelemetryState) {
  window.nullVector = {
    get telemetry() {
      return readTelemetry(getState());
    },
  };
}

declare global {
  interface Window {
    nullVector: { readonly telemetry: ReturnType<typeof readTelemetry> };
  }
}
