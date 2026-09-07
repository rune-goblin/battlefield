import { describe, expect, it } from 'vitest';
import { hsbMatrix, IDENTITY_HSB, lchToRgb, rgbToLch } from '../board/layers/color.js';

const apply = (colour: number, matrix: number[]): [number, number, number] => {
  const rgb = [(colour >> 16) & 0xff, (colour >> 8) & 0xff, colour & 0xff].map(c => c / 255);
  return [0, 1, 2].map(row =>
    matrix[row * 5] * rgb[0] + matrix[row * 5 + 1] * rgb[1] + matrix[row * 5 + 2] * rgb[2],
  ) as [number, number, number];
};

describe('LCh', () => {
  it('round-trips every colour a picker can hand it', () => {
    for (const colour of [0x000000, 0xffffff, 0xcdd6a8, 0x4a4038, 0x9cc9e2, 0xff0000, 0x123456]) {
      expect(lchToRgb(rgbToLch(colour))).toBe(colour);
    }
  });

  it('keeps a hue while chroma passes through grey', () => {
    const green = rgbToLch(0x9fbe8c);
    expect(lchToRgb({ ...green, c: 0 })).toBe(lchToRgb({ l: green.l, c: 0, h: 0 }));
    expect(rgbToLch(lchToRgb({ ...green, c: 40 })).h).toBeCloseTo(green.h, 0);
  });
});

describe('HSB matrix', () => {
  it('leaves the art alone at its identity', () => {
    const [r, g, b] = apply(0xcdd6a8, hsbMatrix(IDENTITY_HSB));
    expect([r, g, b].map(v => Math.round(v * 255))).toEqual([0xcd, 0xd6, 0xa8]);
  });

  it('takes a colour to its own luminance at saturation 0', () => {
    const [r, g, b] = apply(0xff0000, hsbMatrix({ ...IDENTITY_HSB, saturation: 0 }));
    expect(r).toBeCloseTo(0.2126, 4);
    expect(g).toBeCloseTo(r, 6);
    expect(b).toBeCloseTo(r, 6);
  });

  it('scales every channel by the brightness', () => {
    const [r, g, b] = apply(0x804020, hsbMatrix({ ...IDENTITY_HSB, brightness: 0.5 }));
    expect([r, g, b].map(v => Math.round(v * 255 * 2))).toEqual([0x80, 0x40, 0x20]);
  });
});
