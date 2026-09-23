import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMBATANTS, OFFICIAL, deriveStats, type UnitCard } from '../engine/index.js';
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
  it('retains the original numeric movement categories', () => {
    const actor = troopActor();
    actor.system!.attributes!.speed = { value: 20, otherSpeeds: [
      { type: 'fly', value: 60 }, { type: 'swim', value: 15 }, { type: 'climb', value: 10 },
    ] };
    expect(cardFromActor(actor).sheet).toMatchObject({ speed: 20, fly: true,
      otherSpeeds: [{ type: 'fly', value: 60 }, { type: 'swim', value: 15 }, { type: 'climb', value: 10 }] });
  });
  it('imports the Clique’s spell attack independently of its two DC-based attacks', () => {
    const actor = troopActor();
    actor.name = 'Apprentice Magician Clique';
    actor.system!.details!.level!.value = 5;
    actor.items = [
      { name: 'Sparking Wands', type: 'action', system: { description: { value: '@Template[type:emanation|distance:5] @Damage[1d8[electricity]] @Check[reflex|dc:19|basic]' } } },
      { name: 'Barrage of Force', type: 'action', system: { description: { value: '@Template[type:burst|distance:10] within 120 feet @Damage[5d4[force]] @Check[reflex|dc:19|basic]' } } },
      { name: 'Arcane Prepared Spells', type: 'spellcastingEntry', system: { tradition: { value: 'arcane' }, spelldc: { value: 15, dc: 22 } } },
    ];
    const card = cardFromActor(actor);
    expect(card.sheet).toMatchObject({ battleName: 'Sparking Wands', salvoName: 'Barrage of Force', spellAttack: 15, spellDc: 22 });
    expect(deriveStats(card)).toMatchObject({ strike: 9, volley: 9, spellAttack: 15, spellDc: 22 });
    expect(deriveStats(OFFICIAL.find(c => c.name === actor.name)!)).toMatchObject({ strike: 9, volley: 9, spellAttack: 15, spellDc: 22 });
  });

  it('grants no Volley from spellcasting or ranged spell items', () => {
    const actor = troopActor();
    actor.items = [battleAction(19),
      { type: 'spellcastingEntry', system: { tradition: { value: 'arcane' }, spelldc: { value: 15, dc: 22 } } },
      { name: 'Ranged spell', type: 'spell', system: { description: { value: '@Template[type:burst|distance:10] within 120 feet @Damage[5d4[force]] @Check[reflex|dc:22|basic]' } } },
    ];
    expect(deriveStats(cardFromActor(actor))).toMatchObject({ volley: null, reach: null, spellAttack: 15, spellDc: 22 });
  });

  it('reads prepared spell statistics and restores Demoralized only on prepared values', () => {
    const raw: TroopItem = { type: 'spellcastingEntry', system: { spelldc: { value: 15, dc: 22 } } };
    expect(cardFromActor(troopActor([raw, demoralized(2)])).sheet).toMatchObject({ spellAttack: 15, spellDc: 22 });
    const prepared = { ...raw, statistic: { check: { mod: 15 }, dc: { value: 22 } } };
    expect(cardFromActor(troopActor([prepared, demoralized(2)])).sheet).toMatchObject({ spellAttack: 17, spellDc: 24 });
  });

  it('keeps a single entry’s attack/DC pair in the selected tradition', () => {
    const entry = (tradition: string, value: number, dc: number): TroopItem => ({ type: 'spellcastingEntry', system: { tradition: { value: tradition }, spelldc: { value, dc } } });
    const card = cardFromActor(troopActor([entry('divine', 24, 32), entry('divine', 27, 35), entry('arcane', 30, 40)]));
    expect(card).toMatchObject({ tradition: 'divine', sheet: { spellAttack: 27, spellDc: 35 } });
  });

  it('keeps the fallback for innate entries with no source attack statistic', () => {
    const card = cardFromActor(troopActor([{ type: 'spellcastingEntry', system: { spelldc: { value: 0, dc: 24 } } }]));
    expect(card.sheet!.spellAttack).toBeUndefined();
    expect(deriveStats(card)).toMatchObject({ spellAttack: 11, spellDc: 24 });
  });

  it.each(['arcane', 'divine', 'occult', 'primal'] as const)('imports an explicit %s tradition', tradition => {
    const card = cardFromActor(troopActor([{ type: 'spellcastingEntry', name: 'Spellcasting', system: { tradition: { value: tradition } } }]));
    expect(card).toMatchObject({ caster: true, tradition });
  });
  it('reads a named spellcasting tradition when the structured field is absent', () => {
    expect(cardFromActor(troopActor([{ type: 'spellcastingEntry', name: 'Primal Innate Spells' }])).tradition).toBe('primal');
  });
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

  it('reads the Battle and the Salvo off a published troop that labels neither', () => {
    const action = (name: string, html: string): TroopItem => ({ name, type: 'action', system: { description: { value: html } } });
    const published = { ...troopActor(), items: [
      action('Clash of Steel', 'Each enemy in a @Template[type:emanation|distance:5] takes @Damage[2d8[slashing]] (@Check[reflex|dc:24|basic]).'),
      action('Fire Crossbows!', 'A @Template[type:burst|distance:10] within 120 feet takes @Damage[2d8[piercing]] (@Check[reflex|dc:22|basic]).'),
      action('Hurl Javelins', 'Each creature within 30 feet takes @Damage[1d6[piercing]] (@Check[reflex|dc:26|basic]).'),
      action('War Cry', 'Each enemy in a @Template[type:cone|distance:60] attempts a @Check[will|dc:30] save.'),
    ] };
    expect(cardFromActor(published).sheet).toMatchObject({ battleDc: 24, salvoDc: 22, salvoFeet: 120 });
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

describe('location-dependent fortification import', () => {
  it('prepares a temporary actor without the fort effect, retaining other circumstance sources', () => {
    const effect: TroopItem = { type: 'effect', name: 'Fortification', system: { slug: 'fortification' } };
    const guard: TroopItem = { type: 'effect', name: 'Guard', system: { slug: 'guard' } };
    const actor = troopActor([effect, guard]);
    actor.system!.attributes!.ac!.value = 28;
    let cloned = false;
    actor.clone = (changes, options) => {
      cloned = true;
      expect(options).toEqual({ keepId: true, save: false });
      expect(changes.items).toContain(guard);
      expect(changes.items).not.toContain(effect);
      // PF2e's preparation restores Guard's +2 when the +4 fort effect is removed.
      const temporary = troopActor([guard]);
      temporary.system!.attributes!.ac!.value = 26;
      return temporary;
    };
    expect(cardFromActor(actor).sheet!.ac).toBe(26);
    expect(cloned).toBe(true);
    expect(actor.system!.attributes!.ac!.value).toBe(28);
    expect(actor.items).toContain(effect);
  });
});
