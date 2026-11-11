// Countdown revs are charged by deliberate throttle, never automatic thrust.
export class Launch {
  constructor() {
    this.level = 0;
    this.min = 0.65;
    this.max = 0.8;
    this.resolved = false;
    this.success = false;
    this.ready = false;
  }

  update(dt, throttle, intent) {
    if (this.resolved) return;
    const pressed = intent && throttle > 0;
    // Input carried from the menu/start action must first be released.
    if (!pressed) this.ready = true;
    const rate = this.ready && pressed ? throttle * 1.25 : -0.8;
    this.level = Math.max(0, Math.min(1, this.level + rate * dt));
  }

  resolve() {
    if (this.resolved) return;
    this.resolved = true;
    this.success = this.level >= this.min && this.level <= this.max;
  }
}
