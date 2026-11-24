export const mod = (n: number, m: number) => ((n % m) + m) % m;
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
