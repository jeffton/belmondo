import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

// These are isolated render fixtures using real Race.fire/World/HUD modules.
// They do not drive or mutate the application; gameplay.browser/input-chords
// separately exercise the unchanged application through browser input only.
const url = process.env.SOURCE_URL || "http://127.0.0.1:5178";
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
        body: '<!doctype html><link rel="stylesheet" href="/src/style.css"><style>body{margin:0;overflow:hidden}canvas{display:block;width:100vw;height:100vh}.fixture-inventory{position:absolute;top:20px;left:20px;z-index:10}.fixture-inventory .weapon{display:block!important}#roster{display:none}.fixture-inventory .touch-actions{position:static}</style><canvas></canvas><aside class="fixture-inventory"></aside><div id="roster"></div>',
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
      const desktop = html.querySelector(".weapon");
      const mobile = html.querySelector(".touch-actions");
      const host = document.querySelector("aside");
      host.append(desktop, mobile);
      const updateHUD = ui.createWeaponHUD(
        desktop.querySelector("button"),
        mobile.querySelector("#touch-fire"),
        document.querySelector("#roster"),
      );
      (device === "desktop" ? mobile : desktop).style.setProperty(
        "display",
        "none",
        "important",
      );
      const world = new World(document.querySelector("canvas"));
      world.quality = "retro";
      world.resize();
      const track = makeTrack(0);
      const loaded = new Promise((resolve, reject) => {
        THREE.DefaultLoadingManager.onLoad = resolve;
        THREE.DefaultLoadingManager.onError = (asset) =>
          reject(new Error(asset));
      });
      world.build(track);
      const race = new Race(track, 0, "race");
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
      function place(u = 0.04, yawOffset = 0) {
        world.weaponEffects.reset();
        race.shots = [];
        race.mines = [];
        race.countdown = 0;
        race.finished = false;
        for (const r of race.racers) {
          const s = u * track.length - r.id * 350;
          const f = track.frame(s);
          r.s = r.contactS = s;
          r.x = 0;
          r.branch = 0;
          r.pad = -1;
          r.position.copy(f.p);
          r.position.y += 2.2;
          r.gate = Math.floor((s / track.length) * 32) + 1;
          r.checkpoint = { s, branch: 0, gate: r.gate };
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
        draw,
        counts,
        updateHUD,
        makeTrack,
      };
      place();
      draw();
    }, device);
    for (const weapon of ["MISSILE", "PULSE", "MINE", "SHIELD", "TURBO"]) {
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
        const button = document.querySelector("aside #weapon");
        const touch = document.querySelector("aside #touch-fire");
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
            glyph: touch.querySelector("svg").innerHTML,
            color: touch.style.getPropertyValue("--weapon-color"),
          },
        };
      }, weapon);
      expect(sample.consumed).toBe(true);
      expect(sample.visible).toBe(true);
      if (sample.alignment !== null)
        expect(sample.alignment).toBeGreaterThan(0.9999);
      expect(sample.desktop.text).toContain(weapon);
      expect(sample.mobile.text).toContain(weapon);
      expect(sample.desktop.glyph).toBe(sample.mobile.glyph);
      await page.screenshot({
        path: `test-artifacts/weapons-${device}-${weapon}.png`,
      });
      await page
        .locator("aside")
        .evaluate((el) => (el.style.filter = "grayscale(1)"));
      await page.locator("aside").screenshot({
        path: `test-artifacts/weapons-hud-${device}-${weapon}-gray.png`,
      });
      await page.locator("aside").evaluate((el) => (el.style.filter = ""));
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
        const emptyHUD = [
          ...document.querySelectorAll("aside .weapon-name"),
        ].every((el) => el.textContent === "EMPTY");
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
    const padCases = await page.evaluate(() => {
      const f = window.fixture;
      const cases = [];
      for (const u of [0.065, 0.21]) {
        f.place(u - 2 / f.track.length);
        const p = f.race.player;
        const oldS = p.s;
        for (let i = 0; i < 12; i++)
          f.race.update(1 / 120, { ...f.input, throttle: true });
        cases.push({
          u,
          oldS,
          newS: p.s,
          pad: p.pad,
          surge: p.surge,
          weapon: p.weapon,
        });
      }
      return cases;
    });
    expect(padCases[0].surge).toBeGreaterThan(0);
    expect(padCases[1].weapon).toBeTruthy();
    for (const u of [0.065, 0.21]) {
      await page.evaluate((u) => {
        const f = window.fixture;
        f.place(u - 12 / f.track.length);
        f.updateHUD(null);
        f.draw();
      }, u);
      await page.screenshot({
        path: `test-artifacts/weapons-pad-${device}-${u}.png`,
      });
    }
    const perf = await page.evaluate(() => {
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
        "track-pads-arms",
        "track-pads-bevel",
        "track-pads-boost",
      ]);
    }
    const naturalReuse = await page.evaluate(() => {
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
    expect(naturalReuse[2].slots).toBe(naturalReuse[1].slots);
    expect(naturalReuse[2].children).toBe(naturalReuse[1].children);
    expect(naturalReuse[2].active).toBe(0);
    expect(naturalReuse[2].blasts).toBe(0);
    report.cases.push({ device, padCases, perf, coursePads, naturalReuse });
    await context.close();
  }
  const desktop = report.cases.filter(
    (c) => c.device === "desktop" && c.weapon,
  );
  expect(new Set(desktop.map((c) => c.desktop.glyph)).size).toBe(5);
  expect(new Set(desktop.map((c) => c.desktop.color)).size).toBe(5);
  expect(report.errors).toEqual([]);
  console.log(
    "Weapon fixtures: all five Race.fire effects/HUD, grayscale icons, orientation, expiration/pool reuse and physical pad crossings passed on desktop/mobile viewports.",
  );
} finally {
  await writeFile(
    "test-artifacts/weapons-report.json",
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
