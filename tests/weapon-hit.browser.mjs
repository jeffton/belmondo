import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

// Actual Race.fire/update and World.draw; no hooks on the application session.
const url = process.env.SOURCE_URL || "http://127.0.0.1:5234";
const output = "test-artifacts/weapon-hit";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const report = { cases: [], errors: [] };
try {
  for (const [device, viewport] of [
    ["desktop", { width: 1000, height: 625 }],
    ["mobile", { width: 844, height: 390 }],
  ]) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (error) => report.errors.push(error.message));
    await page.route("**/__hit_fixture__.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><style>body{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>",
      }),
    );
    await page.goto(`${url}/__hit_fixture__.html`);
    await page.evaluate(async () => {
      const source = await (await fetch("/src/world.ts")).text();
      const threePath = source.match(
        /from\s+["']([^"']*\/three\.js[^"']*)["']/,
      )[1];
      const [{ World }, { Race, CRAFT }, { makeTrack, TRACK_INDEX }, THREE] =
        await Promise.all([
          import("/src/world.ts"),
          import("/src/race.ts"),
          import("/src/track.ts"),
          import(threePath),
        ]);
      const world = new World(document.querySelector("canvas"));
      world.quality = "retro";
      world.resize();
      const track = makeTrack(TRACK_INDEX.COAST);
      const loaded = new Promise((resolve, reject) => {
        THREE.DefaultLoadingManager.onLoad = resolve;
        THREE.DefaultLoadingManager.onError = (url) => reject(new Error(url));
      });
      world.build(track);
      let race = new Race(track, 0, "race");
      world.setupRacers(race, CRAFT);
      await loaded;
      const input = { throttle: true, steer: 0, air: 0 };
      window.hitQA = {
        setup(weapon, view, miss = false) {
          race = new Race(track, 0, "race");
          race.countdown = 0;
          race.pickups = [];
          world.setupRacers(race, CRAFT);
          world.view = view === "first-person" ? "first-person" : "chase";
          const target = race.racers[view === "npc" ? 1 : 0];
          const shooter =
            race.racers[view === "npc" && weapon !== "MINE" ? 0 : 2];
          for (const r of race.racers) {
            const offset =
              r === target
                ? view === "npc"
                  ? 18
                  : 0
                : r === shooter
                  ? weapon === "MINE"
                    ? view === "npc"
                      ? 25
                      : 7
                    : view === "npc"
                      ? 0
                      : -22
                  : r.id === 0
                    ? 0
                    : 60 + r.id * 20;
            const s = track.length * 0.02 + offset;
            const f = track.frame(s);
            r.s = r.contactS = s;
            r.position.copy(f.p);
            r.position.y += 2.2;
            r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
            r.pitch = -Math.asin(f.tangent.y);
            r.velocity.copy(f.tangent).multiplyScalar(75);
            r.speed = 75;
            r.x = 0;
            r.aiFire = Infinity;
            r.gate = Math.floor((s / track.length) * 32) + 1;
            r.checkpoint = { s, branch: 0, gate: r.gate };
          }
          if (miss) {
            shooter.position.y += 50;
            shooter.h = 50;
          }
          shooter.weapon = weapon;
          world.cameraReady = false;
          world.cameraForward = null;
          world.draw(race, 1 / 60);
          const before = race.racers.map((r) => r.shield);
          race.fire(shooter);
          return {
            before,
            target: target.id,
            shooter: shooter.id,
            resolution: [
              world.renderer.domElement.width,
              world.renderer.domElement.height,
            ],
          };
        },
        step(capture = false) {
          const before = JSON.stringify(race.racers);
          world.draw(race, 1 / 60);
          if (JSON.stringify(race.racers) !== before)
            throw new Error("Rendering mutated race");
          const states = race.racers.map((r) => {
            const ship = world.ships[r.id];
            const base = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(
                r.pitch,
                r.yaw,
                -track.frame(r.contactS, r.branch).bank +
                  ship.userData.steeringBank,
                "YXZ",
              ),
            );
            return {
              id: r.id,
              shield: r.shield,
              hit: r.weaponHit,
              angle: ship.quaternion.angleTo(base),
              displacement: ship.position.distanceTo(r.position),
            };
          });
          const image = capture
            ? world.renderer.domElement.toDataURL("image/png").split(",")[1]
            : null;
          const vfx = {
            shots: world.weaponEffects.active.size,
            blasts: world.weaponEffects.blasts.length,
            pulseHits: world.weaponEffects.pools
              .get("PULSE_HIT")
              .map((slot) => slot.root.visible),
          };
          let cameraAngle = 0;
          if (race.player.weaponHit > 0) {
            const baseCamera = world.camera.quaternion.clone();
            const hit = race.player.weaponHit;
            race.player.weaponHit = 0;
            world.draw(race, 0);
            cameraAngle = baseCamera.angleTo(world.camera.quaternion);
            race.player.weaponHit = hit;
          }
          race.update(1 / 120, input);
          race.update(1 / 120, input);
          return { states, cameraAngle, image, vfx };
        },
      };
    });
    for (const weapon of ["PULSE", "MISSILE", "MINE"]) {
      for (const view of ["npc", "player", "first-person"]) {
        const setup = await page.evaluate(
          ({ weapon, view }) => window.hitQA.setup(weapon, view),
          { weapon, view },
        );
        const frames = [];
        for (let frame = 0; frame <= 54; frame++) {
          // Continuous sequences for NPC and cockpit motion; keyframes elsewhere.
          const capture =
            [0, 2, 5, 9, 15, 24, 42].includes(frame) ||
            (weapon === "MISSILE" && view === "npc") ||
            (weapon === "PULSE" && view === "first-person");
          const result = await page.evaluate(
            (capture) => window.hitQA.step(capture),
            capture,
          );
          if (capture)
            await writeFile(
              `${output}/${device}-${weapon}-${view}-${String(frame).padStart(2, "0")}.png`,
              Buffer.from(result.image, "base64"),
            );
          delete result.image;
          frames.push(result);
        }
        const targetFrames = frames.map((f) => f.states[setup.target]);
        const strikeFrame = targetFrames.findIndex(
          (f) => f.shield < 100 && f.hit > 0,
        );
        expect(strikeFrame).toBeGreaterThanOrEqual(0);
        // The visual must appear on the real damage frame, not just a launch
        // or an expiry. Pulse stays tied to the hull; blasts use the shot slot.
        const strikeVfx = frames[strikeFrame].vfx;
        if (weapon === "PULSE") {
          expect(strikeVfx.pulseHits.filter(Boolean)).toHaveLength(1);
          expect(strikeVfx.pulseHits[setup.target]).toBe(true);
        } else {
          expect(strikeVfx.blasts).toBeGreaterThan(0);
          expect(frames.at(-1).vfx.blasts).toBe(0);
        }
        if (view !== "first-person")
          expect(targetFrames.some((f) => f.angle > 0.15)).toBe(true);
        if (view !== "npc")
          expect(frames.some((f) => f.cameraAngle > 0.02)).toBe(true);
        expect(
          frames.every((f) =>
            f.states
              .filter((r) => r.id !== setup.target)
              .every((r) => r.hit === 0 && r.angle < 1e-6),
          ),
        ).toBe(true);
        expect(targetFrames.at(-1).hit).toBe(0);
        expect(targetFrames.at(-1).angle).toBeLessThan(1e-6);
        report.cases.push({
          device,
          weapon,
          view,
          setup,
          strikeFrame,
          strikeVfx,
          maxRoll: Math.max(...targetFrames.map((f) => f.angle)),
          maxCamera: Math.max(...frames.map((f) => f.cameraAngle)),
          final: targetFrames.at(-1),
        });
      }
      await page.evaluate(
        (weapon) => window.hitQA.setup(weapon, "first-person", true),
        weapon,
      );
      for (let i = 0; i < 5; i++) {
        const frame = await page.evaluate(() => window.hitQA.step());
        expect(frame.states.every((r) => r.hit === 0 && r.angle < 1e-6)).toBe(
          true,
        );
        expect(frame.cameraAngle).toBeLessThan(1e-6);
        expect(frame.vfx.pulseHits.some(Boolean)).toBe(false);
        expect(frame.vfx.blasts).toBe(0);
      }
    }
    await page.close();
  }
  expect(report.errors).toEqual([]);
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(
    `PASS ${report.cases.length} LOWRES moving-race hit cases; player/NPC/first-person; three weapons; desktop/mobile; misses silent`,
  );
} finally {
  await browser.close();
}
