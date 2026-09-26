export const cssHex = (colour: number): string => `#${colour.toString(16).padStart(6, '0')}`;

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

/** A fully saturated 0xRRGGBB at `degrees` around the colour wheel — the direction a tint
 * pulls toward, which `mix` then dilutes to the strength wanted. */
export function hue(degrees: number): number {
  const h = (((degrees % 360) + 360) % 360) / 60;
  const x = Math.round(255 * (1 - Math.abs((h % 2) - 1)));
  const [r, g, b] = h < 1 ? [255, x, 0] : h < 2 ? [x, 255, 0] : h < 3 ? [0, 255, x]
    : h < 4 ? [0, x, 255] : h < 5 ? [x, 0, 255] : [255, 0, x];
  return (r << 16) | (g << 8) | b;
}

/** CIE LCh(ab) under D65: lightness 0–100, chroma 0 upward (about 132 at its widest), hue in
 * degrees. Perceptual, so a lightness step reads as the same step at every hue — which is what
 * a hex picker cannot give when a palette has to hold together across nine terrains. */
export interface Lch { l: number; c: number; h: number }

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const WHITE = { x: 0.95047, y: 1, z: 1.08883 };
const EPSILON = 216 / 24389;
const f = (t: number) => (t > EPSILON ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
const fInverse = (t: number) => (t ** 3 > EPSILON ? t ** 3 : ((t - 4 / 29) * 108) / 841);

export function rgbToLch(colour: number): Lch {
  const r = toLinear(((colour >> 16) & 0xff) / 255);
  const g = toLinear(((colour >> 8) & 0xff) / 255);
  const b = toLinear((colour & 0xff) / 255);
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / WHITE.x);
  const y = f((0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / WHITE.y);
  const z = f((0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / WHITE.z);
  const a = 500 * (x - y);
  const bb = 200 * (y - z);
  return {
    l: 116 * y - 16,
    c: Math.hypot(a, bb),
    h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360,
  };
}

/** The nearest displayable 0xRRGGBB. LCh reaches colours sRGB has no room for, and those clip
 * per channel — so a slider can be dragged past the edge of the gamut and come back. */
export function lchToRgb({ l, c, h }: Lch): number {
  const radians = (h * Math.PI) / 180;
  const a = Math.cos(radians) * c;
  const b = Math.sin(radians) * c;
  const fy = (l + 16) / 116;
  const x = WHITE.x * fInverse(fy + a / 500);
  const y = WHITE.y * fInverse(fy);
  const z = WHITE.z * fInverse(fy - b / 200);
  const channel = (v: number) => Math.min(255, Math.max(0, Math.round(toSrgb(v) * 255)));
  const r = channel(3.2404542 * x - 1.5371385 * y - 0.4985314 * z);
  const g = channel(-0.9692660 * x + 1.8760108 * y + 0.0415560 * z);
  const bl = channel(0.0556434 * x - 0.2040259 * y + 1.0572252 * z);
  return (r << 16) | (g << 8) | bl;
}

/** A hue rotation in degrees, a saturation and a brightness, all applied to a texture's own
 * colours. Identity at (0, 1, 1). */
export interface Hsb { hue: number; saturation: number; brightness: number }
export const IDENTITY_HSB: Hsb = { hue: 0, saturation: 1, brightness: 1 };
export const isIdentityHsb = (hsb: Hsb): boolean =>
  hsb.hue === 0 && hsb.saturation === 1 && hsb.brightness === 1;

// Rec. 709, the weights a saturation has to hold constant if a grey is to stay put and a
// desaturated red is to come out as dark as a red reads.
const LUMA = { r: 0.2126, g: 0.7152, b: 0.0722 };
const multiply = (a: number[], b: number[]): number[] => {
  const out: number[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      out[row * 3 + col] = a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col];
    }
  }
  return out;
};

/** The twenty numbers of a 5×4 colour matrix, row-major — `PIXI.ColorMatrixFilter.matrix`. */
export type ColourMatrix = [
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
];

/** The matrix `PIXI.ColorMatrixFilter` takes, for an HSB dial. */
export function hsbMatrix({ hue, saturation, brightness }: Hsb): ColourMatrix {
  const radians = (hue * Math.PI) / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const { r, g, b } = LUMA;
  const rotate = [
    r + cos * (1 - r) - sin * r, g - cos * g - sin * g, b - cos * b + sin * (1 - b),
    r - cos * r + sin * 0.143, g + cos * (1 - g) + sin * 0.14, b - cos * b - sin * 0.283,
    r - cos * r - sin * (1 - r), g - cos * g + sin * g, b + cos * (1 - b) + sin * b,
  ];
  const s = saturation;
  const saturate = [
    r + s * (1 - r), g * (1 - s), b * (1 - s),
    r * (1 - s), g + s * (1 - g), b * (1 - s),
    r * (1 - s), g * (1 - s), b + s * (1 - b),
  ];
  const m = multiply(saturate, rotate).map(v => v * brightness);
  return [
    m[0], m[1], m[2], 0, 0,
    m[3], m[4], m[5], 0, 0,
    m[6], m[7], m[8], 0, 0,
    0, 0, 0, 1, 0,
  ];
}
