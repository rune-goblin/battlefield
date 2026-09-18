import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMBATANTS, deriveStats, type UnitCard } from '../engine/index.js';
import {
  cardFromActor, demoralizedOf, importBaselineOf, troopActorProblems, woundsOf,
  type TroopActor, type TroopItem,
} from '../adapters/pf2e/troopCard.js';

const battleAction = (dc: number): TroopItem => ({
  name: 'Greatsword Flurry [Battle]',
  type: 'action',
  system: { description: { value: `<p>Each enemy in a @Template[type:emanation|distance:5] makes a @Check[reflex|dc:${dc}|basic|options:area-effect] save.</p>` } },
});

const salvoAction = (dc: number, feet: number): TroopItem => ({
  name: 'Longbow Volley [Salvo]',
  type: 'action',
  system: { description: { value: `<p>A @Template[type:burst|distance:10] within ${feet} feet with a @Check[reflex|dc:${dc}|basic|options:area-effect] save.</p>` } },
});

const demoralized = (value: number): TroopItem =>
  ({ name: 'Demoralized', type: 'effect', system: { slug: null, badge: { value } } });

function troopActor(extra: TroopItem[] = [], hitPoints = 96): TroopActor {
  return {
    name: 'Line Infantry',
    system: {
      details: { level: { value: 6 } },
      attributes: {
        ac: { value: 24 },
        hp: { max: 96, value: hitPoints },
        speed: { value: 20, otherSpeeds: [] },
      },
      perception: { mod: 13 },
      saves: { fortitude: { value: 15 }, reflex: { value: 14 }, will: { value: 13 } },
    },
    items: [battleAction(21), salvoAction(21, 120), ...extra],
  };
}

describe('pf2e troop card', () => {
  it('maps the sheet, the overrides and the signals off the statblock', () => {
    const card = cardFromActor(troopActor([{ name: 'Form Up', type: 'action' }]));
    expect(card).toMatchObject({
      name: 'Line Infantry', level: 6, role: 'infantry', salvo: 'medium', pace: false,
      fear: false, caster: false, signals: ['formation'], tactics: [],
      sheet: {
        ac: 24, hp: 96, battleDc: 21, salvoDc: 21, salvoFeet: 120,
        fortitude: 15, reflex: 14, will: 13, perception: 13, speed: 20, fly: false,
      },
      overrides: { strike: 11, volley: 11, reach: 'medium', defence: 24, will: 13, perception: 13 },
    });
    expect(deriveStats(card)).toMatchObject({ strike: 11, volley: 11, defence: 24, will: 13, reflex: 14 });
  });

  it('carries Demoralized as disorder and gives its penalty back to the prepared stats', () => {
    const card = cardFromActor(troopActor([demoralized(2)]));
    expect(card.disorder).toBe(2);
    expect(card.sheet).toMatchObject({ ac: 26, fortitude: 17, reflex: 16, will: 15, perception: 15 });
    // The Battle DC is action text, which no condition modifies, so Strike stays where it was.
    expect(card.overrides).toMatchObject({ strike: 11, defence: 26, will: 15, perception: 15 });
  });

  it('leaves disorder unset for an actor with no Demoralized effect', () => {
    expect(cardFromActor(troopActor()).disorder).toBeUndefined();
    expect(demoralizedOf(troopActor())).toBe(0);
  });

  it('reads Demoralized off an effect that carries an explicit slug and a renamed one', () => {
    const renamed: TroopItem = { name: 'Shaken', type: 'effect', system: { slug: 'demoralized', badge: { value: 3 } } };
    expect(demoralizedOf(troopActor([renamed]))).toBe(3);
  });

  it('reads the items of a live actor collection', () => {
    const items = troopActor().items as TroopItem[];
    const card = cardFromActor({ ...troopActor(), items: new Map(items.map((it, i) => [String(i), it])) });
    expect(card.sheet?.battleDc).toBe(21);
  });

  it('takes wounds off the hit-point ladder the writeback uses', () => {
    expect(woundsOf(96, 96)).toBe(0);
    expect(woundsOf(72, 96)).toBe(1);
    expect(woundsOf(48, 96)).toBe(2);
    expect(woundsOf(24, 96)).toBe(3);
    expect(woundsOf(0, 96)).toBe(4);
    expect(cardFromActor(troopActor([], 96)).wounds).toBeUndefined();
    expect(cardFromActor(troopActor([], 48)).wounds).toBe(2);
  });

  it('marks fear from an aura the statblock carries', () => {
    const gaze: TroopItem = { name: 'Wild Gaze', type: 'action', system: { traits: { value: ['aura', 'fear', 'mental'] } } };
    expect(cardFromActor(troopActor([gaze])).fear).toBe(true);
    expect(cardFromActor(troopActor([{ name: 'Frightful Presence', type: 'action' }])).fear).toBe(true);
  });

  it('reports what an actor is missing rather than importing half of it', () => {
    expect(troopActorProblems(null)).toEqual(['the actor is not an object']);
    const bare: TroopActor = { name: 'Rabble', system: { details: { level: { value: 2 } } } };
    expect(troopActorProblems(bare)).toContain('the actor has no [Battle] action');
    expect(() => cardFromActor(bare)).toThrow(/\[Battle\]/);
  });

  it('baselines the hit points and Demoralized the writeback compares against', () => {
    expect(importBaselineOf(troopActor([demoralized(1)], 40)))
      .toEqual({ hitPoints: 40, maxHitPoints: 96, demoralized: 1 });
  });
});

// Wild Gaze carries the aura and fear traits; the generated file hard-codes `fear: false`
// because the import script maps no fear at all.
const FEAR_AURAS = new Set(['Fey Host']);

describe('published troops', () => {
  const dir = new URL('../../data/troops/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('map the way the import script mapped them', () => {
    expect(files).toHaveLength(COMBATANTS.length);
    for (const file of files) {
      const actor = JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as TroopActor;
      const expected = COMBATANTS.find((c) => c.name === actor.name) as UnitCard;
      expect(expected, file).toBeTruthy();
      expect(cardFromActor(actor), file).toEqual({ ...expected, fear: FEAR_AURAS.has(actor.name!) });
    }
  });
});
