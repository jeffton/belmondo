import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

// These are isolated render fixtures using real Race.fire/World/HUD modules.
// They do not drive or mutate the application; gameplay.browser/input-chords
// separately exercise the unchanged application through browser input only.
const url = process.env.SOURCE_URL || "http://127.0.0.1:5178";
const padsOnly = process.env.WEAPONS_SCOPE === "pads";
const signsOnly = process.env.WEAPONS_SCOPE === "signs";
await mkdir("test-artifacts", { recursive: true });
const report = {
  url,
  method: "isolated real-module fixtures",
  cases: [],
  errors: [],
};
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  for (const [device, viewport] of [
    ["desktop", { width: 1000, height: 625 }],
    ["mobile", { width: 844, height: 390 }],
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    await page.route("**/__weapons_fixture__.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><link rel="stylesheet" href="/src/style.css"><canvas id="game"></canvas><div id="roster" hidden></div>',
      }),
    );
    await page.goto(`${url}/__weapons_fixture__.html`);
    await page.evaluate(async (device) => {
      const source = await (await fetch("/src/world.js")).text();
      const threeModule = source.match(
        /from\s+["']([^"']*\/three\.js[^"']*)["']/,
      )[1];
      const [{ World }, { Race, CRAFT, WEAPONS }, { makeTrack }, THREE, ui] =
        await Promise.all([
          import("/src/world.js"),
          import("/src/race.js"),
          import("/src/track.js"),
          import(threeModule),
          import("/src/weapon-ui.js"),
        ]);
      const html = new DOMParser().parseFromString(
        await (await fetch("/index.html")).text(),
        "text/html",
      );
      const hud = html.querySelector("#hud");
      document.body.append(hud);
      hud.hidden = false;
      document.body.classList.toggle("touch", device === "mobile");
      const updateHUD = ui.createWeaponHUD(
        document.querySelector("#weapon"),
        document.querySelector("#touch-fire"),
        document.querySelector("#roster"),
      );
      const world = new World(document.querySelector("canvas"));
      world.quality = "retro";
      world.resize();
      let track = makeTrack(TRACK_INDEX.COAST);
      const loaded = new Promise((resolve, reject) => {
        THREE.DefaultLoadingManager.onLoad = resolve;
        THREE.DefaultLoadingManager.onError = (asset) =>
          reject(new Error(asset));
      });
      world.build(track);
      let race = new Race(track, 0, "race");
      world.setupRacers(race, CRAFT);
      await loaded;
      const input = {
        throttle: false,
        steer: 0,
        air: 0,
        airLeft: 0,
        airRight: 0,
        pitch: 0,
        brake: false,
      };
      function place(u = 0.04, yawOffset = 0, lateral = 0, branch = 0) {
        world.weaponEffects.reset();
        race.shots = [];
        race.mines = [];
        race.countdown = 0;
        race.finished = false;
        for (const r of race.racers) {
          const s = u * track.length - r.id * 350;
          const f = track.frame(s, r.id === 0 ? branch : 0);
          r.s = r.contactS = s;
          r.x = r.id === 0 ? lateral : 0;
          r.branch = r.id === 0 ? branch : 0;
          r.collectedPickups.clear();
          r.position.copy(f.p).addScaledVector(f.right, r.x);
          r.position.y += 2.2;
          r.gate = Math.floor((s / track.length) * 32) + 1;
          r.checkpoint = { s, branch: r.branch, gate: r.gate };
          r.offroad = r.h = r.vy = r.stun = 0;
          r.shield = 100;
          r.yaw =
            Math.atan2(f.tangent.x, f.tangent.z) + (r.id === 0 ? yawOffset : 0);
          r.velocity.set(Math.sin(r.yaw) * 80, 0, Math.cos(r.yaw) * 80);
          r.speed = 80;
          r.pitch = r.pitchTrim = r.yawRate = 0;
          r.grounded = true;
          r.flight = false;
          r.protect = r.boost = r.surge = 0;
          r.weapon = null;
          r.aiFire = Infinity;
        }
        world.cameraReady = false;
        world.cameraForward = null;
      }
      function draw() {
        world.draw(race, 0);
      }
      function counts() {
        return {
          active: world.weaponEffects.active.size,
          blasts: world.weaponEffects.blasts.length,
          slots: [...world.weaponEffects.pools.values()].reduce(
            (n, p) => n + p.length,
            0,
          ),
          children: world.scene.children.length,
          geometries: world.renderer.info.memory.geometries,
          calls: world.renderer.info.render.calls,
          triangles: world.renderer.info.render.triangles,
        };
      }
      window.fixture = {
        world,
        race,
        track,
        THREE,
        WEAPONS,
        input,
        place,
        setCourse(course) {
          track = makeTrack(course);
          world.build(track);
          race = new Race(track, 0, "race");
          world.setupRacers(race, CRAFT);
          Object.assign(window.fixture, {
            track,
            race,
            pickups: window.fixture.getTrackPickups(track),
          });
          document.querySelector("#hud-track").textContent = track.config.name;
        },
        getTrackPickups: (await import("/src/pickups.js")).getTrackPickups,
        draw,
        counts,
        updateHUD,
        makeTrack,
        pickups: (await import("/src/pickups.js")).getTrackPickups(track),
      };
      place();
      draw();
    }, device);
    if (signsOnly) {
      for (const u of [0.185, 0.905]) {
        await page.evaluate((u) => {
          const f = window.fixture;
          f.place(u);
          f.updateHUD(null);
          f.draw();
        }, u);
        await page.screenshot({
          path: `test-artifacts/pierre-${device}-${u}.png`,
        });
      }
      for (const branch of [-1, 1]) {
        await page.evaluate((branch) => {
          const f = window.fixture;
          f.place(0.3, 0, 0, branch);
          f.updateHUD(null);
          f.draw();
        }, branch);
        await page.screenshot({
          path: `test-artifacts/barrier-split-${device}-${branch}.png`,
        });
      }
      await context.close();
      continue;
    }
    for (const weapon of padsOnly
      ? []
      : ["MISSILE", "PULSE", "MINE", "SHIELD", "TURBO"]) {
      const sample = await page.evaluate((weapon) => {
        const f = window.fixture;
        f.place(0.04, 0.22);
        f.updateHUD(weapon);
        const p = f.race.player;
        p.weapon = weapon;
        f.race.fire();
        const consumed = p.weapon === null;
        if (["MISSILE", "PULSE"].includes(weapon)) {
          const launched = f.race.shots[0];
          const direction =
            weapon === "MISSILE"
              ? launched.velocity.clone().normalize()
              : launched.direction;
          const expected = new f.THREE.Vector3(
            Math.sin(p.yaw),
            0,
            Math.cos(p.yaw),
          );
          if (direction.dot(expected) < 0.999999)
            throw new Error("Initial weapon direction differs from body yaw");
        }
        if (weapon === "MINE") {
          const behind = f.race.mines[0].position
            .clone()
            .sub(p.position)
            .dot(new f.THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw)));
          if (behind >= -4.9) throw new Error("Mine not deployed behind ship");
        }
        if (["TURBO", "MISSILE"].includes(weapon))
          for (let i = 0; i < (weapon === "TURBO" ? 24 : 8); i++)
            f.race.update(1 / 120, f.input);
        f.draw();
        const effect = f.race.shots[0] || f.race.mines[0];
        const slot = effect
          ? f.world.weaponEffects.active.get(effect)
          : weapon === "TURBO"
            ? f.world.weaponEffects.pools.get("TURBO")[0]
            : null;
        let alignment = null;
        if (["MISSILE", "PULSE"].includes(weapon)) {
          const forward = new f.THREE.Vector3(0, 0, 1).applyQuaternion(
            slot.root.quaternion,
          );
          const direction =
            weapon === "MISSILE"
              ? effect.velocity.clone().normalize()
              : effect.direction;
          alignment = forward.dot(direction);
          const launch = new f.THREE.Vector3(
            Math.sin(p.yaw),
            0,
            Math.cos(p.yaw),
          );
          // MISSILE advanced eight ticks; allow its small homing correction.
          if (direction.dot(launch) < 0.95)
            throw new Error("Weapon launched against body yaw");
        }
        const button = document.querySelector("#weapon");
        const touch = document.querySelector("#touch-fire");
        return {
          weapon,
          consumed,
          alignment,
          visible:
            weapon === "SHIELD"
              ? f.world.ships[0].userData.shield.visible
              : slot.root.visible,
          boost: p.boost,
          surge: p.surge,
          protect: p.protect,
          geometry: slot?.root.children.map(
            (c) => c.geometry.attributes.position.count,
          ),
          stats: f.counts(),
          desktop: {
            text: button.textContent,
            glyph: button.querySelector("svg").innerHTML,
            color: button.style.getPropertyValue("--weapon-color"),
          },
          mobile: {
            text: touch.textContent,
            glyph: touch.querySelector("svg")?.innerHTML || null,
            color: touch.style.getPropertyValue("--weapon-color"),
          },
        };
      }, weapon);
      expect(sample.consumed).toBe(true);
      expect(sample.visible).toBe(true);
      if (sample.alignment !== null)
        expect(sample.alignment).toBeGreaterThan(0.9999);
      expect(sample.desktop.text).toContain(weapon);
      expect(sample.mobile.text.trim()).toBe("");
      expect(sample.mobile.glyph).not.toBeNull();
      await page.screenshot({
        path: `test-artifacts/weapons-${device}-${weapon}.png`,
      });
      await page
        .locator("#weapon")
        .evaluate((el) => (el.style.filter = "grayscale(1)"));
      await page.locator("#weapon").screenshot({
        path: `test-artifacts/weapons-hud-${device}-${weapon}-gray.png`,
      });
      await page.locator("#weapon").evaluate((el) => (el.style.filter = ""));
      const lifecycle = await page.evaluate(() => {
        const f = window.fixture;
        for (let i = 0; i < 1800; i++) f.race.update(1 / 120, f.input);
        f.draw();
        const blastObserved = f.world.weaponEffects.blasts.length;
        f.world.draw(f.race, 0.6);
        const expired = f.counts();
        const shieldHidden = !f.world.ships[0].userData.shield.visible;
        const wakesHidden = f.world.weaponEffects.pools
          .get("TURBO")
          .every((s) => !s.root.visible);
        f.updateHUD(f.race.player.weapon);
        const emptyButton = document.querySelector("#weapon");
        const emptyHUD =
          emptyButton.parentElement.hidden && emptyButton.innerHTML === "";
        const poolBefore = f.counts().slots;
        for (let cycle = 0; cycle < 3; cycle++) {
          f.place();
          for (const weapon of f.WEAPONS) {
            f.race.player.weapon = weapon;
            f.race.fire();
          }
          f.draw();
          f.world.weaponEffects.reset();
        }
        const poolAfter = f.counts().slots;
        return {
          expired,
          blastObserved,
          shieldHidden,
          wakesHidden,
          emptyHUD,
          poolBefore,
          poolAfter,
          resetHidden: [...f.world.weaponEffects.pools.values()]
            .flat()
            .every((s) => !s.busy && !s.root.visible),
          final: f.counts(),
        };
      });
      expect(lifecycle.expired.active).toBe(0);
      expect(lifecycle.emptyHUD).toBe(true);
      expect(lifecycle.shieldHidden).toBe(true);
      expect(lifecycle.wakesHidden).toBe(true);
      if (["MISSILE", "MINE"].includes(weapon))
        expect(lifecycle.blastObserved).toBeGreaterThan(0);
      expect(lifecycle.expired.blasts).toBe(0);
      expect(lifecycle.resetHidden).toBe(true);
      // Pools may grow on first concurrent use, but subsequent equal workloads must reuse slots.
      const stable = await page.evaluate(() => {
        const f = window.fixture,
          before = f.counts();
        for (let cycle = 0; cycle < 3; cycle++) {
          f.place();
          for (const weapon of f.WEAPONS) {
            f.race.player.weapon = weapon;
            f.race.fire();
          }
          f.draw();
          f.world.weaponEffects.reset();
        }
        return { before, after: f.counts() };
      });
      expect(stable.after.slots).toBe(stable.before.slots);
      expect(stable.after.children).toBe(stable.before.children);
      expect(stable.after.geometries).toBe(stable.before.geometries);
      report.cases.push({ device, ...sample, lifecycle, stable });
    }
    const allPadCases = [];
    for (const course of [0, 1, 2]) {
      await page.evaluate((course) => window.fixture.setCourse(course), course);
      const padCases = await page.evaluate(() => {
        const f = window.fixture;
        const cases = [];
        for (const pad of f.pickups) {
          const start = pad.u - (pad.length / 2 + 2) / f.track.length;
          f.place(start, 0, pad.lateral > 0 ? -8 : 8, pad.branch);
          for (let i = 0; i < 24; i++)
            f.race.update(1 / 120, { ...f.input, throttle: true });
          const missed = ![...f.race.player.collectedPickups].some((key) =>
            key.endsWith(pad.id),
          );
          f.place(
            pad.u - (pad.length / 2 + 2) / f.track.length,
            0,
            pad.lateral,
            pad.branch,
          );
          const p = f.race.player;
          const oldS = p.s;
          for (let i = 0; i < 24; i++)
            f.race.update(1 / 120, { ...f.input, throttle: true });
          cases.push({
            id: pad.id,
            u: pad.u,
            branch: pad.branch,
            type: pad.type,
            lateral: pad.lateral,
            oldS,
            newS: p.s,
            collected: [...p.collectedPickups],
            collectedExpected: [...p.collectedPickups].some((key) =>
              key.endsWith(pad.id),
            ),
            missed,
            surge: p.surge,
            weapon: p.weapon,
          });
        }
        return cases;
      });
      expect(padCases).toHaveLength(8);
      expect(
        padCases
          .filter((pad) => pad.branch !== 0)
          .map((pad) => pad.branch)
          .sort(),
      ).toEqual([-1, 1]);
      expect(new Set(padCases.map((pad) => pad.type))).toEqual(
        new Set(["boost", "weapon"]),
      );
      for (const pad of padCases) {
        expect(pad.missed, `Off-pad crossing should miss ${pad.id}`).toBe(true);
        expect(
          pad.collectedExpected,
          `Centered crossing should collect ${pad.id}`,
        ).toBe(true);
        if (pad.type === "boost")
          expect(
            pad.surge,
            `boost u=${pad.u} branch=${pad.branch}`,
          ).toBeGreaterThan(0);
        else
          expect(
            pad.weapon,
            `weapon u=${pad.u} branch=${pad.branch}`,
          ).toBeTruthy();
      }
      allPadCases.push({ course, padCases });
      for (const view of ["chase", "first-person"]) {
        const sceneView = await page.evaluate(
          ({ course, view }) => {
            const f = window.fixture;
            f.place([0.18, 0.15, 0.045][course]);
            f.world.view = view;
            f.updateHUD("MISSILE");
            f.draw();
            return {
              view,
              course,
              craftVisible: f.world.ships[0].visible,
              sceneObjects: f.world.scene.children.length,
              celestial: f.world.scene.children
                .filter((o) => ["low-sun", "moon"].includes(o.name))
                .map((o) => o.name),
            };
          },
          { course, view },
        );
        expect(sceneView.craftVisible).toBe(view === "chase");
        report.cases.push({ device, sceneView });
        await page.screenshot({
          path: `test-artifacts/art-${device}-course${course}-${view}.png`,
        });
      }
      await page.evaluate(() => {
        window.fixture.world.view = "chase";
      });
      for (const type of ["boost", "weapon"]) {
        for (const distance of [90, 18]) {
          const padView = await page.evaluate(
            ({ type, distance }) => {
              const f = window.fixture;
              const pad = f.pickups.find(
                (pad) => pad.type === type && pad.branch === 0,
              );
              f.place(
                pad.u - distance / f.track.length,
                0,
                pad.lateral,
                pad.branch,
              );
              f.updateHUD(null);
              f.draw();
              const screen = pad.center.clone().project(f.world.camera);
              return {
                id: pad.id,
                type,
                distance,
                lateral: pad.lateral,
                screen: screen.toArray(),
              };
            },
            { type, distance },
          );
          expect(padView.screen[0]).toBeGreaterThan(-1);
          expect(padView.screen[0]).toBeLessThan(1);
          expect(padView.screen[1]).toBeGreaterThan(-1);
          expect(padView.screen[1]).toBeLessThan(1);
          expect(padView.screen[2]).toBeGreaterThan(-1);
          expect(padView.screen[2]).toBeLessThan(1);
          report.cases.push({ device, course, padView });
          await page.screenshot({
            path: `test-artifacts/weapons-pad-${device}-course${course}-${type}-${distance}m.png`,
          });
        }
      }
    }
    await page.evaluate(() => window.fixture.setCourse(0));
    const perf = padsOnly
      ? null
      : await page.evaluate(() => {
          const f = window.fixture;
          f.place();
          const bench = () => {
            const samples = [];
            for (let i = 0; i < 12; i++) {
              const start = performance.now();
              f.world.draw(f.race, 1 / 120);
              f.world.renderer.getContext().finish();
              samples.push(performance.now() - start);
            }
            return {
              meanMs: samples.reduce((a, b) => a + b, 0) / samples.length,
              samples,
              counts: f.counts(),
            };
          };
          const baseline = bench();
          for (const weapon of f.WEAPONS) {
            f.race.player.weapon = weapon;
            f.race.fire();
          }
          f.race.player.boost = 1;
          return {
            renderer: f.world.renderer
              .getContext()
              .getParameter(f.world.renderer.getContext().RENDERER),
            baseline,
            armed: bench(),
          };
        });
    const coursePads = await page.evaluate(async () => {
      const f = window.fixture;
      const { buildTrackPads } = await import("/src/track-pads.js");
      return [0, 1, 2].map((course) => {
        const scene = new f.THREE.Scene();
        buildTrackPads(scene, f.makeTrack(course), f.world.textures);
        const meshes = scene.children;
        const result = {
          course,
          meshCount: meshes.length,
          names: [...new Set(meshes.map((m) => m.name))],
          opaque: meshes.every(
            (m) => !m.material.transparent && m.material.opacity === 1,
          ),
          finite: meshes.every((m) =>
            [
              ...m.geometry.attributes.position.array,
              ...m.geometry.attributes.uv.array,
            ].every(Number.isFinite),
          ),
        };
        for (const mesh of meshes) mesh.geometry.dispose();
        for (const material of new Set(meshes.map((m) => m.material)))
          material.dispose();
        return result;
      });
    });
    for (const course of coursePads) {
      expect(course.opaque).toBe(true);
      expect(course.finite).toBe(true);
      expect(course.names.sort()).toEqual([
        "track-pads-boost",
        "track-pads-trim",
        "track-pads-weapon",
      ]);
    }
    const naturalReuse = padsOnly
      ? null
      : await page.evaluate(() => {
          const f = window.fixture;
          f.place();
          const counts = [];
          for (let cycle = 0; cycle < 3; cycle++) {
            for (const weapon of f.WEAPONS) {
              f.race.player.weapon = weapon;
              f.race.fire();
            }
            f.draw();
            for (let i = 0; i < 1800; i++) f.race.update(1 / 120, f.input);
            f.draw();
            f.world.draw(f.race, 0.6);
            counts.push(f.counts());
          }
          return counts;
        });
    if (naturalReuse) {
      expect(naturalReuse[2].slots).toBe(naturalReuse[1].slots);
      expect(naturalReuse[2].children).toBe(naturalReuse[1].children);
      expect(naturalReuse[2].active).toBe(0);
      expect(naturalReuse[2].blasts).toBe(0);
    }
    report.cases.push({ device, allPadCases, perf, coursePads, naturalReuse });
    await context.close();
  }
  const desktop = report.cases.filter(
    (c) => c.device === "desktop" && c.weapon,
  );
  if (!padsOnly && !signsOnly) {
    expect(new Set(desktop.map((c) => c.desktop.glyph)).size).toBe(5);
    expect(new Set(desktop.map((c) => c.desktop.color)).size).toBe(5);
  }
  expect(report.errors).toEqual([]);
  console.log(
    signsOnly
      ? "Pierre advertising approach and both split-route source fixture screenshots captured on desktop/mobile."
      : padsOnly
        ? "Pad fixtures: authored lateral placements on both branches, physical Race crossings and all-course opaque geometry passed on desktop/mobile viewports."
        : "Weapon fixtures: all five Race.fire effects/HUD, grayscale icons, orientation, expiration/pool reuse and physical pad crossings passed on desktop/mobile viewports.",
  );
} finally {
  await writeFile(
    signsOnly
      ? "test-artifacts/signs-report.json"
      : "test-artifacts/weapons-report.json",
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
