// Scale a 0xRRGGBB colour's channels by `factor`. A pure per-channel multiply, so it only
// darkens usefully (factor < 1) — a 0 channel stays 0, so it can't lighten toward white.
export function shade(color: number, factor: number): number {
  const clamp = (c: number) => Math.min(255, Math.max(0, Math.round(c)));
  const r = clamp(((color >> 16) & 0xff) * factor);
  const g = clamp(((color >> 8) & 0xff) * factor);
  const b = clamp((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

/** Blend `t` of `b` into `a`, both 0xRRGGBB. Unlike `shade`, this can lighten. */
export function mix(a: number, b: number, t: number): number {
  const lerp = (x: number, y: number) => Math.round(x + (y - x) * t);
  const r = lerp((a >> 16) & 0xff, (b >> 16) & 0xff);
  const g = lerp((a >> 8) & 0xff, (b >> 8) & 0xff);
  const bl = lerp(a & 0xff, b & 0xff);
  return (r << 16) | (g << 8) | bl;
}
