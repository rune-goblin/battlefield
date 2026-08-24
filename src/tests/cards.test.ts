import { describe, expect, it } from 'vitest';
import { deriveStats } from '../engine/cards.js';
import { areaDc, armourClass, levelDc } from '../engine/tables.js';

describe('level tables', () => {
  it('matches the published troop numbers', () => {
    expect(areaDc(6, 'moderate')).toBe(21);
    expect(areaDc(3, 'moderate')).toBe(17);
    expect(areaDc(8, 'moderate')).toBe(23);
    expect(armourClass(6, 'high')).toBe(24);
    expect(levelDc(7)).toBe(23);
  });
});

describe('deriveStats', () => {
  it('derives a level-6 infantry unit', () => {
    const s = deriveStats({ name: 'x', level: 6, role: 'infantry' });
    expect(s).toEqual({ strike: 11, volley: null, reach: null, defence: 24, will: 17, perception: 14 });
  });
  it('a salvo reach gives infantry a volley', () => {
    const s = deriveStats({ name: 'x', level: 6, role: 'infantry', salvo: 'long' });
    expect(s.volley).toBe(11);
    expect(s.reach).toBe('long');
  });
  it('lets a card override any number', () => {
    const s = deriveStats({ name: 'x', level: 6, role: 'infantry', overrides: { will: 13 } });
    expect(s.will).toBe(13);
  });
});
