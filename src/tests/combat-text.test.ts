import { describe, expect, it } from 'vitest';
import { createCombatTextService, type CombatTextLine } from '../services/CombatTextService.js';

const line = (unit: string, text: string): CombatTextLine => ({ unit, cell: 'c3', parts: [{ text, tone: 'good' }] });
const texts = (lines: CombatTextLine[]) => lines.map((l) => `${l.unit}:${l.parts[0].text}`);

describe('CombatTextService', () => {
  it('plays queued lines in the order queued', () => {
    const service = createCombatTextService();
    const shown: CombatTextLine[] = [];
    service.attach((l) => shown.push(l));

    service.queue(line('u0', 'Hit'), line('u1', 'Fear'));
    service.queue(line('u0', 'Guard'));

    expect(texts(shown)).toEqual(['u0:Hit', 'u1:Fear', 'u0:Guard']);
  });

  it('holds lines queued with no display until one attaches, then plays each once', () => {
    const service = createCombatTextService();
    service.queue(line('u0', 'Resisted'));
    const shown: CombatTextLine[] = [];

    service.attach((l) => shown.push(l));
    service.attach((l) => shown.push(l));

    expect(texts(shown)).toEqual(['u0:Resisted']);
  });

  it('sends lines to the latest display alone, and a stale detach leaves it attached', () => {
    const service = createCombatTextService();
    const first: CombatTextLine[] = [];
    const second: CombatTextLine[] = [];
    const detachFirst = service.attach((l) => first.push(l));
    service.attach((l) => second.push(l));

    detachFirst();
    service.queue(line('u0', 'Hit'));

    expect(first).toEqual([]);
    expect(texts(second)).toEqual(['u0:Hit']);
  });

  it('holds lines after the display detaches, and clear drops them', () => {
    const service = createCombatTextService();
    const detach = service.attach(() => {});
    detach();
    service.queue(line('u0', 'Hit'));
    service.clear();
    const shown: CombatTextLine[] = [];

    service.attach((l) => shown.push(l));

    expect(shown).toEqual([]);
  });
});
