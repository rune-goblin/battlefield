import {
  ENGINES, FEATURES, HEX_TERRAINS, MAX_LEVEL, MAX_WOUNDS, SIDES, TRADITIONS, generateBoard,
  type BoardSpec, type Reach, type Role, type Side, type UnitCard,
} from '../engine/index.js';
import type { BattleCommand, CommandResult, RejectionReason } from './commands.js';
import { freshControl, isGmSide, type GmSide } from './control.js';
import {
  freshSession, newBattleId, newEquipmentId, newUnitId,
  type BattleSession, type ImportBaseline, type SetupUnit, type SourceBinding,
} from './session.js';

/** One unit a campaign sends to the field: its card, the army it joins, the engines riding
 * with it, and where it came from. The ID is minted here, so a caller names none. */
export interface BattleRequestUnit {
  card: UnitCard;
  side: Side;
  /** The campaign's name for whoever leads this unit, shown to the GM confirming the sides. */
  faction?: string;
  /** Engines riding with this unit, by the name they carry in `ENGINES`. */
  equipment?: string[];
  /** Absent for a unit with no campaign record behind it. */
  source?: UnitSource;
}

/** The actor a unit was imported from and what it read there. The UUID and the campaign's own
 * ID stay outside the rules model; the baseline is what the writeback compares against. */
export interface UnitSource {
  actorUuid: string;
  campaignId?: string;
  baseline: ImportBaseline;
}

/** An engine holding a square of its own rather than riding with a unit. */
export interface BattleRequestEngine {
  engine: string;
  side: Side;
}

/** What a campaign hands over to start a battle. */
export interface BattleRequest {
  board: BoardSpec;
  units: BattleRequestUnit[];
  emplacements?: BattleRequestEngine[];
  roundsPerDay?: number;
  /** The army the GM plays; every other user at the table takes the other. `both` seats the
   * GM alone. */
  // proto: the default is the defender, since a campaign's own army is the one that marched
  // here. Reserved for review with the rest of the import defaults.
  gmSide?: GmSide;
}

export type CreateBattleRefusal = RejectionReason | 'invalid';

export type CreateBattleResult =
  | { ok: true; battleId: string; revision: number }
  | { ok: false; reason: CreateBattleRefusal; message: string; problems: string[] };

const ROLES: Role[] = ['infantry', 'cavalry'];
const REACHES: Reach[] = ['short', 'medium', 'long', 'extreme'];
const SIZES = [9, 11];

const named = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const counted = (value: unknown, least = 0): value is number =>
  Number.isInteger(value) && (value as number) >= least;

function boardProblems(spec: unknown): string[] {
  const s = spec as BoardSpec | null;
  if (!s || typeof s !== 'object') return ['the request carries no board spec'];
  const out: string[] = [];
  if (!HEX_TERRAINS.includes(s.base)) out.push(`${String(s.base)} is not a hex terrain`);
  if (!Number.isFinite(s.seed)) out.push('the board spec needs a numeric seed');
  if (s.size !== undefined && !SIZES.includes(s.size)) out.push(`a board is 9 or 11 squares, not ${String(s.size)}`);
  if (s.feature !== undefined && !FEATURES.includes(s.feature)) out.push(`${String(s.feature)} is not a board feature`);
  if (s.grid !== undefined && s.grid !== 'square' && s.grid !== 'hex') out.push(`${String(s.grid)} is not a grid`);
  const construction = s.construction;
  if (construction !== undefined && construction !== null
    && !(construction.kind === 'fort' && counted(construction.tier) && construction.tier <= 4)) out.push('a construction is a fort at tier 0–4');
  return out;
}

/** The card fields a rule reads through a table or a closed vocabulary. An unknown tactic or
 * signal is inert by design, so it passes; a bad role or level would reach a lookup. */
function cardProblems(card: unknown, at: string): string[] {
  const c = card as UnitCard | null;
  if (!c || typeof c !== 'object') return [`${at} carries no card`];
  const out: string[] = [];
  if (!named(c.name)) out.push(`${at} has no name`);
  if (!Number.isInteger(c.level) || c.level < -1 || c.level > MAX_LEVEL) {
    out.push(`${at} is level ${String(c.level)}, outside -1 to ${MAX_LEVEL}`);
  }
  if (!ROLES.includes(c.role)) out.push(`${at} is a ${String(c.role)}, which is no role`);
  if (c.salvo !== undefined && c.salvo !== null && !REACHES.includes(c.salvo)) {
    out.push(`${at} has salvo reach ${String(c.salvo)}`);
  }
  if (c.tradition !== undefined && !TRADITIONS.includes(c.tradition)) {
    out.push(`${at} casts from ${String(c.tradition)}, which is no tradition`);
  }
  if (c.wounds !== undefined && (!counted(c.wounds) || c.wounds > MAX_WOUNDS)) {
    out.push(`${at} carries ${String(c.wounds)} wounds, outside 0 to ${MAX_WOUNDS}`);
  }
  // Disorder above the rout mark is capped rather than refused: the campaign's Demoralized
  // track runs on its own and the engine takes the top of it.
  if (c.disorder !== undefined && !counted(c.disorder)) out.push(`${at} carries ${String(c.disorder)} disorder`);
  return out;
}

