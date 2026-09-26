import { describe, expect, it } from 'vitest';
import { createCombatTextQueue, type CombatTextLine } from '../app/combat-text.js';

const line = (unit: string, text: string): CombatTextLine => ({ unit, cell: 'c3', parts: [{ text, tone: 'good' }] });
const texts = (lines: CombatTextLine[]) => lines.map((l) => `${l.unit}:${l.parts[0].text}`);

describe('CombatTextQueue', () => {
  it('plays queued lines in the order queued', () => {
    const queue = createCombatTextQueue();
    const shown: CombatTextLine[] = [];
    queue.attach((l) => shown.push(l));

    queue.queue(line('u0', 'Hit'), line('u1', 'Fear'));
    queue.queue(line('u0', 'Guard'));

    expect(texts(shown)).toEqual(['u0:Hit', 'u1:Fear', 'u0:Guard']);
  });

  it('holds lines queued with no display until one attaches, then plays each once', () => {
    const queue = createCombatTextQueue();
    queue.queue(line('u0', 'Resisted'));
    const shown: CombatTextLine[] = [];

    queue.attach((l) => shown.push(l));
    queue.attach((l) => shown.push(l));

    expect(texts(shown)).toEqual(['u0:Resisted']);
  });

  it('sends lines to the latest display alone, and a stale detach leaves it attached', () => {
    const queue = createCombatTextQueue();
    const first: CombatTextLine[] = [];
    const second: CombatTextLine[] = [];
    const detachFirst = queue.attach((l) => first.push(l));
    queue.attach((l) => second.push(l));

    detachFirst();
    queue.queue(line('u0', 'Hit'));

    expect(first).toEqual([]);
    expect(texts(second)).toEqual(['u0:Hit']);
  });

  it('holds lines after the display detaches, and clear drops them', () => {
    const queue = createCombatTextQueue();
    const detach = queue.attach(() => {});
    detach();
    queue.queue(line('u0', 'Hit'));
    queue.clear();
    const shown: CombatTextLine[] = [];

    queue.attach((l) => shown.push(l));

    expect(shown).toEqual([]);
  });
});
