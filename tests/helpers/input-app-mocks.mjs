// Real application DOM, input handlers and Race; only renderer/audio are replaced.
// No WebGL context or audio assets are allocated by these input-only checks.
export async function mockInputApp(page) {
  await page.route("**/src/menu-preview.js**", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `export class MenuPreview {
        constructor() {
          this.classModel = { rotation: { y: 0 } };
          this.craft = { rotation: { y: 0 } };
          this.coursePivot = { rotation: { y: 0 } };
        }
        setStage() {} setClass() {} setTrack() {} setCraft() {} draw() {} dispose() {}
      }`,
    }),
  );
  await page.route("**/src/world.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `import { PerspectiveCamera, Vector3 } from '/node_modules/.vite/deps/three.js';
        export class World {
          environment = { terrain: undefined };
          finishDistrict = { foundations: [] };
          renderer = { info: { render: { calls: 0, triangles: 0 } } };
          camera = new PerspectiveCamera();
          ships = [];
          view = 'chase';
          build() {} resize() {} burst() {}
          setView(view) { this.view = view; }
          setupRacers(race) {
            this.ships = race.racers.map(() => ({
              position: new Vector3(), rotation: { z: 0 }
            }));
          }
          async prepare(track, _prepared, isCurrent, setup) {
            const candidate = new World();
            candidate.build(track);
            setup(candidate);
            return isCurrent() ? candidate : null;
          }
          adopt(candidate) { Object.assign(this, candidate); }
          draw(race) {
            race.racers.forEach((racer, i) => this.ships[i].position.copy(racer.position));
          }
        }`,
    }),
  );
  await page.route("**/src/course-preparation.js**", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `export class CoursePreparation {
        async load() { return { workerMs: 0 }; }
        cancel() {}
      }`,
    }),
  );
  await page.route("**/src/audio.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `export class AudioEngine {
        async start() {} setMuted() {} setPaused() {} setVolume() {}
        stopSamples() {} stopCrowd() {} stopEngine() {} effect() {}
        raceEvent() {} update() {} updateCrowd() {}
      }`,
    }),
  );
  await page.route("**/src/music.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `export class MusicPlayer {
        audio = { paused: true };
        loadTracks() {} setTunnel() {} setMenu() {} next() {}
        async play() { this.audio.paused = false; }
        pause() { this.audio.paused = true; }
      }`,
    }),
  );
}
