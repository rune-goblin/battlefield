import { describe, expect, it } from 'vitest';
import { COMBATANTS } from '../engine/combatants.js';
import { gradesFor, LADDER_TYPES, LADDERS, qualityFor, spellsFor } from '../engine/ladders.js';
import { speedOf } from '../engine/cards.js';
import { OFFICIAL } from '../engine/official.js';
import { ROSTER } from '../engine/roster.js';
import type { UnitCard } from '../engine/cards.js';

const troop = (name: string) => [...COMBATANTS, ...OFFICIAL, ...ROSTER].find((c) => c.name === name)!;

describe('the ladders', () => {
  it('gives every type three rungs that climb', () => {
    for (const type of LADDER_TYPES) {
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
    expect(gradesFor(rabble)).toEqual({ shoot: 1, fight: 2, guard: 1, rally: 1, cast: 1 });
  });

  it('carries movement as Speed in feet, not as a grade', () => {
    const camels = troop('Qadiran Camel Corps');
    expect(camels.signals).toContain('mounted');
    expect(speedOf(camels)).toBe(35);
    expect(speedOf(troop('Goblin Rabble'))).toBe(25);
    expect(gradesFor(camels)).not.toHaveProperty('move');
  });

  it('a levy is granted the bottom rung of everything but its own two feet', () => {
    const levy = troop('Peasant Levy');
    expect(gradesFor(levy)).toEqual({ shoot: 1, fight: 2, guard: 1, rally: 1, cast: 1 });
    expect(qualityFor(levy)).toBe(3);
  });

  it('an elite earns its threes', () => {
    const einherjar = troop('Einherji Host');
    expect(einherjar.signals).toEqual(expect.arrayContaining(['melee-drill', 'shielded', 'formation']));
    expect(gradesFor(einherjar)).toMatchObject({ fight: 3, guard: 3 });
  });

  it('reads the shooting grade off the ranged band', () => {
    expect(gradesFor(troop('Archer Regiment')).shoot).toBe(3);
    expect(gradesFor(troop('Hobgoblin Battalion')).shoot).toBe(2);
    expect(gradesFor(troop('Orc Raiding Party')).shoot).toBe(1);
  });

  it('reads Rally and Quality off the Will save, which is the one stat that spreads', () => {
    expect(gradesFor(troop('Angelic Chorus')).rally).toBe(3);
    expect(qualityFor(troop('Angelic Chorus'))).toBe(5);
    expect(gradesFor(troop('Conscript Squad')).rally).toBe(1);
    expect(qualityFor(troop('Conscript Squad'))).toBe(3);
  });

  it('gives a caster the Cast ladder and the whole spell menu', () => {
    const clique = troop('Apprentice Magician Clique');
    expect(clique.caster).toBe(true);
    expect(gradesFor(clique).cast).toBe(1);
    expect(spellsFor(clique)).toEqual(['blast', 'ward', 'mend', 'bless', 'compel']);
    expect(spellsFor(troop('Goblin Rabble'))).toEqual([]);
  });

  it('lets a hand-authored tactic raise a grade the numbers do not reach', () => {
    expect(gradesFor(troop('Shield Wall')).guard).toBe(3);
    expect(gradesFor(troop('Peasant Levy')).guard).toBe(1);
    expect(gradesFor({ ...troop('Peasant Levy'), tactics: ['raise-shields'] }).guard).toBe(3);
  });

  it('grades every published troop without hand-authoring', () => {
    for (const card of [...COMBATANTS, ...OFFICIAL] as UnitCard[]) {
      const g = gradesFor(card);
      for (const type of LADDER_TYPES) expect(g[type], `${card.name} ${type}`).toBeGreaterThanOrEqual(1);
      expect(qualityFor(card), card.name).toBeGreaterThanOrEqual(2);
    }
    const spread = LADDER_TYPES.map((t) => new Set([...COMBATANTS, ...OFFICIAL].map((c) => gradesFor(c)[t])).size);
    expect(spread.filter((n) => n > 1).length).toBeGreaterThanOrEqual(5);
  });
});
