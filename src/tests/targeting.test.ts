import { describe, expect, it } from 'vitest';
import { TargetingService, targetAnchor } from '../app/targeting.js';
import { act, availableActions, createBattle, unit } from '../engine/battle.js';
import { edgeKey, hexGrid, notation, parse } from '../engine/board.js';
import { scriptedRng } from '../engine/rng.js';
import type { ActivityIndex, Tree, Verb } from '../engine/index.js';
import { openBoard } from './helpers.js';

function fixture() {
  const state = createBattle({ board: openBoard('hex'), units: [
    { card: { name: 'Caster', role: 'infantry', level: 6, tactics: [] }, side: 'attacker', square: 'c2' },
    { card: { name: 'Ally', role: 'infantry', level: 6, tactics: [] }, side: 'attacker', square: 'e2' },
    { card: { name: 'Enemy', role: 'infantry', level: 3, tactics: [] }, side: 'defender', square: 'c7' },
  ] });
  const actor = unit(state, 'u0');
  actor.square = parse('e3');
  actor.tradition = 'arcane';
  actor.trees = ['blast', 'movement'];
  unit(state, 'u1').square = parse('d3');
  unit(state, 'u2').square = parse('e5');
  const service = (type: Verb, index: ActivityIndex, tree: Tree | null = null) => {
    const offer = availableActions(state, actor.id).find((o) => o.type === type && o.spell === tree)!;
    return new TargetingService(state, actor, offer, offer.activities[index - 1]);
  };
  return { state, actor, service };
}

