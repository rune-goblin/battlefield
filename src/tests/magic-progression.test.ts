import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { act, activeUnit, availableActions, createBattle, endActivation, refOf, targetKey, unit } from '../engine/index.js';
import { casterTier, spellCeiling, TREES, TRADITIONS, type Tree } from '../engine/magic.js';
import { notation, parse } from '../engine/board.js';
import type { Tradition, UnitCard } from '../engine/cards.js';
import type { ActivityAction, HealingChoice, TargetRef } from '../engine/types.js';
import { scriptedRng } from '../engine/rng.js';
import { TargetingService } from '../app/targeting.js';
import { openBoard } from './helpers.js';
import { createActionResolutionService } from '../services/ActionResolutionService.js';
import { freshSession } from '../runtime/session.js';

const ordinary: UnitCard = { name: 'Troop', level: 6, role: 'infantry', tactics: [], overrides: { defence: 20, will: 10, fortitude: 10 } };
function field(tradition: Tradition = 'arcane', level = 16) {
  const s = createBattle({ board: openBoard('hex'), units: [
    { card: { ...ordinary, name: 'Caster', caster: true, tradition, level, overrides: { spellAttack: 11, spellDc: 21 } }, side: 'attacker', square: 'c2' },
    { card: ordinary, side: 'attacker', square: 'd2' },
    { card: ordinary, side: 'attacker', square: 'e2' },
    { card: ordinary, side: 'defender', square: 'c7' },
    { card: ordinary, side: 'defender', square: 'd7' },
    { card: ordinary, side: 'defender', square: 'e7' },
    { card: ordinary, side: 'defender', square: 'f7' },
  ] });
  ['e3', 'd3', 'f3', 'e5', 'f5', 'f6', 'g6'].forEach((cell, i) => unit(s, `u${i}`).square = parse(cell));
  s.pending = 'attacker'; s.active = 'u0';
  return s;
}
const option = (s: ReturnType<typeof field>, tree: Tree, tier = 4) => availableActions(s, 'u0').find(o => o.spell === tree)!.activities[tier - 1];
const units = (...ids: string[]): TargetRef => ({ kind: 'unit', ids });
const moves = (...pairs: [string, string][]): TargetRef => ({ kind: 'transfer', moves: pairs.map(([unit, to]) => ({ unit, to })) });
const cast = (tree: Tree, target: TargetRef, healingChoices?: Record<string, HealingChoice>): ActivityAction => ({ type: 'cast', unit: 'u0', spell: tree, activity: 4, target, healingChoices });
const noRoll = { d20(): number { throw new Error('unexpected roll'); } };

