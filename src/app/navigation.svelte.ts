import type { Side } from '../engine/index.js';
import type { CommandResult } from '../runtime/commands.js';
import { endBattle, game, loadBattle, resetSetup, sideReady, startBattle } from './game.svelte.js';

/** Which panel is open. The record keeps the lifecycle stage; which setup tab a client looks
 * at is local to that client and never reaches the executor. */
export type Stage = 'board' | 'paint' | 'attackers' | 'defenders' | 'battle';

const STAGES: Stage[] = ['board', 'paint', 'attackers', 'defenders', 'battle'];

/** The side each deployment stage edits. */
export const STAGE_SIDE: Partial<Record<Stage, Side>> = { attackers: 'attacker', defenders: 'defender' };

/** A reload resumes at the first unfinished stage: the old save named a tab, and the record
 * that replaced it does not. */
function openingStage(): Stage {
  if (game.battle) return 'battle';
  if (!game.setup.board) return 'board';
  return sideReady('attacker') ? 'defenders' : 'attackers';
}

export const nav = $state({ stage: openingStage() });

export function next() {
  const i = STAGES.indexOf(nav.stage);
  if (i < STAGES.length - 2) nav.stage = STAGES[i + 1];
}

export function back() {
  const i = STAGES.indexOf(nav.stage);
  if (i > 0) nav.stage = STAGES[i - 1];
}

/** Jump straight to any setup stage, not just the adjacent one `next`/`back` reach — the rail's
 * step buttons use this so switching between board/paint/attackers/defenders during setup
 * doesn't cost a walk back through every stage in between. `battle` isn't a valid target:
 * it's reached only through `beginBattle`, once both sides are ready. */
export function goToStage(stage: Stage) {
  if (stage === 'battle' || (stage !== 'board' && !game.setup.board)) return;
  nav.stage = stage;
}

/** Each of the three below moves the tab once the authority has accepted the transition, so a
 * refused command leaves the player looking at the stage they are still on. */
export async function beginBattle(): Promise<CommandResult> {
  const result = await startBattle();
  if (result.ok) nav.stage = 'battle';
  return result;
}

export async function leaveBattle(): Promise<CommandResult> {
  const result = await endBattle();
  if (result.ok) nav.stage = 'attackers';
  return result;
}

export async function resetToExample(): Promise<CommandResult> {
  const result = await resetSetup();
  if (result.ok) nav.stage = 'board';
  return result;
}

/** A loaded save can land at any stage; the read store has already adopted it by the time this
 * resolves, so `openingStage` reads the record it landed on rather than the one it replaced. */
export async function loadSave(slot: string): Promise<CommandResult> {
  const result = await loadBattle(slot);
  if (result.ok) nav.stage = openingStage();
  return result;
}

export interface ForwardStep {
  label: string;
  enabled: boolean;
  /** The command the step submits, or null when it only turns the page. */
  go: () => Promise<CommandResult> | null;
}

/** What the rail's forward button does and says on the current stage. */
export function forward(): ForwardStep {
  const page = () => { next(); return null; };
  if (nav.stage === 'board') return { label: 'Next: paint', enabled: !!game.setup.board, go: page };
  if (nav.stage === 'paint') return { label: 'Next: the attacking force', enabled: !!game.setup.board, go: page };
  if (nav.stage === 'attackers') return { label: 'Next: the defending force', enabled: sideReady('attacker'), go: page };
  return { label: 'Begin the battle', enabled: sideReady('attacker') && sideReady('defender'), go: beginBattle };
}
