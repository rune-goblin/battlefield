import { untrack } from 'svelte';
import { canContinueBattle, canRecover, deploymentCells, hasRecovered, isSurvivor, MAX_WOUNDS, nextDayBattlefield, nightResolved, opponent,
  recoveryDc, recoveryModifier, recoveryPenalty, ROUTED_AT, SIDES, suggestDeployment, unitOutcome, unitStatusLabel,
  type BoardSpec, type DayOrder, type NightRecovery, type RecoveryActivity, type RecoveryChoice, type Side, type Unit } from '../engine/index.js';
import type { TokenModel } from '../board/index.js';
import { chooseDayOrder, chooseNextBattlefield, confirmDayOrders, declareDeployment, declareRecovery, game, respondToSurrender, saveBattle, startNextDay } from './game.svelte.js';
import { allSubmitted, submissionOf } from '../runtime/interactions.js';
import { viewer } from './viewer.svelte.js';
import { leaveBattle } from './navigation.svelte.js';
import { commandReporter, COMMAND_NOTICE } from './command-notices.js';
import { signed, unitToken } from './presentation.js';
import type { NotificationService } from './notifications.js';

export type Step = 'report' | 'recovery' | 'orders' | 'battlefield' | 'deployment';
type Choice = RecoveryActivity | '';

export const STEPS: { id: Step; label: string }[] = [
  { id: 'report', label: 'Report' }, { id: 'recovery', label: 'Recovery' },
  { id: 'orders', label: 'Orders' }, { id: 'battlefield', label: 'Battlefield' }, { id: 'deployment', label: 'Deployment' },
];
export const DAY_OPTIONS: { id: DayOrder; label: string; description: string }[] = [
  { id: 'surrender', label: 'Propose surrender', description: 'Ask the opposing side to accept your surrender. Agree the terms together.' },
  { id: 'withdraw', label: 'Withdraw', description: 'Leave the field with your surviving troops. The enemy holds it if they stay.' },
  { id: 'hold', label: 'Hold the field', description: 'Stay to contest the ground. If both armies hold, prepare for another day.' },
];
const RECOVERY_OPTIONS: { id: Choice; label: string; mark: string }[] = [
  { id: '', label: 'None', mark: '' }, { id: 'rally', label: 'Morale', mark: '⚑' }, { id: 'treat', label: 'Health', mark: '♥' },
];

const nightOutcome = (r: NightRecovery) => r.recovered === 0 ? 'fails to recover' : `recovers ${r.recovered} ${r.activity === 'rally' ? 'morale' : 'health'}`;