function sourceProblems(source: unknown, at: string): string[] {
  const s = source as UnitSource | null;
  if (s === undefined || s === null) return [];
  if (typeof s !== 'object') return [`${at} has a malformed source`];
  const out: string[] = [];
  if (!named(s.actorUuid)) out.push(`${at} binds to no actor`);
  if (s.campaignId !== undefined && !named(s.campaignId)) out.push(`${at} has a malformed campaign ID`);
  const baseline = s.baseline as ImportBaseline | null;
  if (!baseline || typeof baseline !== 'object') out.push(`${at} carries no import baseline`);
  else {
    if (!counted(baseline.hitPoints)) out.push(`${at} baselines ${String(baseline.hitPoints)} hit points`);
    if (!counted(baseline.maxHitPoints, 1)) out.push(`${at} baselines ${String(baseline.maxHitPoints)} maximum hit points`);
    if (!counted(baseline.demoralized)) out.push(`${at} baselines ${String(baseline.demoralized)} Demoralized`);
  }
  return out;
}

function unitProblems(entry: unknown, index: number): string[] {
  const at = `unit ${index}`;
  const u = entry as BattleRequestUnit | null;
  if (!u || typeof u !== 'object') return [`${at} is not a unit`];
  const out = [...cardProblems(u.card, at), ...sourceProblems(u.source, at)];
  if (!SIDES.includes(u.side)) out.push(`${at} is on no side`);
  if (u.faction !== undefined && !named(u.faction)) out.push(`${at} has a malformed faction name`);
  const equipment = u.equipment ?? [];
  if (!Array.isArray(equipment)) out.push(`${at} has a malformed equipment list`);
  else for (const name of equipment) {
    if (!ENGINES.some((e) => e.name === name)) out.push(`${String(name)} is not an engine`);
  }
  return out;
}

/** Every reason this request cannot start a battle. Empty means it can. */
export function battleRequestProblems(request: unknown): string[] {
  const r = request as BattleRequest | null;
  if (!r || typeof r !== 'object') return ['the request is not an object'];
  const out = boardProblems(r.board);
  if (!Array.isArray(r.units) || r.units.length === 0) out.push('the request names no units');
  else r.units.forEach((u, i) => out.push(...unitProblems(u, i)));
  const emplacements = r.emplacements ?? [];
  if (!Array.isArray(emplacements)) out.push('the emplacement list is malformed');
  else emplacements.forEach((e, i) => {
    if (!e || typeof e !== 'object') out.push(`emplacement ${i} is not an engine`);
    else {
      if (!ENGINES.some((x) => x.name === e.engine)) out.push(`${String(e.engine)} is not an engine`);
      if (!SIDES.includes(e.side)) out.push(`emplacement ${i} is on no side`);
    }
  });
  if (r.roundsPerDay !== undefined && !counted(r.roundsPerDay, 1)) {
    out.push(`${String(r.roundsPerDay)} is no count of rounds in a day`);
  }
  if (r.gmSide !== undefined && !isGmSide(r.gmSide)) out.push(`the GM plays no side called ${String(r.gmSide)}`);
  return out;
}

/**
 * A validated request as a session in setup: the ground generated from the spec, every unit
 * off the board with an ID of its own, and the source bindings beside the record rather than
 * inside the rules model. A malformed request throws, so the commit path refuses it.
 */
export function sessionFromRequest(request: BattleRequest, battleId = newBattleId()): BattleSession {
  const problems = battleRequestProblems(request);
  if (problems.length) throw new Error(problems.join('; '));
  const units: SetupUnit[] = [];
  const sources: SourceBinding[] = [];
  for (const entry of request.units) {
    const id = newUnitId();
    units.push({
      id,
      card: structuredClone(entry.card),
      side: entry.side,
      square: null,
      engines: (entry.equipment ?? []).map((name) => ({ id: newEquipmentId(), name })),
      ...(entry.faction === undefined ? {} : { faction: entry.faction }),
    });
    if (entry.source) sources.push({ unitId: id, ...structuredClone(entry.source) });
  }
  const spec = structuredClone(request.board);
  return {
    ...freshSession(battleId),
    // An imported battle opens on a real table rather than the browser's hot seat: the GM takes
    // one army and every other user takes the other, which the host seats as it installs this.
    control: freshControl(request.gmSide ?? 'defender'),
    setup: {
      spec,
      // proto: the caller describes the ground and names no squares, so the field is drawn
      // here and every piece arrives off the board for the table to deploy. Reserved.
      board: generateBoard(spec),
      units,
      emplacements: (request.emplacements ?? []).map((e) => ({
        id: newEquipmentId(), name: e.engine, side: e.side, square: null,
      })),
      ...(request.roundsPerDay === undefined ? {} : { roundsPerDay: request.roundsPerDay }),
    },
    sources,
  };
}

/** Bindings follow their units: one removed from the draft, or a draft thrown away, takes its
 * binding with it, so nothing is written back for a unit that never fought. */
export function pruneSources(session: BattleSession): BattleSession {
  if (!session.sources.length) return session;
  const ids = new Set([
    ...session.setup.units.map((u) => u.id),
    ...(session.battle?.units ?? []).map((u) => u.id),
  ]);
  const sources = session.sources.filter((s) => ids.has(s.unitId));
  return sources.length === session.sources.length ? session : { ...session, sources };
}

/**
 * The campaign seam. The request is validated before anything is sent, the battle ID is minted
 * here so the caller can record it whatever the authority does with the command, and one
 * command installs the record.
 */
export async function createBattleThrough(
  submit: (command: BattleCommand) => Promise<CommandResult>, request: BattleRequest,
): Promise<CreateBattleResult> {
  const problems = battleRequestProblems(request);
  if (problems.length) return { ok: false, reason: 'invalid', message: problems.join('; '), problems };
  const battleId = newBattleId();
  const result = await submit({ type: 'session.install', battleId, request });
  return result.ok
    ? { ok: true, battleId, revision: result.revision }
    : { ok: false, reason: result.reason, message: result.message, problems: [] };
}
