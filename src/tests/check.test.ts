import { describe, expect, it } from 'vitest';
import { check, degreeOf, readCheck } from '../engine/check.js';
import { scriptedRng } from '../engine/rng.js';

describe('degreeOf', () => {
  it('uses the four PF2e bands', () => {
    expect(degreeOf(10, 5, 24)).toBe('failure');
    expect(degreeOf(10, 5, 15)).toBe('success');
    expect(degreeOf(15, 10, 15)).toBe('critical-success');
    expect(degreeOf(2, 3, 15)).toBe('critical-failure');
  });
  it('shifts one step on a natural 20 or 1', () => {
    expect(degreeOf(20, 1, 26)).toBe('success');
    expect(degreeOf(1, 30, 20)).toBe('success');
  });
});

describe('readCheck', () => {
  it('reads a roll already made to the degree check would have given it', () => {
    for (const roll of [1, 4, 11, 17, 20]) {
      expect(readCheck(roll, 7, 19)).toEqual(check(scriptedRng([roll]), 7, 19));
    }
  });
});
