import { describe, expect, it } from 'vitest';
import { statusBars } from '../board/status-bars.js';

// Saves retain losses; player-facing bars and labels report capacity remaining.
describe('Health and Morale presentation', () => {
  it.each([
    [0, 0, false, 4, 3, 'Health 4/4', 'Morale 3/3'],
    [2, 2, false, 2, 1, 'Health 2/4', 'Morale 1/3'],
    [3, 3, true, 1, 0, 'Health 1/4', 'Morale 0/3 — routed'],
    [3, 3, false, 1, 0, 'Health 1/4', 'Morale 0/3'],
    [4, 1, false, 0, 2, 'Health 0/4 — destroyed', 'Morale 2/3'],
  ] as const)('maps stored losses %i/%i to remaining Health %i and Morale %i',
    (wounds, disorder, routed, health, morale, healthLabel, moraleLabel) => {
      const bars = statusBars(wounds, disorder, routed);
      expect(bars.health).toMatchObject({ remaining: health, label: healthLabel });
      expect(bars.morale).toMatchObject({ remaining: morale, label: moraleLabel });
    });
});