export function createBattleReport(deps: { notifications: NotificationService }) {
  const { notifications } = deps;
  const attempt = commandReporter(notifications);

  const b = $derived(game.battle!);
  let step = $state<Step>('report');
  let choices = $state<Record<string, Choice>>({});
  let positions = $state<Record<string, string>>({});
  let content: HTMLElement | undefined;

  const resolved = $derived(nightResolved(b));
  const continuing = $derived(canContinueBattle(b));
  const stage = $derived<Step>(!continuing ? 'report' : resolved && step === 'report' ? (b.dayOrders?.confirmed ? 'deployment' : 'orders') : step);
  const title = $derived(stage === 'orders' ? 'Choose your next move' : stage === 'battlefield' ? 'Choose tomorrow’s battlefield' : stage === 'recovery' ? 'Tend to your armies'
    : stage === 'deployment' ? `Deploy for day ${b.day + 1}` : b.endedBy === 'surrender' && b.winner !== null && b.winner !== 'draw' ? `The ${opponent(b.winner)} surrenders.`
    : b.winner === 'draw' ? (b.endedBy === 'dusk' ? 'Dusk. The field is contested.' : b.endedBy === 'withdrawal' ? 'Both armies withdraw.' : 'Both armies are spent.') : `The ${b.winner} holds the field.`);
  const intro = $derived(continuing
    ? (stage === 'orders' ? 'Recovery is complete. Choose an end-of-day decision for each army.' : 'Review the survivors, then recover before choosing your next move.')
    : b.endedBy === 'surrender' ? 'The opponent accepted the surrender. Agree campaign terms together; surviving troops keep their Health and Morale.'
    : b.endedBy === 'withdrawal' ? 'Withdrawal is complete. Surviving troops keep their Health and Morale.' : 'The battle is over. Review the final army report.');

  const surrenderPending = $derived(SIDES.some((side) => b.dayOrders?.choices[side] === 'surrender'));
  const ordersReady = $derived(SIDES.every((side) => !!b.dayOrders?.choices[side]) && !surrenderPending);
  const bothHold = $derived(SIDES.every((side) => b.dayOrders?.choices[side] === 'hold'));
  const ordersStatus = $derived(surrenderPending ? 'Awaiting the opponent’s response to surrender.' : !ordersReady ? 'Choose a decision for both armies.'
    : bothHold ? 'Both armies will hold. Continue to choose the next battlefield.'
    : SIDES.every((s) => b.dayOrders?.choices[s] === 'withdraw') ? 'Both armies will withdraw. The field stays contested.'
    : `The ${b.dayOrders?.choices.attacker === 'withdraw' ? 'defender' : 'attacker'} will hold the field.`);

  const field = $derived(nextDayBattlefield(b));
  const newMap = $derived(!!b.nextBoard);
  const survivors = $derived(b.units.filter(isSurvivor));
  const mapReady = $derived(Object.keys(suggestDeployment(field)).length === survivors.length);
  const deployReady = $derived(allSubmitted(game.interactions, 'nextDay.deployment'));

  const declarations = $derived<RecoveryChoice[]>(Object.entries(choices)
    .filter(([, activity]) => activity !== '').map(([unit, activity]) => ({ unit, activity: activity as RecoveryActivity })));
  const sideOf = (unit: string) => b.units.find((u) => u.id === unit)?.side;
  const declarationsFor = (side: Side) => declarations.filter((c) => sideOf(c.unit) === side);
  const participants = (side: Side) => declarationsFor(side).length;
  const rolled = (side: Side) => hasRecovered(b, side);
  /** Units in the army's night: its declared choices until it rolls, its rolled results after. */
  const recovering = (side: Side) => rolled(side) ? b.night![side]!.length : participants(side);
  const resultOf = (u: Unit) => b.night?.[u.side]?.find((r) => r.unit === u.id);

  /** How many of each army's results the viewer has been shown. An army's rolls arrive in one
   * record; the view then reveals them one unit at a time, with a die tumbling over each. */
  const shown = $state<Record<Side, number>>({ attacker: 0, defender: 0 });
  let tumbling = $state<{ unit: string; face: number } | null>(null);
  const playing = new Set<Side>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const wait = (ms: number) => new Promise<void>((resolve) => {
    const timer = setTimeout(() => { timers.delete(timer); resolve(); }, ms);
    timers.add(timer);
  });
  async function playRolls(side: Side, results: NightRecovery[]) {
    playing.add(side);
    for (let i = shown[side]; i < results.length; i++) {
      for (let tick = 0; tick < 9; tick++) {
        tumbling = { unit: results[i].unit, face: 1 + Math.floor(Math.random() * 20) };
        await wait(55);
      }
      tumbling = null;
      shown[side] = i + 1;
      await wait(450);
    }
    playing.delete(side);
  }
  let seenNight = false;
  $effect(() => {
    for (const side of SIDES) {
      const results = b.night?.[side];
      untrack(() => {
        if (!results) shown[side] = 0;
        // Results already on the record when the report opens were rolled earlier; play only a roll that lands while it is open.
        else if (!seenNight) shown[side] = results.length;
        else if (shown[side] < results.length && !playing.has(side)) void playRolls(side, results);
      });
    }
    seenNight = true;
  });
  $effect(() => { if (resolved) positions = suggestDeployment(field); });

  const survivorsOf = (side: Side) => survivors.filter((u) => u.side === side);
  const placementOf = (side: Side): Record<string, string> =>
    Object.fromEntries(survivorsOf(side).filter((u) => positions[u.id]).map((u) => [u.id, positions[u.id]]));
  const sideDeployReady = (side: Side) => survivorsOf(side).every((u) => positions[u.id] && deploymentCells(field, u).includes(positions[u.id]))
    && new Set(Object.values(placementOf(side))).size === survivorsOf(side).length;
  /** The record holds the cells this army submitted; an edit since then leaves them behind. */
  const deployed = (side: Side) => {
    const held = submissionOf(game.interactions, 'nextDay.deployment', side);
    const local = placementOf(side);
    return !!held && Object.keys(held).length === Object.keys(local).length
      && Object.entries(local).every(([id, cell]) => held[id] === cell);
  };

  const previewTokens = $derived<TokenModel[]>(stage === 'deployment' ? survivors.flatMap((u) => positions[u.id] ? [unitToken(u, positions[u.id])] : []) : []);

  function preview(u: Unit, activity: RecoveryActivity) {
    const terms = recoveryModifier(u, activity, participants(u.side));
    const dc = recoveryDc(b, { unit: u.id, activity });
    return `${terms.save} ${signed(terms.bonus)} − ${terms.missingMorale} missing Morale − ${terms.penalty} recovery = ${signed(terms.total)} vs DC ${dc}`;
  }

  function row(u: Unit) {
    const side = u.side;
    const result = resultOf(u);
    const activity: Choice = rolled(side) ? (result?.activity ?? '') : (choices[u.id] ?? '');
    const revealed = !!result && b.night![side]!.indexOf(result) < shown[side];
    const rolling = tumbling?.unit === u.id;
    return {
      id: u.id, name: u.name, outcome: unitStatusLabel(u), survivor: isSurvivor(u),
      health: `${MAX_WOUNDS - u.wounds}/${MAX_WOUNDS}`, morale: `${ROUTED_AT - u.disorder}/${ROUTED_AT}`,
      activity,
      options: RECOVERY_OPTIONS.map((o) => ({ ...o, barred: o.id !== '' && !canRecover(u, o.id) })),
      idleNote: !canRecover(u, 'rally') && !canRecover(u, 'treat') ? 'At full health and morale.' : 'Choose a recovery activity.',
      preview: activity ? preview(u, activity) : null,
      result, revealed, rolling, face: rolling ? tumbling!.face : null,
      resultText: result ? `${u.name} ${nightOutcome(result)}.` : null,
      checkText: result ? `${result.activity === 'rally' ? 'Rally' : 'Treat Wounded'} · ${result.check.degree.replaceAll('-', ' ')} · ${result.check.roll} ${signed(result.check.modifier)} = ${result.check.total} vs DC ${result.check.dc}` : null,
      pendingText: result ? (result.activity === 'rally' ? 'Rallying…' : 'Treating wounded…') : null,
      cells: stage === 'deployment' ? deploymentCells(field, u).map((cell) => ({
        cell, taken: Object.entries(positions).some(([id, value]) => id !== u.id && value === cell),
      })) : [],
    };
  }

  const finalDecision = (side: Side) => {
    const orders = b.dayOrders;
    if (stage !== 'report' || !orders || !(orders.choices[side] || b.endedBy === 'surrender')) return null;
    return b.endedBy === 'surrender' ? (b.winner === side ? 'Accepted surrender' : 'Surrendered')
      : b.endedBy === 'withdrawal' ? (orders.choices[side] === 'withdraw' ? 'Withdrawn' : 'Holds the field')
      : DAY_OPTIONS.find((o) => o.id === orders.choices[side])?.label ?? null;
  };

  const armies = $derived(SIDES.map((side) => {
    const army = b.units.filter((u) => u.side === side);
    const tally = { standing: 0, camp: 0, routed: 0, destroyed: 0 };
    for (const u of army) tally[unitOutcome(u)]++;
    const rows = army.map(row);
    const n = recovering(side);
    const order = b.dayOrders?.choices[side];
    return {
      side,
      heading: side === 'attacker' ? 'Attacking army' : 'Defending army',
      counts: `${tally.standing} standing · ${tally.camp} in camp · ${tally.routed} routed · ${tally.destroyed} destroyed`,
      rows,
      /** The report and orders list every unit; later steps list only the survivors. */
      listed: rows.filter((r) => stage === 'report' || stage === 'orders' || r.survivor),
      mine: viewer.decidesFor(side),
      rolled: rolled(side),
      rollStatus: shown[side] < n ? 'Rolling…' : 'Recovery complete.',
      rollPenalty: signed(-recoveryPenalty(n)),
      rollNote: `${n} ${n === 1 ? 'unit' : 'units'} recovering${!rolled(side) && n > 1 ? ' · each unit past the first costs −2' : ''}`,
      order,
      orderDescription: DAY_OPTIONS.find((o) => o.id === order)?.description ?? 'Choose whether to negotiate, leave, or stay.',
      foe: opponent(side),
      foeProposes: b.dayOrders?.choices[opponent(side)] === 'surrender',
      finalDecision: finalDecision(side),
      deployed: deployed(side),
      deployReady: sideDeployReady(side),
    };
  }));

  const waitingNote = $derived(SIDES.some(rolled) ? `Waiting for the ${SIDES.find((s) => !rolled(s))} to roll.` : 'Each army rolls its own recovery.');

  function go(next: Step) { step = next; notifications.dismiss(COMMAND_NOTICE); content?.scrollTo({ top: 0 }); }
  /** The authority generates tomorrow's field over the spec it already holds. */
  function generateNext(changes: Partial<BoardSpec> = {}) {
    void attempt(chooseNextBattlefield(changes));
  }
  async function saveForAnotherDay() {
    const name = `Day ${b.day} complete · ${new Date().toLocaleString()}`;
    try {
      await saveBattle(name);
      notifications.show({ id: 'end-of-day-save', title: 'Battle saved', message: name, tone: 'success', expiresInMs: 4000 });
    } catch (e) {
      notifications.show({ id: 'end-of-day-save', title: 'Save failed', message: e instanceof Error ? e.message : String(e), tone: 'error' });
    }
  }
  async function finishDecisions() {
    if (!b.dayOrders?.confirmed && !(await attempt(confirmDayOrders())).ok) return;
    if (game.battle?.endedBy === 'dusk') go('battlefield');
  }

  return {
    get b() { return b; },
    get stage() { return stage; },
    get title() { return title; },
    get intro() { return intro; },
    get resolved() { return resolved; },
    get continuing() { return continuing; },
    get stepIndex() { return STEPS.findIndex((s) => s.id === stage); },
    get field() { return field; },
    get newMap() { return newMap; },
    get mapReady() { return mapReady; },
    get deployReady() { return deployReady; },
    get previewTokens() { return previewTokens; },
    get armies() { return armies; },
    get waitingNote() { return waitingNote; },
    get surrenderPending() { return surrenderPending; },
    get ordersReady() { return ordersReady; },
    get bothHold() { return bothHold; },
    get ordersStatus() { return ordersStatus; },
    get positions() { return positions; },
    get content() { return content; },
    set content(el) { content = el; },
    go,
    choose: (unit: string, activity: Choice) => { choices[unit] = activity; },
    keepMap: () => void attempt(chooseNextBattlefield(null)),
    newField: () => { if (!newMap) generateNext(); },
    generateNext,
    setFortification: (tier: number) => generateNext({ construction: tier < 0 ? null : { kind: 'fort', tier } }),
    anotherMap: () => generateNext({ seed: Math.floor(Math.random() * 1e9) }),
    rollRecovery: (side: Side) => void attempt(declareRecovery(side, declarationsFor(side))),
    chooseOrder: (side: Side, order: DayOrder) => void attempt(chooseDayOrder(side, order)),
    respond: (side: Side, accept: boolean) => void attempt(respondToSurrender(side, accept)),
    submitDeployment: (side: Side) => void attempt(declareDeployment(side, placementOf(side))),
    beginNextDay: () => void attempt(startNextDay()),
    endBattle: () => void attempt(leaveBattle()),
    saveForAnotherDay,
    finishDecisions,
    destroy() {
      timers.forEach(clearTimeout);
      timers.clear();
      notifications.dismiss(COMMAND_NOTICE);
    },
  };
}

export type BattleReport = ReturnType<typeof createBattleReport>;
