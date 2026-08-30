import { describe, expect, it } from 'vitest';
import { COMBATANTS } from '../engine/combatants.js';
import { gradesFor, LADDERS, qualityFor, treesFor } from '../engine/ladders.js';
import { deriveStats, speedOf } from '../engine/cards.js';
import { OFFICIAL } from '../engine/official.js';
import { ROSTER } from '../engine/roster.js';
import type { UnitCard } from '../engine/cards.js';
import type { Grades } from '../engine/ladders.js';

const troop = (name: string) => [...COMBATANTS, ...OFFICIAL, ...ROSTER].find((c) => c.name === name)!;

// Cast has no grade of its own (section 11) — `LADDERS` and `Grades` cover the other four.
const GRADED_TYPES = Object.keys(LADDERS) as (keyof Grades)[];

describe('the ladders', () => {
  it('gives every graded type three rungs that climb', () => {
    for (const type of GRADED_TYPES) {
      const rungs = LADDERS[type];
      expect(rungs.map((r) => r.index), type).toEqual([1, 2, 3]);
      expect(rungs.map((r) => r.type), type).toEqual([type, type, type]);
      expect(rungs.map((r) => r.reachDc), type).toEqual([0, 0, 2]);
    }
  });
});

// AC and attack DC are f(level) across the published troops, so grades come from Speed, Will,
// ranged band and the recurring action names an importer reads off any statblock.
describe('grade derivation', () => {
  it('grades a troop with an empty tactic list — the normal case — on structure alone', () => {
    const rabble = troop('Goblin Rabble');
    expect(rabble.tactics).toEqual([]);
    expect(rabble.signals).toEqual([]);
    expect(gradesFor(rabble)).toEqual({ shoot: 1, fight: 2, guard: 1, rally: 1 });
  });

  it('carries movement as pace, not as a grade', () => {
    const camels = troop('Qadiran Camel Corps');
    expect(camels.signals).toContain('mounted');
    expect(speedOf(camels)).toBe(20);
    expect(speedOf(troop('Goblin Rabble'))).toBe(10);
    // Flight buys no ground: the gargoyles' 25 ft walks a square like anything else.
    expect(speedOf(troop('Gargoyle Wing'))).toBe(10);
    expect(gradesFor(camels)).not.toHaveProperty('move');
  });

  it('a levy is granted the bottom rung of everything but its own two feet', () => {
    const levy = troop('Peasant Levy');
    expect(gradesFor(levy)).toEqual({ shoot: 1, fight: 2, guard: 1, rally: 1 });
    expect(qualityFor(levy)).toBe(3);
  });

  it('an elite earns its threes', () => {
    const einherjar = troop('Einherji Host');
    expect(einherjar.signals).toEqual(expect.arrayContaining(['melee-drill', 'shielded', 'formation']));
    expect(gradesFor(einherjar)).toMatchObject({ fight: 3, guard: 3 });
  });

  it('gives Shoot the same free grade everywhere: effective range lives in Reach, not grade', () => {
    expect(deriveStats(troop('Archer Regiment')).reach).toBe('long');
    expect(deriveStats(troop('Hobgoblin Battalion')).reach).toBe('medium');
    expect(deriveStats(troop('Orc Raiding Party')).reach).toBe('short');
    expect(gradesFor(troop('Archer Regiment')).shoot).toBe(1);
    expect(gradesFor(troop('Hobgoblin Battalion')).shoot).toBe(1);
    expect(gradesFor(troop('Orc Raiding Party')).shoot).toBe(1);
  });

  it('reads Rally and Quality off the Will save, which is the one stat that spreads', () => {
    expect(gradesFor(troop('Angelic Chorus')).rally).toBe(3);
    expect(qualityFor(troop('Angelic Chorus'))).toBe(5);
    expect(gradesFor(troop('Conscript Squad')).rally).toBe(1);
    expect(qualityFor(troop('Conscript Squad'))).toBe(3);
  });

  it("gives a caster its tradition's whole tree list, not a Cast grade", () => {
    const clique = troop('Apprentice Magician Clique');
    expect(clique.caster).toBe(true);
    expect(gradesFor(clique)).not.toHaveProperty('cast');
    // No troop data states a tradition yet (see battle-mechanics.todos.md), so a caster with
    // none set falls back to arcane — 0 in Healing, the rest nonzero (section 11's grid).
    expect(treesFor(clique)).toEqual(['blast', 'controlling', 'offense', 'defense', 'movement']);
    expect(treesFor(troop('Goblin Rabble'))).toEqual([]);
  });

  it('lets a hand-authored tactic raise a grade the numbers do not reach', () => {
    expect(gradesFor(troop('Shield Wall')).guard).toBe(3);
    expect(gradesFor(troop('Peasant Levy')).guard).toBe(1);
    expect(gradesFor({ ...troop('Peasant Levy'), tactics: ['raise-shields'] }).guard).toBe(3);
  });

  it('grades every published troop without hand-authoring', () => {
    for (const card of [...COMBATANTS, ...OFFICIAL] as UnitCard[]) {
      const g = gradesFor(card);
      for (const type of GRADED_TYPES) expect(g[type], `${card.name} ${type}`).toBeGreaterThanOrEqual(1);
      expect(qualityFor(card), card.name).toBeGreaterThanOrEqual(2);
    }
    // Shoot no longer varies here: effective range moved to Reach, and no imported troop
    // carries the covering-fire tactic that is now the only thing that raises Shoot's grade.
    // Cast dropped out of `Grades` entirely (section 11), leaving three types that do vary
    // out of the four graded ones.
    const spread = GRADED_TYPES.map((t) => new Set([...COMBATANTS, ...OFFICIAL].map((c) => gradesFor(c)[t])).size);
    expect(spread.filter((n) => n > 1).length).toBeGreaterThanOrEqual(3);
  });
});
