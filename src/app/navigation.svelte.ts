import { SIDES, type Side } from '../engine/index.js';
import type { CommandResult } from '../runtime/commands.js';
import { declaredReady, declareReady, endBattle, game, loadBattle, onRecord, resetSetup, sideReady, startBattle } from './game.svelte.js';
import { viewer } from './viewer.svelte.js';

/** Which panel is open. The record keeps the lifecycle stage; which setup tab a client looks
 * at is local to that client and never reaches the executor. */
export type Stage = 'board' | 'paint' | 'siege' | 'sides' | 'attackers' | 'defenders' | 'summary' | 'battle';
export type SetupStage = Exclude<Stage, 'battle'>;

/** The wizard's steps, in order. The rail, the router, and Next/Back all read this one table. */
export const STEPS: { id: SetupStage; label: string; hint: string }[] = [
  { id: 'board', label: 'Battlefield', hint: 'Ground, size, and walls' },
  { id: 'paint', label: 'Paint the map', hint: 'Terrain, heights, and gates' },
  { id: 'siege', label: 'Siege engines', hint: 'Emplaced engines for both armies' },
  // proto: shown for every battle. A hand-built one has little to confirm; reserved for review
  // once imported battles are in play.
  { id: 'sides', label: 'Sides', hint: 'Confirm who attacks and who defends' },
  { id: 'defenders', label: 'Defending army', hint: 'Deploy first' },
  { id: 'attackers', label: 'Attacking army', hint: 'Deploy after seeing the defenders' },
  { id: 'summary', label: 'Review and begin', hint: 'Check both armies and the field' },
];

const STAGES: Stage[] = [...STEPS.map((s) => s.id), 'battle'];

/** The side each deployment stage edits. */
export const STAGE_SIDE: Partial<Record<Stage, Side>> = { attackers: 'attacker', defenders: 'defender' };

/** A reload resumes at the first unfinished stage: the old save named a tab, and the record
 * that replaced it does not. */
function openingStage(): Stage {
  if (game.battle) return 'battle';
  if (!game.setup.board) return 'board';
  if (!sideReady('defender')) return 'defenders';
  return sideReady('attacker') ? 'summary' : 'attackers';
}

/** Steps the GM has been through in this pass of the wizard; a resumed session counts the
 * steps before its opening stage. */
const stepsThrough = (stage: Stage): Stage[] => STAGES.slice(0, STAGES.indexOf(stage) + 1);

const opening = openingStage();
export const nav = $state({ stage: opening, visited: stepsThrough(opening) });

function enter(stage: Stage, restart = false) {
  nav.stage = stage;
  if (restart) nav.visited = stepsThrough(stage);
  else if (!nav.visited.includes(stage)) nav.visited.push(stage);
}

/** An imported battle arrives with its armies sorted by a guess, which the GM confirms first. */
const awaitsSides = (): boolean => !!game.setup.board
  && game.setup.units.some((u) => u.faction !== undefined) && game.setup.units.every((u) => u.square === null);

// Another client's command, or another module's, can replace the battle or start and end it,
// and no local call moves this tab then.
let followed = game.battleId;
onRecord(() => {
  const replaced = game.battleId !== followed;
  followed = game.battleId;
  if (game.battle) { if (nav.stage !== 'battle') enter('battle'); }
  else if (replaced) enter(awaitsSides() ? 'sides' : openingStage(), true);
  else if (nav.stage === 'battle') enter(openingStage(), true);
});

export function next() {
  const i = STAGES.indexOf(nav.stage);
  if (i < STAGES.length - 2 && !stageReason(STAGES[i + 1] as SetupStage)) enter(STAGES[i + 1]);
}

export function back() {
  const i = STAGES.indexOf(nav.stage);
  const previous = STEPS.slice(0, i).reverse().find((step) => !stageReason(step.id));
  if (previous) enter(previous.id);
}

/** The attacker deploys against the defender's complete formation. */
export function stageReason(stage: SetupStage): string | null {
  if (stage !== 'board' && !game.setup.board) return 'Generate a battlefield first';
  if (stage === 'attackers' && !sideReady('defender')) return 'Place every defender first';
  return null;
}

/** Jump straight to an available setup stage, beyond the adjacent ones `next`/`back` reach. `battle`
 * isn't a valid target: it's reached only through `beginBattle`. */
export function goToStage(stage: Stage) {
  if (stage === 'battle' || stageReason(stage)) return;
  enter(stage);
}

/** Each of the three below moves the tab once the authority has accepted the transition, so a
 * refused command leaves the player looking at the stage they are still on. */
export async function beginBattle(): Promise<CommandResult> {
  // The summary step is the one confirmation: beginning from it gives both armies' word. A
  // seated player has already given theirs from the same step.
  for (const side of SIDES) {
    if (declaredReady(side)) continue;
    const declared = await declareReady(side, true);
    if (!declared.ok) return declared;
  }
  const result = await startBattle();
  if (result.ok) enter('battle');
  return result;
}

export async function leaveBattle(): Promise<CommandResult> {
  const result = await endBattle();
  if (result.ok) enter('board', true);
  return result;
}

export async function resetToExample(): Promise<CommandResult> {
  const result = await resetSetup();
  if (result.ok) enter('board', true);
  return result;
}

/** A loaded save can land at any stage; the read store has already adopted it by the time this
 * resolves, so `openingStage` reads the record it landed on rather than the one it replaced. */
export async function loadSave(slot: string): Promise<CommandResult> {
  const result = await loadBattle(slot);
  if (result.ok) enter(openingStage(), true);
  return result;
}

export interface ForwardStep {
  label: string;
  enabled: boolean;
  /** The command the step submits, or null when it only turns the page. */
  go: () => Promise<CommandResult> | null;
}

/** Whether a step's own work is finished, for the rail's tick. */
export function stepDone(id: SetupStage): boolean {
  if (!game.setup.board || !nav.visited.includes(id)) return false;
  if (id === 'siege') return game.setup.emplacements.every((e) => e.square !== null);
  if (id === 'attackers') return sideReady('attacker');
  if (id === 'defenders') return sideReady('defender');
  if (id === 'summary') return SIDES.every((side) => declaredReady(side));
  return true;
}

/** What the rail's forward button does and says on the current stage. */
export function forward(): ForwardStep {
  const page = () => { next(); return null; };
  const i = STEPS.findIndex((s) => s.id === nav.stage);
  if (nav.stage !== 'summary') {
    const enabled = nav.stage === 'attackers' ? sideReady('attacker')
      : nav.stage === 'defenders' ? sideReady('defender') : !!game.setup.board;
    return { label: 'Next', enabled, go: page };
  }
  const deployed = SIDES.every((side) => sideReady(side));
  if (viewer.isGm) return { label: 'Begin', enabled: deployed, go: beginBattle };
  // proto: a seated player's Begin gives their own army's word; the GM's starts the battle.
  const mine = SIDES.filter((side) => viewer.seatedOn(side));
  return {
    label: mine.every((side) => declaredReady(side)) ? 'Ready — waiting for the GM' : 'My army is ready',
    enabled: deployed && mine.some((side) => !declaredReady(side)),
    go: async () => {
      let result!: CommandResult;
      for (const side of mine) if (!declaredReady(side)) result = await declareReady(side, true);
      return result;
    },
  };
}