describe('caster progression', () => {
  it('matches every published tradition row and preserves equal access at level boundaries', () => {
    const html = readFileSync('public/rules.html', 'utf8');
    const roman: Record<string, number> = { '—': 0, I: 1, II: 2, III: 3, IV: 4 };
    for (const tradition of TRADITIONS) {
      const table = html.match(new RegExp(`<table class="matrix" id="${tradition}-ceilings">(.*?)</table>`, 's'))![1];
      const rows = [...table.matchAll(/<tr><th scope="row">.*?<\/tr>/gs)];
      expect(rows).toHaveLength(4);
      rows.forEach((row, band) => {
        const cells = [...row[0].matchAll(/<td>(.*?)<\/td>/g)].map(m => roman[m[1]]);
        for (const level of [band * 5 + 1, band * 5 + 5]) {
          expect(casterTier(level)).toBe(band + 1);
          expect(TREES.map(tree => spellCeiling(tradition, level, tree))).toEqual(cells);
          expect(cells.reduce((a, b) => a + b, 0)).toBe([3, 8, 14, 16][band]);
        }
      });
    }
  });
  it('gives apprentices distinct trees and rejects spells before their unlock without rolling', () => {
    const wizard = field('arcane', 5);
    expect(availableActions(wizard, 'u0').filter(o => o.spell).map(o => o.spell)).toEqual(['blast', 'controlling', 'movement']);
    expect(option(wizard, 'blast', 2).cost).toBeNull();
    expect(() => act(wizard, { ...cast('blast', units('u3')), activity: 2 }, noRoll)).toThrow(/not available/);
    expect(() => act(wizard, { ...cast('healing', units('u1')), activity: 1 }, noRoll)).toThrow(/not available/);
    expect(availableActions(field('divine', 5), 'u0').filter(o => o.spell).map(o => o.spell)).toEqual(['healing', 'offense', 'defense']);
    expect(option(field('arcane', 11), 'healing', 1).cost).toBe(1);
    expect(option(field('arcane', 15), 'blast').cost).toBeNull();
    expect(option(field('arcane', 16), 'blast').cost).toBe(3);
  });
  it('lets an apprentice concentrate a basic spell while limiting spell commitment under Haste', () => {
    const s = field('arcane', 5);
    const next = act(s, { ...cast('blast', units('u3')), activity: 1, focus: 2 }, scriptedRng([10, 20]));
    expect(next.log.find(e => e.text.includes('Missile against'))?.check?.modifier).toBe(15);
    const master = field(); unit(master, 'u0').haste = 2;
    expect(() => act(master, { ...cast('blast', refOf(option(master, 'blast').targets[0])), focus: 1 }, noRoll)).toThrow(/commitment is at most three/);
    expect(() => act(master, { type: 'guard', unit: 'u0', activity: 4 }, noRoll)).toThrow(/not available/);
  });
  it('keeps non-caster tactics at their first spell regardless of troop level', () => {
    const s = createBattle({ board: openBoard(), units: [
      { card: { ...ordinary, level: 20, tactics: ['battlefield-medicine', 'demoralize'] }, side: 'attacker', square: 'c2' },
      { card: ordinary, side: 'defender', square: 'c7' },
    ] });
    expect(availableActions(s, 'u0').filter(o => o.spell).map(o => o.activities.map(a => a.cost))).toEqual([[1, null, null, null], [1, null, null, null]]);
  });
});

