// Brief physical cues, not a continuous engine vibration. Audio mute/volume
// controls sound only; tactile feedback remains independent of the audio mix.
const EFFECTS = {
  hit: {
    duration: 180,
    strongMagnitude: 0.8,
    weakMagnitude: 0.45,
    priority: 5,
    cooldown: 220,
  },
  scrape: {
    duration: 55,
    strongMagnitude: 0.18,
    weakMagnitude: 0.3,
    priority: 1,
    cooldown: 260,
  },
  land: {
    duration: 95,
    strongMagnitude: 0.4,
    weakMagnitude: 0.18,
    priority: 2,
    cooldown: 300,
  },
  boost: {
    duration: 160,
    strongMagnitude: 0.28,
    weakMagnitude: 0.55,
    priority: 3,
    cooldown: 350,
  },
  launch: {
    duration: 210,
    strongMagnitude: 0.4,
    weakMagnitude: 0.65,
    priority: 3,
    cooldown: 500,
  },
  MISSILE: {
    duration: 90,
    strongMagnitude: 0.35,
    weakMagnitude: 0.6,
    priority: 3,
    cooldown: 160,
  },
  PULSE: {
    duration: 110,
    strongMagnitude: 0.2,
    weakMagnitude: 0.75,
    priority: 3,
    cooldown: 180,
  },
  MINE: {
    duration: 65,
    strongMagnitude: 0.15,
    weakMagnitude: 0.25,
    priority: 2,
    cooldown: 160,
  },
  SHIELD: {
    duration: 100,
    strongMagnitude: 0.12,
    weakMagnitude: 0.35,
    priority: 2,
    cooldown: 200,
  },
  TURBO: {
    duration: 240,
    strongMagnitude: 0.4,
    weakMagnitude: 0.7,
    priority: 3,
    cooldown: 350,
  },
};

export class GamepadRumble {
  constructor(
    reportError = (error) => console.warn("Controller rumble failed", error),
  ) {
    this.reportError = reportError;
    this.actuator = null;
    this.padKey = null;
    this.active = false;
    this.failed = false;
    this.until = 0;
    this.priority = 0;
    this.last = new Map();
  }
  connect(pad, active) {
    const key = pad ? `${pad.index}:${pad.id}` : null;
    if (key !== this.padKey) {
      this.stop();
      this.padKey = key;
      this.actuator = pad?.vibrationActuator || null;
      this.failed = false;
    }
    if (!active && this.active) this.stop();
    this.active = active;
  }
  invoke(method, ...args) {
    const actuator = this.actuator;
    try {
      Promise.resolve(actuator[method](...args)).catch((error) => {
        if (this.actuator !== actuator) return;
        this.failed = true;
        this.reportError(error);
      });
    } catch (error) {
      this.failed = true;
      this.reportError(error);
    }
  }
  stop() {
    if (this.active && this.actuator?.reset && !this.failed)
      this.invoke("reset");
    this.active = false;
    this.until = 0;
    this.priority = 0;
    this.last.clear();
  }
  events(events, now) {
    if (!this.active || this.failed || !this.actuator?.playEffect) return;
    // An actuator exposing only a different effect type is unsupported.
    if (this.actuator.effects && !this.actuator.effects.includes("dual-rumble"))
      return;
    let candidate;
    for (const event of events) {
      const key = event.kind === "fire" ? event.text : event.kind;
      const effect = EFFECTS[key];
      if (!effect || now - (this.last.get(key) ?? -Infinity) < effect.cooldown)
        continue;
      if (!candidate || effect.priority > candidate.effect.priority)
        candidate = { key, effect };
    }
    if (!candidate) return;
    const { key, effect } = candidate;
    if (now < this.until && effect.priority <= this.priority) return;
    this.last.set(key, now);
    this.until = now + effect.duration;
    this.priority = effect.priority;
    this.invoke("playEffect", "dual-rumble", {
      startDelay: 0,
      duration: effect.duration,
      strongMagnitude: effect.strongMagnitude,
      weakMagnitude: effect.weakMagnitude,
    });
  }
}
