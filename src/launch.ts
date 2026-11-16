// Countdown revs are charged by deliberate throttle, never automatic thrust.
export class Launch {
  declare level: number;
  declare min: number;
  declare max: number;
  declare resolved: boolean;
  declare success: boolean;
  declare ready: boolean;
  constructor() {
    this.level = 0;
    this.min = 0.65;
    this.max = 0.8;
    this.resolved = false;
    this.success = false;
    this.ready = false;
  }

  observe(throttle?: number | boolean, intent?: boolean): void {
    // A genuine release during the camera approach also releases menu input.
    if (!(intent && (throttle as number) > 0)) this.ready = true;
  }

  update(dt: number, throttle?: number | boolean, intent?: boolean): void {
    if (this.resolved) return;
    this.observe(throttle, intent);
    const pressed = intent && (throttle as number) > 0;
    const rate = this.ready && pressed ? (throttle as number) * 1.25 : -0.8;
    this.level = Math.max(0, Math.min(1, this.level + rate * dt));
  }

  resolve(): void {
    if (this.resolved) return;
    this.resolved = true;
    this.success = this.level >= this.min && this.level <= this.max;
  }
}
