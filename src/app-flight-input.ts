import { $ } from "./app-elements.ts";
import {
  FIRE_BUTTON,
  SCRAP_BUTTON,
  gamepadFlightControls,
} from "./gamepad-controls.ts";
import type { GamepadRumble } from "./gamepad-rumble.ts";
import type { MenuNavigation } from "./menu-navigation.ts";
import type { Race, RaceInput } from "./race.ts";
import { halfstickPosition } from "./touch-halfstick.ts";
import { clamp } from "./track.ts";

type InputMode = "keyboard" | "gamepad" | "touch";

type InputHooks = {
  getRace: () => Race;
  isRacing: () => boolean;
  isPaused: () => boolean;
  getNavigator: () => MenuNavigation;
  navigationRoot: () => HTMLElement | null;
  resumeMenuCursor: (cursor: HTMLElement | null) => void;
  startMenuMusic: () => void;
  togglePauseFromInput: () => void;
  toggleView: () => void;
  pause: () => void;
  resetClock: () => void;
};

export function createFlightInput(
  rumble: GamepadRumble,
  {
    getRace,
    isRacing,
    isPaused,
    getNavigator,
    navigationRoot,
    resumeMenuCursor,
    startMenuMusic,
    togglePauseFromInput,
    toggleView,
    pause,
    resetClock,
  }: InputHooks,
) {
  const keys = new Set<string>();
  let touchSteer = 0,
    touchPitch = 0,
    steerPointer: number | null = null,
    airPointer: number | null = null,
    touchAir = 0,
    touchCoast = 0,
    touchLaunchArmed = false;
  const touchLayout = matchMedia("(pointer: coarse)").matches;
  let touch = touchLayout;
  let inputMode: InputMode = touch ? "touch" : "keyboard";
  document.body.classList.toggle("touch", touch);
  document.body.dataset.inputMode = inputMode;
  function setInputMode(mode: InputMode) {
    if (inputMode === mode) return;
    const fromTouch = inputMode === "touch";
    inputMode = mode;
    touch = mode === "touch";
    document.body.classList.toggle("touch", touch || touchLayout);
    document.body.dataset.inputMode = mode;
    if (fromTouch && navigationRoot()?.id === "menu") {
      // A cancelled touch can leave the pointer cursor on a different choice.
      // Resume from a natively focused setup command or the committed choice.
      resumeMenuCursor(
        document.activeElement?.closest<HTMLElement>(
          ".setup-navigation button",
        ) ?? null,
      );
    }
    if (!touch) {
      touchSteer = 0;
      touchPitch = 0;
      steerPointer = null;
      resetAirStick();
      touchLaunchArmed = false;
      $("steer-pad").querySelector("i")!.style.transform = "";
    }
  }
  window.addEventListener(
    "pointerdown",
    (event) => {
      if (event.pointerType === "touch") setInputMode("touch");
    },
    { capture: true },
  );
  function clearInput() {
    rumble.stop();
    keys.clear();
    touchSteer = 0;
    touchPitch = 0;
    steerPointer = null;
    resetAirStick();
    touchLaunchArmed = false;
    for (const b of document.querySelectorAll(".pressed"))
      b.classList.remove("pressed");
    $("steer-pad").querySelector("i")!.style.transform = "";
  }
  let padFire = false,
    padScrap = false;
  function readMenuGamepad(pad: Gamepad | null, now = performance.now()) {
    const menuActive = Boolean(navigationRoot());
    const fire = Boolean(pad?.buttons[FIRE_BUTTON]?.pressed);
    const scrap = Boolean(pad?.buttons[SCRAP_BUTTON]?.pressed);
    if (!menuActive && isRacing() && !isPaused()) {
      if (fire && !padFire) getRace().fire();
      else if (scrap && !padScrap) getRace().scrapWeapon();
    }
    // Consume held menu buttons before processing Back/resume.
    padFire = fire;
    padScrap = scrap;
    const x = pad?.axes?.[0] || 0;
    const y = pad?.axes?.[1] || 0;
    if (menuActive && (Math.abs(x) > 0.12 || Math.abs(y) > 0.12))
      padAxesConsumed = true;
    if (!pad || (Math.abs(x) < 0.12 && Math.abs(y) < 0.12))
      padAxesConsumed = false;
    // Chromium grants activation while getGamepads() samples a real button
    // above 0.9. Stick-only input and JS mocks grant no activation themselves.
    // Connection alone must not start playback, nor should held input queue it.
    if (
      menuActive &&
      pad &&
      (Math.abs(x) > 0.45 ||
        Math.abs(y) > 0.45 ||
        [0, 1, 9, 12, 13, 14, 15].some(
          (index) => pad.buttons?.[index]?.pressed,
        ))
    )
      startMenuMusic();
    const wasPaused = isPaused();
    const menuNavigator = getNavigator();
    menuNavigator.gamepad(menuActive ? pad : null, now);
    if (menuNavigator.lastAction === "activate") {
      // Resume is also the pilot taking the throttle; other menu selections
      // still require release before A can drive or arm the countdown launch.
      padAConsumed = !(
        wasPaused &&
        menuNavigator.lastActivated === $("resume") &&
        isRacing() &&
        !isPaused()
      );
    }
    if (menuNavigator.lastAction === "back" && pad?.buttons?.[9]?.pressed)
      padPauseConsumed = true;
    if (!pad?.buttons?.[0]?.pressed) padAConsumed = false;
    if (!pad?.buttons?.[9]?.pressed) padPauseConsumed = false;
  }
  function connectedGamepad() {
    return Array.from(navigator.getGamepads?.() || []).find(Boolean) || null;
  }
  function pollMenuGamepad() {
    const pad = connectedGamepad();
    rumble.connect(
      pad,
      isRacing() && !isPaused() && !document.hidden && document.hasFocus(),
    );
    const connected = String(Boolean(pad));
    if (document.body.dataset.gamepadConnected !== connected)
      document.body.dataset.gamepadConnected = connected;
    readMenuGamepad(pad);
  }
  let airPad: HTMLElement;
  function resetAirStick() {
    airPointer = null;
    touchAir = 0;
    touchCoast = 0;
    airPad.classList.remove("pressed");
    airPad.querySelector("i")!.style.transform = "";
  }
  function moveAir(e: PointerEvent) {
    if (airPointer !== e.pointerId) return;
    const rect = airPad.getBoundingClientRect();
    const radius = rect.width * 0.375;
    const position = halfstickPosition(
      (e.clientX - rect.left - rect.width / 2) / radius,
      (e.clientY - rect.top - 16) / radius,
    );
    touchAir = position.x;
    touchCoast = position.y;
    if (touchCoast > 0) touchLaunchArmed = false;
    airPad.querySelector("i")!.style.transform =
      `translate(${touchAir * radius}px, ${touchCoast * radius}px)`;
  }
  let steerPad: HTMLElement;
  function moveSteer(e: PointerEvent) {
    if (steerPointer !== e.pointerId) return;
    const rect = steerPad.getBoundingClientRect();
    touchSteer = clamp(
      (e.clientX - rect.left - rect.width / 2) / (rect.width * 0.4),
      -1,
      1,
    );
    touchPitch = clamp(
      (rect.top + rect.height / 2 - e.clientY) / (rect.height * 0.4),
      -1,
      1,
    );
    const visualScale = 1 / Math.max(1, Math.hypot(touchSteer, touchPitch));
    steerPad.querySelector("i")!.style.transform =
      `translate(${touchSteer * visualScale * rect.width * 0.32}px, ${-touchPitch * visualScale * rect.height * 0.32}px)`;
  }
  let steeringKind: "digital" | "analog" = "digital";
  let padPause = false,
    padView = false,
    padAConsumed = false,
    padAxesConsumed = false,
    padPauseConsumed = false;
  let previousPadInput: number[] = [];
  function input(): RaceInput {
    const pad = connectedGamepad();
    if (pad) updateGamepadInputMode(pad);
    const down = (...codes: string[]) => codes.some((c) => keys.has(c));
    const keyboardSteer =
      (down("ArrowRight", "KeyD") ? 1 : 0) -
      (down("ArrowLeft", "KeyA") ? 1 : 0);
    let steer = keyboardSteer + touchSteer;
    if (keyboardSteer) steeringKind = "digital";
    if (touchSteer !== 0) steeringKind = "analog";
    let airRight = Math.max(Number(down("KeyL")), touchAir);
    let airLeft = Math.max(Number(down("KeyJ")), -touchAir);
    let pitch = (down("KeyI") ? 1 : 0) - (down("KeyK") ? 1 : 0) + touchPitch;
    let launchIntent = down("ArrowUp", "KeyW") || (touch && touchLaunchArmed);
    let throttle = touch ? 1 - touchCoast : Number(launchIntent);
    if (pad) {
      if (!padAxesConsumed && Math.abs(pad.axes[0]) > 0.12) {
        steer = pad.axes[0];
        steeringKind = "analog";
      }
      if (!padAxesConsumed && Math.abs(pad.axes[1]) > 0.12)
        pitch = -pad.axes[1];
      const flight = gamepadFlightControls(pad, padAConsumed);
      airRight = Math.max(airRight, flight.airRight);
      airLeft = Math.max(airLeft, flight.airLeft);
      // Connected controllers always hold A for thrust, including touch devices.
      throttle = Math.max(Number(down("ArrowUp", "KeyW")), flight.throttle);
      launchIntent = down("ArrowUp", "KeyW") || flight.throttle > 0;
      if (isRacing()) {
        if (pad.buttons[3]?.pressed && !padView && !isPaused()) toggleView();
        padView = pad.buttons[3]?.pressed;
        if (
          pad.buttons[9]?.pressed &&
          !padPauseConsumed &&
          !padPause &&
          !document.querySelector("dialog[open]:not(#pause-panel)")
        )
          togglePauseFromInput();
        padPause = pad.buttons[9]?.pressed;
      } else {
        padView = pad.buttons[3]?.pressed;
        padPause = pad.buttons[9]?.pressed;
      }
    }
    return {
      // The road's lateral axis points camera-left when looking forward.
      steer: -clamp(steer, -1, 1),
      steeringKind,
      air: airLeft - airRight,
      airLeft,
      airRight,
      pitch: clamp(pitch, -1, 1),
      throttle:
        touch || getRace()?.countdown > 0 ? throttle : Boolean(throttle),
      launchIntent,
    };
  }

  function updateGamepadInputMode(pad: Gamepad) {
    const values = [
      ...pad.axes
        .slice(0, 2)
        .map((value) =>
          !padAxesConsumed && Math.abs(value) > 0.12 ? value : 0,
        ),
      ...pad.buttons.map((button, index) =>
        [6, 7].includes(index)
          ? button.value > 0.1
            ? button.value
            : 0
          : Number(button.pressed),
      ),
    ];
    const active = values.some((value) => value !== 0);
    const moved = values.some(
      (value, index) =>
        Math.abs(value - (previousPadInput[index] || 0)) >
        (index < 2 ? 0.12 : 0.1),
    );
    if (active && moved) setInputMode("gamepad");
    // Keep the last deliberate position, not each noisy sample of a held stick.
    if (!active || moved) previousPadInput = values;
  }

  function mountWeaponCommands() {
    const fire = () => {
      if (!isPaused()) getRace().fire();
    };
    const scrap = () => {
      if (isRacing() && !isPaused()) getRace().scrapWeapon();
    };
    $("weapon").onclick = fire;
    for (const [id, command] of [
      ["touch-fire", fire],
      ["touch-scrap", scrap],
    ] as const) {
      const button = $(id);
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        command();
      });
      button.onclick = (event) => {
        if (event.detail === 0) command();
      };
    }
  }

  function mountKeyboard() {
    window.addEventListener("keydown", (e) => {
      if (getNavigator().keydown(e)) return;
      if (document.querySelector("dialog[open]:not(#pause-panel)")) return;
      if (!isRacing()) return;
      if (
        [
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "KeyW",
          "KeyA",
          "KeyD",
          "KeyI",
          "KeyJ",
          "KeyK",
          "KeyL",
          "Space",
          "KeyX",
          "KeyV",
          "Escape",
        ].includes(e.code)
      )
        setInputMode("keyboard");
      if (e.code === "Escape") {
        e.preventDefault();
        if (!e.repeat) togglePauseFromInput();
        return;
      }
      if (isPaused()) return;
      if (["ArrowUp", "ArrowLeft", "ArrowRight", "Space"].includes(e.code))
        e.preventDefault();
      if (e.repeat) return;
      if (e.code === "KeyV") {
        e.preventDefault();
        toggleView();
        return;
      }
      keys.add(e.code);
      if (e.code === "Space") getRace().fire();
      if (e.code === "KeyX") getRace().scrapWeapon();
    });
    window.addEventListener("keyup", (e) => keys.delete(e.code));
    window.addEventListener("blur", () => {
      if (isRacing()) pause();
      clearInput();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && isRacing()) pause();
      resetClock();
    });
  }

  function mountTouchSticks() {
    airPad = $("air-pad");
    airPad.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (airPointer !== null) return;
      airPointer = e.pointerId;
      airPad.setPointerCapture(e.pointerId);
      airPad.classList.add("pressed");
      moveAir(e);
    });
    airPad.addEventListener("pointermove", moveAir);
    for (const event of [
      "pointerup",
      "pointercancel",
      "lostpointercapture",
    ] as const)
      airPad.addEventListener(event, (e) => {
        if (airPointer !== e.pointerId) return;
        if (getRace()?.countdown > 0)
          touchLaunchArmed = event === "pointerup" && touchCoast > 0;
        resetAirStick();
      });
    steerPad = $("steer-pad");
    steerPad.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (steerPointer !== null) return;
      steerPointer = e.pointerId;
      steerPad.setPointerCapture(e.pointerId);
      moveSteer(e);
    });
    steerPad.addEventListener("pointermove", moveSteer);
    for (const event of [
      "pointerup",
      "pointercancel",
      "lostpointercapture",
    ] as const)
      steerPad.addEventListener(event, (e) => {
        if (e.pointerId !== steerPointer) return;
        touchSteer = 0;
        touchPitch = 0;
        steerPointer = null;
        steerPad.querySelector("i")!.style.transform = "";
      });
  }

  return {
    setInputMode,
    clearInput,
    pollMenuGamepad,
    input,
    mountWeaponCommands,
    mountFlightControls() {
      mountKeyboard();
      mountTouchSticks();
    },
  };
}
