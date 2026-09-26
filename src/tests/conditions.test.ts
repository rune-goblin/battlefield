import { describe, expect, it } from 'vitest';
import { CONDITIONS, HEALING_CONDITIONS, STATUSES } from '../engine/index.js';

describe('condition record', () => {
  it('holds every status but fortified through exactly one condition', () => {
    const held = Object.values(CONDITIONS).flatMap((spec) => ('status' in spec ? [spec.status] : []));
    expect([...held].sort()).toEqual(STATUSES.filter((status) => status !== 'fortified').sort());
  });

  it('heals board statuses, pinned through persistent damage', () => {
    expect(HEALING_CONDITIONS).toEqual(['pinned', 'rooted', 'suppressed', 'exposed', 'frightened', 'persistent']);
    for (const status of HEALING_CONDITIONS) expect(STATUSES).toContain(status);
  });
});
