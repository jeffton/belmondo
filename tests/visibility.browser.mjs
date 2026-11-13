import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

// Standalone render fixture. It imports production classes, not the app or Vite's
// HTML client. All racer placements/instrumentation belong to this fixture only.
const url = process.env.SOURCE_URL || "http://127.0.0.1:5178";
const appUrl = process.env.GAME_URL || url;
const artifacts = "test-artifacts";
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const errors = [];
const requests = [];
async function actualUi(browser) {
  const desktop = await browser.newContext({
    viewport: { width: 1000, height: 625 },
  });
  await desktop.addInitScript(() => {
    // Synthetic standard gamepad input; no app internals are exposed or assigned.
    window.visibilityPadY = false;
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [
        {
          axes: [0, 0],
          connected: true,
          mapping: "standard",
          buttons: Array.from({ length: 17 }, (_, i) => ({
            pressed: i === 3 && window.visibilityPadY,
            value: i === 3 && window.visibilityPadY ? 1 : 0,
          })),
        },
      ],
    });
  });
  const page = await desktop.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(appUrl);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await page.locator("#quality").check();
  await page.locator('[data-step="craft"]').click();
  await page.locator("#start").click();
  await page.waitForFunction(() => window.nullVector.telemetry.time > 0.1);
  const view = page.locator("#view");
  await expect(view).toHaveAttribute("aria-pressed", "false");
  await page.screenshot({ path: `${artifacts}/visibility-ui-chase.png` });
  await page.keyboard.press("KeyV");
  await expect(view).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: `${artifacts}/visibility-ui-first-person.png`,
  });
  await page.keyboard.press("KeyV");
  await expect(view).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => {
    window.visibilityPadY = true;
  });
  await expect(view).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(250);
  await expect(view).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => {
    window.visibilityPadY = false;
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    window.visibilityPadY = true;
  });
  await expect(view).toHaveAttribute("aria-pressed", "false");
  await desktop.close();
  const mobile = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  const touch = await mobile.newPage();
  touch.on("pageerror", (error) => errors.push(error.message));
  await touch.goto(appUrl);
  await touch.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await touch.locator("#quality").check();
  await touch.locator('[data-step="craft"]').tap();
  await touch.locator("#start").tap();
  await touch.waitForFunction(() => window.nullVector.telemetry.time > 0.1);
  const touchView = touch.locator("#view");
  await expect(touchView).toHaveAttribute("aria-pressed", "false");
  await touchView.tap();
  await expect(touchView).toHaveAttribute("aria-pressed", "true");
  await touch.screenshot({
    path: `${artifacts}/visibility-ui-mobile-first-person.png`,
  });
  const speed = await touch.locator("#speed").boundingBox();
  for (const button of await touch.locator(".touch-actions button").all()) {
    const rect = await button.boundingBox();
    const overlapX =
      Math.min(speed.x + speed.width, rect.x + rect.width) -
      Math.max(speed.x, rect.x);
    const overlapY =
      Math.min(speed.y + speed.height, rect.y + rect.height) -
      Math.max(speed.y, rect.y);
    expect(
      overlapX <= 0 || overlapY <= 0,
      "Mobile speed text must not overlap touch buttons",
    ).toBe(true);
  }
  await touchView.tap();
  await expect(touchView).toHaveAttribute("aria-pressed", "false");
  await mobile.close();
  return {
    keyboardV: true,
    gamepadY: true,
    heldGamepadDebounced: true,
    mobileViewTap: true,
  };
}
try {
  const context = await browser.newContext({
    viewport: { width: 800, height: 500 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  await page.route("**/__visibility_fixture__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><meta charset="utf-8"><title>Ship visibility render fixture</title><style>html,body{margin:0;overflow:hidden;background:#14202a}canvas{width:100vw;height:100vh;display:block}</style><canvas></canvas>`,
    }),
  );
  await page.goto(`${url}/__visibility_fixture__.html`);
  const result = await page.evaluate(async () => {
    const worldSource = await (await fetch("/src/world.js")).text();
    const threeModule = worldSource.match(
      /from\s+["']([^"']*\/three\.js[^"']*)["']/,
    )[1];
    const [{ World }, { Race, CRAFT }, { makeTrack }, THREE] =
      await Promise.all([
        import("/src/world.js"),
        import("/src/race.js"),
        import("/src/track.js"),
        import(threeModule),
      ]);
    const world = new World(document.querySelector("canvas"));
    world.quality = "retro";
    world.resize();
    let track, race;
    const cases = [],
      images = [],
      lifecycle = [];
    let submitted = [];
    async function build(index) {
      track = makeTrack(index);
      const assetsReady = new Promise((resolve, reject) => {
        THREE.DefaultLoadingManager.onLoad = resolve;
        THREE.DefaultLoadingManager.onError = (asset) =>
          reject(new Error(`Fixture asset failed: ${asset}`));
      });
      world.build(track);
      race = new Race(track, 0, "race");
      world.setupRacers(race, CRAFT);
      await assetsReady;
      submitted = Array.from({ length: race.racers.length }, () => 0);
      for (const ship of world.ships)
        ship.traverse((mesh) => {
          if (mesh.isMesh)
            mesh.onBeforeRender = () => {
              submitted[world.ships.indexOf(ship)]++;
            };
        });
    }
    function place(racer, s, lateral = 0) {
      const frame = track.frame(s);
      racer.s = racer.contactS = s;
      racer.branch = 0;
      racer.x = lateral;
      racer.position.copy(frame.p).addScaledVector(frame.right, lateral);
      racer.position.y += 2.2;
      racer.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
      racer.yawRate = 0;
      racer.velocity.copy(frame.tangent).multiplyScalar(90);
      racer.speed = 90;
      racer.boost = racer.h = racer.vy = racer.protect = 0;
      racer.grounded = true;
    }
    function layout(playerS, offset, lateral = 6) {
      place(race.player, playerS);
      for (const racer of race.racers.slice(1))
        place(racer, playerS - 400 - racer.id * 30, 0);
      place(race.racers[1], playerS + offset, lateral);
    }
    function draw(demo = false) {
      submitted.fill(0);
      world.draw(race, 1 / 60, demo);
    }
    function readPixels() {
      const gl = world.renderer.getContext();
      const pixels = new Uint8Array(
        gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
      );
      gl.readPixels(
        0,
        0,
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      return pixels;
    }
    function inspect(
      name,
      { comparePixels = false, capture = false, demo = false } = {},
    ) {
      draw(demo);
      draw(demo);
      const ship = world.ships[1];
      const matrix = new THREE.Matrix4().multiplyMatrices(
        world.camera.projectionMatrix,
        world.camera.matrixWorldInverse,
      );
      const frustum = new THREE.Frustum().setFromProjectionMatrix(matrix);
      let coreInFrustum = false;
      ship.traverse((mesh) => {
        if (
          mesh.isMesh &&
          mesh.name !== "shield" &&
          frustum.intersectsObject(mesh)
        )
          coreInFrustum = true;
      });
      const record = {
        name,
        view: world.view,
        offset: race.racers[1].s - race.player.s,
        playerRank: race.position,
        opponentVisible: ship.visible,
        playerVisible: world.ships[0].visible,
        allOpponentsVisible: world.ships.slice(1).every((s) => s.visible),
        opponentSubmissions: submitted[1],
        playerSubmissions: submitted[0],
        coreInFrustum,
        camera: world.camera.position.toArray(),
        opponent: ship.position.toArray(),
        playerShadowVisible: world.ships[0].userData.shadow.visible,
        bank: world.ships[0].rotation.z,
        bodyPitch: race.player.pitch,
        hullPitch: world.ships[0].rotation.x,
        cameraVertical: world.camera.getWorldDirection(new THREE.Vector3()).y,
        cameraUpAlignment: world.camera.up
          .clone()
          .normalize()
          .dot(
            new THREE.Vector3(0, 1, 0).applyQuaternion(
              world.ships[0].quaternion,
            ),
          ),
        cameraForwardAlignment: world.camera
          .getWorldDirection(new THREE.Vector3())
          .dot(
            new THREE.Vector3(0, 0, 1).applyQuaternion(
              world.ships[0].quaternion,
            ),
          ),
        cameraMountError: world.camera.position.distanceTo(
          race.player.position
            .clone()
            .add(
              new THREE.Vector3(0, 1.15, 0.6).applyQuaternion(
                world.ships[0].quaternion,
              ),
            ),
        ),
      };
      if (comparePixels) {
        const withShip = readPixels();
        // Only the fixture's opponent is omitted for an image-difference control.
        // No application instance or production API exists in this page.
        ship.visible = false;
        world.renderer.render(world.scene, world.camera);
        const withoutShip = readPixels();
        record.changedPixels = 0;
        for (let i = 0; i < withShip.length; i += 4)
          if (
            Math.abs(withShip[i] - withoutShip[i]) +
              Math.abs(withShip[i + 1] - withoutShip[i + 1]) +
              Math.abs(withShip[i + 2] - withoutShip[i + 2]) >
            12
          )
            record.changedPixels++;
        ship.visible = true;
        world.renderer.render(world.scene, world.camera);
      }
      if (capture)
        images.push({
          name,
          data: world.renderer.domElement.toDataURL("image/png").split(",")[1],
        });
      cases.push(record);
      return record;
    }
    try {
      await build(0);
      const initialView = world.view;
      if (typeof world.setView !== "function")
        throw new Error(
          "World.setView must be available before running visibility regression",
        );
      world.setView("chase");
      for (const [name, offset] of [
        ["ahead", 20],
        ["alongside", 0],
        ["behind-3m", -3],
        ["behind-6m", -6],
        ["behind-10m", -10],
        ["behind-20m", -20],
        ["behind-28m", -28],
        ["behind-40m", -40],
      ]) {
        layout(350, offset);
        world.setView("chase");
        inspect(name, {
          comparePixels: offset >= -6,
          capture: [20, 0, -6].includes(offset),
        });
      }
      for (const [name, offsets] of [
        ["enemy-pass", [-32, -28, -20, -10, -6, -3, 0, 3, 10, 28]],
        ["player-pass", [28, 10, 3, 0, -3, -6, -10, -20, -28, -32]],
      ]) {
        // Ordered placements test the exact draw/ranking transition, independently
        // of Race's physics tests. Camera remains continuous through each pass.
        world.setView("chase");
        for (const offset of offsets) {
          layout(350, offset);
          inspect(`${name}/${offset}`);
        }
      }
      layout(track.length - 5, 10);
      world.setView("chase");
      inspect("lap-seam-enemy-ahead");
      layout(track.length + 5, -10);
      inspect("lap-seam-enemy-behind");
      layout(350, 100, 2000);
      world.setView("chase");
      inspect("outside-frustum");
      layout(350, 20);
      inspect("reenter-frustum", { comparePixels: true });
      world.setView("first-person");
      inspect("first-person/ahead", { comparePixels: true, capture: true });
      for (const yawRate of [-0.6, 0.6]) {
        race.player.yawRate = yawRate;
        inspect(`first-person/bank-${Math.sign(yawRate)}`, { capture: true });
      }
      race.player.yawRate = 0;
      for (const [name, pitch] of [
        ["pitch-up", -0.2],
        ["pitch-down", 0.2],
      ]) {
        race.player.pitch = pitch;
        inspect(`first-person/${name}`, { capture: true });
      }
      race.player.pitch = 0;
      for (const offset of [0, -6, -20]) {
        layout(350, offset);
        inspect(`first-person/${offset}`);
      }
      layout(350, 20);
      inspect("first-person/demo", { demo: true });
      world.setView("chase");
      inspect("return-to-chase", { comparePixels: true });
      for (const index of [1, 0]) {
        const oldShips = [...world.ships];
        const oldScene = world.scene;
        await build(index);
        layout(350, -6);
        world.setView("chase");
        inspect(`rebuild-track-${index}`, { comparePixels: true });
        lifecycle.push({
          track: index,
          count: world.ships.length,
          unique: new Set(world.ships).size,
          freshScene: oldScene !== world.scene,
          freshShips: world.ships.every((ship) => !oldShips.includes(ship)),
          attachedToCurrentScene: world.ships.every(
            (ship) => ship.parent === world.scene,
          ),
        });
      }
      return {
        initialView,
        cases,
        lifecycle,
        images,
        noApplication: !window.nullVector,
      };
    } finally {
      world.renderer.dispose();
    }
  });
  for (const image of result.images)
    await writeFile(
      `${artifacts}/visibility-${image.name.replaceAll("/", "-")}.png`,
      Buffer.from(image.data, "base64"),
    );
  delete result.images;
  await writeFile(
    `${artifacts}/visibility-report.json`,
    JSON.stringify({ ...result, errors, requests }, null, 2),
  );
  expect(result.noApplication).toBe(true);
  expect(result.initialView).toBe("chase");
  expect(
    requests.some((request) =>
      /\/(?:src\/main\.js|@vite\/client)/.test(request),
    ),
  ).toBe(false);
  for (const item of result.cases) {
    expect(
      item.opponentVisible,
      `${item.name}: opponent must not be progression-hidden`,
    ).toBe(true);
    expect(
      item.allOpponentsVisible,
      `${item.name}: every AI stays eligible for rendering`,
    ).toBe(true);
    if (item.name === "outside-frustum") {
      expect(item.coreInFrustum).toBe(false);
      expect(item.opponentSubmissions).toBe(0);
    } else if (item.coreInFrustum) {
      expect(
        item.opponentSubmissions,
        `${item.name}: in-frustum opponent submits real meshes`,
      ).toBeGreaterThan(0);
    }
    if (item.changedPixels !== undefined)
      expect(
        item.changedPixels,
        `${item.name}: opponent contributes actual image pixels`,
      ).toBeGreaterThan(8);
    const firstPerson =
      item.name.startsWith("first-person/") &&
      item.name !== "first-person/demo";
    expect(
      item.playerVisible,
      `${item.name}: only first-person hides own hull`,
    ).toBe(!firstPerson);
    if (firstPerson) {
      expect(item.playerSubmissions).toBe(0);
      expect(item.playerShadowVisible).toBe(false);
      expect(item.cameraUpAlignment).toBeGreaterThan(0.99999);
      expect(item.cameraForwardAlignment).toBeGreaterThan(0.99999);
      expect(item.cameraMountError).toBeLessThan(0.00001);
      if (item.name.includes("bank-"))
        expect(Math.abs(item.bank)).toBeGreaterThan(0.2);
      if (item.name === "first-person/pitch-up")
        expect(item.cameraVertical).toBeGreaterThan(0.1);
      if (item.name === "first-person/pitch-down")
        expect(item.cameraVertical).toBeLessThan(-0.1);
    }
    if (
      item.name.startsWith("enemy-pass/") ||
      item.name.startsWith("player-pass/") ||
      item.name.startsWith("lap-seam-")
    )
      expect(
        item.playerRank,
        `${item.name}: position responds to an actual overtake`,
      ).toBe(item.offset > 0 ? 2 : 1);
  }
  for (const item of result.lifecycle) {
    expect(item.count).toBe(8);
    expect(item.unique).toBe(8);
    expect(item.freshScene).toBe(true);
    expect(item.freshShips).toBe(true);
    expect(item.attachedToCurrentScene).toBe(true);
  }
  await context.close();
  if (process.env.VISIBILITY_APP_UI !== "0")
    result.ui = await actualUi(browser);
  expect(errors).toEqual([]);
  await writeFile(
    `${artifacts}/visibility-report.json`,
    JSON.stringify({ ...result, errors, requests }, null, 2),
  );
  console.log(
    `Visibility: ${result.cases.length} rendered cases; ahead/alongside/behind, both pass directions, rank changes, lap seam, normal frustum, first-person/chase/demo and scene rebuilds passed. No application/main/HMR or production hooks.`,
  );
} finally {
  await browser.close();
}
