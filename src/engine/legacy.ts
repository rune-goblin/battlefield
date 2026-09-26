import { freshAbilityMemory, validatedAbilities, type TroopAbility } from './abilities.js';
import { fortification, type Board, type BoardSpec } from './board.js';
import { convertSpeed, deriveStats, movementRates, speedOf, type UnitCard } from './cards.js';
import { COMBATANTS } from './combatants.js';
import { OFFICIAL } from './official.js';
import { CELL_FEET } from './path.js';
import { engineKind } from './siege-engines.js';
import { LAST_ROUND, ROUTED_AT, SIDES, type BattleState, type EngineState, type NightRecovery, type Unit } from './types.js';
import { engineCard, engineLoadSteps, refreshEmplacements } from './battle/emplacements.js';

const LEGACY_HOLD_GROUND: TroopAbility = {
  version: 1, key: 'legacy-hold-ground', kind: 'resolve', label: 'No Retreat', delivery: 'passive', mode: 'ground',
};

/** A card from before abilities that carries only the no-retreat signal holds its ground
 * through Resolve. */
export function upgradeCard(card: UnitCard): UnitCard {
  if (!card.abilities && card.signals?.includes('no-retreat')) card.abilities = [{ ...LEGACY_HOLD_GROUND }];
  return card;
}

/** The tier-zero barricade retired into tier 1. */
export function upgradeSpec(spec: BoardSpec): void {
  if (spec.construction?.tier === 0) spec.construction.tier = 1;
}

/** Retire the old tier-zero barricade without restoring a breached wall. */
export function upgradeBoard(board: Board): void {
  upgradeSpec(board.spec);
  for (const wall of Object.values(board.walls)) {
    if (wall.tier !== 0) continue;
    const damage = wall.boxes - wall.remaining;
    wall.tier = 1;
    wall.boxes = fortification(1).boxes;
    if (wall.remaining > 0) wall.remaining = Math.max(0, wall.boxes - damage);
  }
}

/** A speed that matches an older scale of the source Speed takes the current one; Wolf Fang
 * once rolled a fixed hex; half-hex rates round up to the whole hexes new imports use. */
function savedEngineSpeed(e: EngineState): number | null {
  const source = engineCard(e)?.sourceSpeed;
  if (source != null && (e.speed === undefined || e.speed === convertSpeed(source)
    || e.speed === Math.ceil(source / 30) * CELL_FEET || e.speed === Math.ceil(source / 15) * CELL_FEET / 2)) {
    return convertSpeed(source);
  }
  const speed = e.name === 'Wolf Fang' ? CELL_FEET : e.speed !== undefined ? e.speed
    : engineCard(e)?.speed !== undefined ? engineCard(e)!.speed! : (engineKind(e) === 'ram' ? null : 0);
  return speed === null || speed === 0 ? speed : Math.ceil(speed / CELL_FEET) * CELL_FEET;
}

/** Older saves counted full loads rather than load actions; the progress keeps its fraction. */
function savedLoadProgress(e: EngineState): number {
  const total = engineLoadSteps(e);
  if (!total) return 0;
  const previousTotal = e.loadSteps ?? engineCard(e)?.loadSteps ?? total;
  return Math.max(0, Math.min(total, Math.floor((e.loaded ?? previousTotal) * total / Math.max(1, previousTotal))));
}

export function upgradeEngine(e: EngineState): void {
  const speed = savedEngineSpeed(e), loaded = savedLoadProgress(e);
  e.speed = speed;
  e.loadSteps = engineLoadSteps(e);
  e.loaded = loaded;
}

/** Backfill source statistics only when the saved sheet still matches a catalogue card.
 * Preserve custom sheets, explicit overrides and battle statistics that have changed. */
export function upgradeSourceStats(saved: { id: string; card: UnitCard }, unit: Unit | undefined): void {
  const card = saved.card;
  const source = [...COMBATANTS, ...OFFICIAL].find(c => c.name === card.name && c.level === card.level && c.role === card.role);
  if (card.sheet && source?.sheet && Object.entries(card.sheet).every(([key, value]) =>
    JSON.stringify(source.sheet![key as keyof typeof source.sheet]) === JSON.stringify(value))) {
    const before = deriveStats(card);
    card.sheet = { ...source.sheet, ...card.sheet };
    const after = deriveStats(card);
    if (unit) {
      for (const key of ['spellAttack', 'spellDc'] as const) {
        if (unit.stats[key] === before[key]) unit.stats[key] = after[key];
      }
      unit.attackSources ??= {};
      unit.attackSources.strike ??= card.sheet.battleName;
      unit.attackSources.volley ??= card.sheet.salvoName;
    }
  }
  const sheet = card.sheet;
  if (!sheet || !unit) return;
  const previous = unit.movementRates ? Math.max(...Object.values(unit.movementRates))
    : Math.max(1, Math.ceil(sheet.speed / 30)) * CELL_FEET;
  unit.sourceSpeed = { speed: sheet.speed, otherSpeeds: sheet.otherSpeeds?.map(s => ({ ...s })) };
  unit.movementRates = movementRates(card);
  if (unit.speed === previous) {
    unit.speed = speedOf(card);
    if (previous > 0) unit.feet *= unit.speed / previous;
  }
  unit.flying = unit.movementRates.fly > 0;
}

/** Bring a saved battle to the shape the engine reads, keeping its progress. Returns the same
 * object. */
export function upgradeBattle(battle: BattleState): BattleState {
  battle.day ??= 1;
  battle.roundsPerDay ??= LAST_ROUND;
  battle.night ??= null;
  if (Array.isArray(battle.night)) {
    // Before armies rolled separately, one night rolled both at once, so both have had theirs.
    const rolled: NightRecovery[] = battle.night;
    const sideOf = (id: string) => battle.units.find((u) => u.id === id)?.side ?? 'attacker';
    battle.night = Object.fromEntries(SIDES.map((side) => [side, rolled.filter((r) => sideOf(r.unit) === side)]));
  }
  for (const u of battle.units) {
    const legacy = u as Unit & { noRetreat?: boolean; pace?: boolean; fear?: boolean; quality?: number };
    u.abilities = validatedAbilities(u.abilities ?? (legacy.noRetreat ? [LEGACY_HOLD_GROUND] : []));
    u.abilityState ??= freshAbilityMemory(u.wounds);
    delete legacy.noRetreat; delete legacy.pace; delete legacy.fear; delete legacy.quality;
    u.disorder = Math.max(0, Math.min(ROUTED_AT, u.disorder));
    if (u.status === 'active' && u.disorder >= ROUTED_AT) {
      for (const engine of u.engines) if (engine.status === 'crewed') engine.status = 'abandoned';
    }
  }
  upgradeBoard(battle.board);
  if (battle.nextBoard) upgradeBoard(battle.nextBoard);
  for (const field of battle.previousBattlefields ?? []) upgradeBoard(field.board);
  for (const e of [
    ...battle.engines,
    ...battle.units.flatMap((u) => u.engines),
    ...(battle.previousBattlefields ?? []).flatMap((f) => f.engines),
  ]) upgradeEngine(e);
  // An older save can hold an occupied engine still marked abandoned, and no engine read
  // repairs one. The ownership this records is logged as a capture.
  refreshEmplacements(battle);
  return battle;
}