describe('targeting service', () => {
  it('keeps overlapping Burst choices explicit and resolves the exact corner and every affected hex', () => {
    const { service } = fixture();
    const targeting = service('cast', 3, 'blast');
    const candidates = targeting.matches({ kind: 'hex', id: 'e5' });
    expect(candidates.length).toBeGreaterThan(1);
    expect(targeting.resolve()).toBeNull();
    const choice = candidates[1];
    expect(choice.geometry).toBe('corner');
    expect(choice.icon).toBe('cast:blast');
    expect(targeting.matches({ kind: 'corner', id: choice.id })).toEqual([choice]);
    const resolution = targeting.resolve(choice.id)!;
    expect(resolution.action.target).toBe(choice.id);
    expect(resolution.effects.map((effect) => effect.cell)).toEqual(choice.cells);
    const point = targetAnchor(choice.anchorCells, (cell) => hexGrid.center(parse(cell), 100))!;
    expect(choice.cells.every((cell) => hexGrid.vertices(parse(cell), 100).some((v) => Math.hypot(v.x - point.x, v.y - point.y) < .001))).toBe(true);
  });

  it('picks edges separately from hexes and preserves the wall target', () => {
    const { state, actor, service } = fixture();
    const edge = edgeKey(actor.square, parse('f3'));
    state.board.walls[edge] = { tier: 1, boxes: 2, remaining: 2 };
    const targeting = service('fight', 1);
    expect(targeting.matches({ kind: 'hex', id: 'e3' })).toEqual([]);
    expect(targeting.matches({ kind: 'edge', id: 'f3|e3' })).toHaveLength(1);
    expect(targeting.resolve(edge)!.action.target).toBe(edge);
    expect(targeting.choices[0].anchorCells).toEqual(['e3', 'f3']);
    expect(targeting.arrows([], null, 'f3|e3')).toEqual(targeting.arrows([], edge));
  });

  it('places Translocate at the selected destination and applies its effect there', () => {
    const { state, service } = fixture();
    const targeting = service('cast', 3, 'movement');
    const choice = targeting.choices.find((target) => target.id === 'd3+d4')!;
    expect(choice.geometry).toBe('hex');
    expect(choice.anchorCells).toEqual(['d4']);
    expect(targeting.matches({ kind: 'hex', id: 'd3' }).length).toBeGreaterThan(1);
    const resolution = targeting.resolve(choice.id)!;
    expect(resolution.effects).toEqual([{ cell: 'd4', tree: 'movement', from: 'e3' }]);
    const next = act(state, resolution.action, scriptedRng([10]));
    expect(notation(unit(next, 'u1').square)).toBe('d4');
    expect(notation(unit(next, 'u0').square)).toBe('e3');
  });

  it('uses Rally feedback for the actor and named ally and rejects an invalid target', () => {
    const { service } = fixture();
    const targeting = service('rally', 2);
    expect(targeting.resolve('u2')).toBeNull();
    const resolution = targeting.resolve('u1')!;
    expect(resolution.action).toMatchObject({ type: 'rally', activity: 2, target: 'u1' });
    expect(resolution.markers.map((marker) => marker.anchorCells[0])).toEqual(['e3', 'd3']);
    expect(resolution.markers.every((marker) => marker.icon === 'rally')).toBe(true);
    expect(resolution.effects).toEqual([]);
  });

  it('selects a healing group on unit hexes and marks each recipient', () => {
    const { state, actor, service } = fixture();
    actor.tradition = 'divine';
    actor.trees = ['healing'];
    state.units.push({ ...unit(state, 'u1'), id: 'u3', square: parse('f3') });
    const targeting = service('cast', 3, 'healing');
    expect(targeting.surface().map((marker) => marker.anchorCells)).toEqual([['e3'], ['d3'], ['f3']]);
    const first = targeting.pickCell('e3')!;
    expect(first.target).toBeNull();
    const second = targeting.pickCell('d3', first.selected)!;
    expect(second.target).toBeNull();
    expect(targeting.surface(second.selected).filter((marker) => marker.selected)).toHaveLength(2);
    const last = targeting.pickCell('f3', second.selected)!;
    const resolution = targeting.resolve(last.target!.id)!;
    expect(resolution.markers.map((marker) => marker.anchorCells)).toEqual([['e3'], ['d3'], ['f3']]);
    expect(targeting.pickCell('e3', first.selected)!.selected).toEqual([]);
    expect(targeting.pickCell('e5')).toBeNull();
  });

  it('requires an explicit Translocate source before showing its destination surface', () => {
    const { service } = fixture();
    const targeting = service('cast', 3, 'movement');
    expect(targeting.surface().map((marker) => marker.anchorCells[0]).sort()).toEqual(['d3', 'e3']);
    expect(targeting.pickCell('d4')).toBeNull();
    const source = targeting.pickCell('d3')!;
    expect(source.target).toBeNull();
    expect(targeting.surface(source.selected).some((marker) => marker.anchorCells[0] === 'd4')).toBe(true);
    expect(targeting.pickCell('d4', source.selected)!.target!.id).toBe('d3+d4');
  });

  it('exposes board targets and the matching icon for every available spell activity', () => {
    const { state, actor, service } = fixture();
    state.units.push({ ...unit(state, 'u1'), id: 'u3', square: parse('f3') });
    unit(state, 'u2').square = parse('g3');
    const traditions = { blast: 'arcane', healing: 'divine', controlling: 'occult', offense: 'occult', defense: 'divine', movement: 'arcane' } as const;
    for (const tree of Object.keys(traditions) as Tree[]) {
      actor.tradition = traditions[tree];
      actor.trees = [tree];
      for (const index of [1, 2, 3] as const) {
        const targeting = service('cast', index, tree);
        expect(targeting.activity.legal, `${tree} ${index}`).toBe(true);
        expect(targeting.surface().length).toBeGreaterThan(0);
        expect(targeting.surface().every((marker) => marker.icon === `cast:${tree}`)).toBe(true);
        const target = targeting.choices[0];
        const resolution = targeting.resolve(target.id)!;
        expect(resolution.action).toMatchObject({ type: 'cast', spell: tree, activity: index, target: target.id });
        expect(resolution.effects.every((effect) => effect.tree === tree)).toBe(true);
        expect(resolution.arrows.length).toBeGreaterThan(0);
        expect(resolution.arrows.every((arrow) => arrow.tone === tree)).toBe(true);
      }
    }
  });


  it('aims at intermediate surface picks and retains arrows to selected healing recipients', () => {
    const { actor, service } = fixture();
    const movement = service('cast', 3, 'movement');
    expect(movement.arrows([], 'hex:d3')).toEqual([{ from: 'e3', to: 'd3', toCells: ['d3'], tone: 'movement' }]);
    expect(movement.arrows(['d3'], 'hex:d4')).toEqual([{ from: 'd3', to: 'd4', toCells: ['d4'], tone: 'movement' }]);
    expect(movement.arrows(['d3'], null, 'd4')).toEqual(movement.arrows(['d3'], 'hex:d4'));
    expect(movement.arrows([], null, 'd4')).toEqual([]);
    actor.tradition = 'divine';
    actor.trees = ['healing'];
    const healing = service('cast', 2, 'healing');
    expect(healing.arrows(['d3'], 'hex:e3').map((arrow) => arrow.to).sort()).toEqual(['d3', 'e3']);
    expect(healing.arrows(['d3'])).toEqual([{ from: 'e3', to: 'd3', toCells: ['d3'], tone: 'healing' }]);
    expect(service('rally', 2).arrows([], 'u1')[0].tone).toBe('rally');
  });

  it('previews a shot from a hovered hex before a target is selected', () => {
    const { state, service } = fixture();
    unit(state, 'u0').stats.volley = 11;
    unit(state, 'u0').stats.reach = 'medium';
    const shooting = service('shoot', 1);
    expect(shooting.arrows([], null, 'e5')).toEqual([
      { from: 'e3', to: 'e5', toCells: ['e5'], tone: 'shoot' },
    ]);
    expect(shooting.arrows([], null, 'd3')).toEqual([]);
    expect(shooting.resolve()).toBeNull();
  });

});