describe('mastery spells', () => {
  it('Storm resolves one shared attack against four enemies and spends three actions', () => {
    const s = field(); unit(s, 'u0').haste = 2;
    const target = option(s, 'blast').targets.find(t => t.kind === 'cell' && t.cells.length === 4 && ['e5','f5','f6','g6'].every(cell => t.cells.includes(cell)))!;
    expect(target).toBeDefined();
    const next = act(s, cast('blast', refOf(target)), scriptedRng([10, 20, 20, 20, 20]));
    expect(next.units.slice(3).map(u => u.wounds)).toEqual([1, 1, 1, 1]);
    expect(next.log.filter(e => e.text.includes('Storm against')).map(e => e.check?.roll)).toEqual([10,10,10,10]);
    expect(unit(next, 'u0').attacked).toBe(true);
    expect(unit(next, 'u0').actions).toBe(1);
    expect(() => act(next, { ...cast('blast', units('u3')), activity: 1 }, noRoll)).toThrow(/already attacked/);
    expect(unit(s, 'u3').wounds).toBe(0);
  });
  it.each([[1,3,2],[5,2,2],[11,1,1],[20,0,0]])('Renewal roll %i restores the correct Health and Morale', (die, wounds, disorder) => {
    const s = field('divine');
    unit(s, 'u1').wounds = 3; unit(s, 'u1').disorder = 3;
    const next = act(s, cast('healing',units('u1')), scriptedRng([die]));
    expect([unit(next, 'u1').wounds, unit(next, 'u1').disorder]).toEqual([wounds,disorder]);
  });
  it('Renewal clears the selected conditions in priority order and respects a one-condition success', () => {
    const s = field('divine'); const ally = unit(s,'u1');
    ally.pinnedBy='u3'; ally.exposed=true; ally.frightened=true;
    const choices = { u1: { conditions: ['frightened', 'exposed'] as const } };
    const action = cast('healing',units('u1'),{u1:{conditions:[...choices.u1.conditions]}});
    const success=act(s,action,scriptedRng([11]));
    expect(unit(success,'u1').frightened).toBe(false);
    expect(unit(success,'u1').exposed).toBe(true);
    const critical=act(s,action,scriptedRng([20]));
    expect(unit(critical,'u1').exposed).toBe(false);
    expect(unit(critical,'u1').pinnedBy).toBe('u3');
  });
  it('Terror rolls separate saves for connected enemies without applying Hold or Stun', () => {
    const s=field('occult');
    expect(option(s,'controlling').targets.some(t=>t.id==='u3+u4+u5')).toBe(true);
    expect(option(s,'controlling').targets.some(t=>t.id==='u3+u6')).toBe(false);
    const next=act(s,cast('controlling',units('u3', 'u4', 'u5')),scriptedRng([20,11,1]));
    expect(next.units.slice(3,6).map(u=>[u.disorder,u.frightened,u.stunned,u.rooted])).toEqual([[0,false,false,0],[0,true,false,0],[2,false,false,0]]);
  });
  it('Terror spares a fear-immune target on a success and costs a failed save Morale alone', () => {
    const s=field('occult');
    unit(s,'u3').immuneFear=true;
    const next=act(s,cast('controlling',units('u3', 'u4', 'u5')),scriptedRng([11,11,5]));
    expect(next.units.slice(3,6).map(u=>[u.disorder,u.frightened,u.stunned,u.rooted])).toEqual([[0,false,false,0],[0,true,false,0],[1,false,false,0]]);
    expect(next.log.filter(e=>e.text.includes('is frightened')).map(e=>e.unit)).toEqual(['u4']);
  });
  it('Battle chorus applies Sure strike separately and keeps its normal self-cast expiry', () => {
    const s=field('occult');
    const next=act(s,cast('offense',units('u0', 'u1', 'u2')),noRoll);
    expect(next.units.slice(0,3).map(u=>u.sureStrike)).toEqual([false,true,true]);
    expect(option(s,'offense').targets.some(t=>t.id==='u1')).toBe(true);
  });
  it('Sanctuary protects its caster through the next activation and shares Stoneskin expiry', () => {
    const s=field('divine');
    let next=act(s,cast('defense',units('u0', 'u1')),noRoll);
    expect(next.units.slice(0,2).map(u=>u.stoneskin)).toEqual([true,true]);
    while(activeUnit(next)?.id!=='u0') next=endActivation(next,scriptedRng([10]));
    next=endActivation(next,scriptedRng([10]));
    expect(unit(next,'u0').stoneskin).toBe(false);
  });
  it('publishes a tier-IV spell event and separate saving throw events', () => {
    const before = { ...freshSession(), stage: 'battle' as const, battle: field('occult') };
    const service = createActionResolutionService({ dice: scriptedRng([20, 11, 1]) });
    const action = cast('controlling', units('u3', 'u4', 'u5'));
    const after = service.act(before, action);
    const events = service.events(before, after, action);
    expect(events.filter(e => e.type === 'spellResolved')).toMatchObject([{ activity: 4, tree: 'controlling', targets: ['u3','u4','u5'] }]);
    expect(events.filter(e => e.type === 'checkResolved')).toHaveLength(3);
  });
  it('Gate transfers two units, offers single transfers, and rejects shared or occupied destinations', () => {
    const s=field();
    const offer=availableActions(s,'u0').find(o=>o.spell==='movement')!;
    const target=option(s,'movement').targets.find(t=>t.id===targetKey(moves(['u0','e4'],['u1','d4'])))!;
    expect(target).toBeDefined();
    const targeting=new TargetingService(s,unit(s,'u0'),offer,offer.activities[3]);
    let pick=targeting.pickCell('d3')!;
    pick=targeting.pickCell('d4',pick.selected)!;
    expect(pick.target?.id).toBe(targetKey(moves(['u1','d4'])));
    pick=targeting.pickCell('e3',pick.selected)!;
    pick=targeting.pickCell('e4',pick.selected)!;
    expect(pick.target?.id).toBe(target.id);
    const resolution=targeting.resolve(target.id)!;
    expect(resolution.effects.map(e=>e.cell)).toEqual(['e4','d4']);
    const next=act(s,resolution.action,noRoll);
    expect(next.units.slice(0,2).map(u=>notation(u.square))).toEqual(['e4','d4']);
    expect(next.log.some(e=>e.tag?.kind==='freeStrike')).toBe(false);
    for(const bad of [moves(['u0','e4'],['u1','e4']),moves(['u0','d3']),moves(['u0','e8'])]) expect(()=>act(s,cast('movement',bad),noRoll)).toThrow(/not a target/);
  });
});
