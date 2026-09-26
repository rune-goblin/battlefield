import { abilityDescription, abilitySummary, wallsFor, castCeiling, defenceOf, escapeModifier, fortitudeModifier, MAX_WOUNDS, movementSpeed, ROUTED_AT, TREE_LABEL, CELL_FEET, sourceSpeedLabel, movementRateLabel,
  shootCeiling, shootFloor, shootModifier, shootRangeLabel, spellAttackModifier, spellDcFor, strikeModifier, willModifier,
  type BattleState, type Unit } from '../../engine/index.js';
import { signed } from '../presentation.js';

export interface SheetFigure { label: string; value: string; unit?: string; title: string }
export interface SheetAttack { label: string; value: string; range: string; title: string }
export interface UnitSheetModel {
  label: string;
  caster: { label: string; title: string } | null;
  fortified: { label: string; cover: string } | null;
  abilities: { summary: string; description: string }[];
  absorbs: boolean;
  review: { label: string; reason: string }[];
  vitals: SheetFigure[];
  movement: string[] | null;
  attacks: SheetAttack[];
  checks: SheetFigure[];
}

const ROLL_NOTE = 'Roll 1d20 plus this bonus. Target, height, range and action modifiers apply when choosing an attack.';
const sourceName = (name?: string) => name?.replace(/\s*\[(Battle|Salvo)\]/g, '');

export function unitSheet(battle: BattleState, unit: Unit): UnitSheetModel {
  const fort = unit.status === 'active' ? wallsFor(battle.board).fortifiedAt(unit.square) : null;
  const spellRanges = unit.trees.map(tree => `${TREE_LABEL[tree]}: ${castCeiling(battle, tree)} hexes`).join(' · ');

  const attacks: SheetAttack[] = [];
  if (unit.stats.strike !== null) attacks.push({
    label: sourceName(unit.attackSources?.strike) ?? 'Melee', value: signed(strikeModifier(battle, unit, unit)),
    range: 'Adjacent', title: ROLL_NOTE,
  });
  if (unit.stats.volley !== null) attacks.push({
    label: sourceName(unit.attackSources?.volley) ?? 'Shoot', value: signed(shootModifier(battle, unit)),
    range: `${shootFloor(battle, unit)}–${shootCeiling(battle, unit)} hexes`, title: `${ROLL_NOTE} ${shootRangeLabel(battle, unit)}`,
  });
  if (unit.stats.spellAttack !== null) attacks.push({
    label: 'Spell attack', value: signed(spellAttackModifier(unit)),
    range: unit.trees.includes('blast') ? `Blast ${castCeiling(battle, 'blast')} hexes` : 'By spell', title: `${ROLL_NOTE} ${spellRanges}`,
  });

  const checks: SheetFigure[] = [
    { label: 'Fort', value: signed(fortitudeModifier(unit)), title: 'Fortitude save' },
    { label: 'Reflex', value: signed(escapeModifier(unit)), title: 'Reflex save, and the roll to leave a zone of control' },
    { label: 'Will', value: signed(willModifier(unit)), title: 'Will save and Rally checks' },
    { label: 'Perception', value: signed(unit.stats.perception), title: 'Base Perception' },
  ];
  if (unit.stats.spellDc !== null) checks.push({ label: 'Spell DC', value: String(spellDcFor(unit)), title: "DC for enemies resisting this unit's spells" });

  return {
    label: `${unit.name} stats`,
    caster: unit.tradition ? { label: `${unit.tradition[0].toUpperCase() + unit.tradition.slice(1)} caster`, title: spellRanges } : null,
    fortified: fort ? { label: fort.label, cover: `+${fort.cover}${fort.maxCover !== fort.cover ? `–${fort.maxCover}` : ''} ranged cover` } : null,
    abilities: (unit.abilities ?? []).map(ability => ({ summary: abilitySummary(ability), description: abilityDescription(ability) })),
    absorbs: !!unit.abilityState?.buffer,
    review: (unit.abilityReview ?? []).map(note => ({ label: note.label, reason: note.reason })),
    vitals: [
      { label: 'Move', value: String(movementSpeed(unit) / CELL_FEET), unit: ' hexes', title: 'Maximum distance per Move; each step uses the fastest legal movement mode.' },
      { label: 'AC', value: String(defenceOf(battle, unit, null, false)), title: 'Current armor class, including conditions and terrain. Cover against a ranged attacker can add protection.' },
      { label: 'Health', value: String(MAX_WOUNDS - unit.wounds), unit: `/${MAX_WOUNDS}`, title: 'Health remaining' },
      { label: 'Morale', value: String(Math.max(0, ROUTED_AT - unit.disorder)), unit: `/${ROUTED_AT}`, title: 'Morale remaining. Lost morale reduces rolls and armor class.' },
    ],
    movement: unit.sourceSpeed
      ? [`Army Speed: ${sourceSpeedLabel(unit.sourceSpeed)}`, ...(unit.movementRates ? [movementRateLabel(unit.movementRates)] : [])]
      : null,
    attacks,
    checks,
  };
}
