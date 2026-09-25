<script lang="ts">
  import { FORTIFICATIONS } from '../engine/board.js';
  import { canContinueBattle, deploymentCells, FEATURES, hasRecovered, HEX_TERRAINS, isStanding, isSurvivor, MAX_WOUNDS, nextDayBattlefield,
    nightResolved, recoveryDc, recoveryPenalty, ROUTED_AT, SIDES, suggestDeployment,
    type BoardSpec, type DayOrder, type NightRecovery, type RecoveryActivity, type RecoveryChoice, type Side, type Unit } from '../engine/index.js';
  import type { TokenModel } from '../board/index.js';
  import { chooseDayOrder, chooseNextBattlefield, confirmDayOrders, declareDeployment, declareRecovery, game, respondToSurrender, saveBattle, startNextDay } from './game.svelte.js';
  import { allSubmitted, submissionOf } from '../runtime/interactions.js';
  import { viewer } from './viewer.svelte.js';
  import { leaveBattle } from './navigation.svelte.js';
  import PixiBoard from './PixiBoard.svelte';
  import ConnectionWarning from './ConnectionWarning.svelte';
  import { gameMap } from './map-style.svelte.js';
  import { onDestroy, untrack } from 'svelte';
  import { useNotifications } from './notification-context.js';
  import { commandReporter, COMMAND_NOTICE } from './command-notices.js';
  let { backdrop = true }: { backdrop?: boolean } = $props();
  const notifications = useNotifications();
  const attempt = commandReporter(notifications);
  onDestroy(() => notifications.dismiss(COMMAND_NOTICE));

  type Step = 'report' | 'recovery' | 'orders' | 'battlefield' | 'deployment';
  const steps: { id: Step; label: string }[] = [
    { id: 'report', label: 'Report' }, { id: 'recovery', label: 'Recovery' },
    { id: 'orders', label: 'Orders' }, { id: 'battlefield', label: 'Battlefield' }, { id: 'deployment', label: 'Deployment' },
  ];
  const b = $derived(game.battle!);
  let step = $state<Step>('report');
  let choices = $state<Record<string, RecoveryActivity | ''>>({});
  let positions = $state<Record<string, string>>({});
  let content: HTMLDivElement;
  const resolved = $derived(nightResolved(b));
  const continuing = $derived(canContinueBattle(b));
  const stage = $derived<Step>(!continuing ? 'report' : resolved && step === 'report' ? (b.dayOrders?.confirmed ? 'deployment' : 'orders') : step);
  const dayOptions: { id: DayOrder; label: string; description: string }[] = [
    { id: 'surrender', label: 'Propose surrender', description: 'Ask the opposing side to accept your surrender. Agree the terms together.' },
    { id: 'withdraw', label: 'Withdraw', description: 'Leave the field with your surviving troops. The enemy holds it if they stay.' },
    { id: 'hold', label: 'Hold the field', description: 'Stay to contest the ground. If both armies hold, prepare for another day.' },
  ];
  const surrenderPending = $derived(SIDES.some((side) => b.dayOrders?.choices[side] === 'surrender'));
  const ordersReady = $derived(SIDES.every((side) => !!b.dayOrders?.choices[side]) && !surrenderPending);
  const bothHold = $derived(SIDES.every((side) => b.dayOrders?.choices[side] === 'hold'));
  const field = $derived(nextDayBattlefield(b));
  const newMap = $derived(!!b.nextBoard);
  const survivors = $derived(b.units.filter(isSurvivor));
  const declarations = $derived<RecoveryChoice[]>(Object.entries(choices)
    .filter(([, activity]) => activity !== '').map(([unit, activity]) => ({ unit, activity: activity as RecoveryActivity })));
  const sideOf = (unit: string) => b.units.find((u) => u.id === unit)?.side;
  const declarationsFor = (side: Side) => declarations.filter((c) => sideOf(c.unit) === side);
  const participants = (side: Side) => declarationsFor(side).length;
  /** Whether this viewer answers for that army: any user seated on it, and the GM for either. */
  const mine = (side: Side) => viewer.decidesFor(side);
  const rolled = (side: Side) => hasRecovered(b, side);
  /** Units in the army's night: its declared choices until it rolls, its rolled results after. */
  const recovering = (side: Side) => rolled(side) ? b.night![side]!.length : participants(side);
  const resultOf = (u: Unit) => b.night?.[u.side]?.find((r) => r.unit === u.id);
  const recoveryOptions: { id: RecoveryActivity | ''; label: string; mark: string }[] = [
    { id: '', label: 'None', mark: '' }, { id: 'rally', label: 'Morale', mark: '⚑' }, { id: 'treat', label: 'Health', mark: '♥' },
  ];
  /** How many of each army's results the viewer has been shown. An army's rolls arrive in one
   * record; the view then reveals them one unit at a time, with a die tumbling over each. */
  let shown = $state<Record<Side, number>>({ attacker: 0, defender: 0 });
  let tumbling = $state<{ unit: string; face: number } | null>(null);
  const playing = new Set<Side>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const wait = (ms: number) => new Promise<void>((resolve) => {
    const timer = setTimeout(() => { timers.delete(timer); resolve(); }, ms);
    timers.add(timer);
  });
  onDestroy(() => timers.forEach(clearTimeout));
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
  const outcome = (r: NightRecovery) => r.recovered === 0 ? `fails to recover` : `recovers ${r.recovered} ${r.activity === 'rally' ? 'morale' : 'health'}`;
  const status = (u: Unit) => u.status === 'destroyed' ? 'Destroyed' : u.disorder >= ROUTED_AT ? 'Routed' : u.status === 'camp' ? 'In camp' : u.status === 'left' ? 'Left the field' : 'Standing';
  const signed = (n: number) => n >= 0 ? `+${n}` : `−${-n}`;
  const title = $derived(stage === 'orders' ? 'Choose your next move' : stage === 'battlefield' ? 'Choose tomorrow’s battlefield' : stage === 'recovery' ? 'Tend to your armies'
    : stage === 'deployment' ? `Deploy for day ${b.day + 1}` : b.endedBy === 'surrender' ? `The ${b.winner === 'attacker' ? 'defender' : 'attacker'} surrenders.`
    : b.winner === 'draw' ? (b.endedBy === 'dusk' ? 'Dusk. The field is contested.' : b.endedBy === 'withdrawal' ? 'Both armies withdraw.' : 'Both armies are spent.') : `The ${b.winner} holds the field.`);
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
  const deployReady = $derived(allSubmitted(game.interactions, 'nextDay.deployment'));
  const mapReady = $derived(Object.keys(suggestDeployment(field)).length === survivors.length);
  const previewTokens = $derived<TokenModel[]>(stage === 'deployment' ? survivors.flatMap((u) => positions[u.id] ? [{
    kind: 'unit' as const, id: u.id, side: u.side, name: u.name, role: u.role, level: u.level,
    cell: positions[u.id], wounds: u.wounds, disorder: u.disorder,
    engine: u.engines.find((e) => e.status === 'crewed')?.name ?? null, verdict: null, statuses: [], pick: null, ring: null,
  }] : []) : []);
  function preview(u: Unit, activity: RecoveryActivity) {
    const save = activity === 'rally' ? u.stats.will : u.stats.fortitude;
    return `${activity === 'rally' ? 'Will' : 'Fortitude'} ${signed(save)} − ${u.disorder} missing Morale − ${recoveryPenalty(participants(u.side))} recovery = ${signed(save - u.disorder - recoveryPenalty(participants(u.side)))} vs DC ${recoveryDc(b, { unit: u.id, activity })}`;
  }
  $effect(() => { if (resolved) positions = suggestDeployment(field); });
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
</script>

<div class="report-scrim" class:over-art={!backdrop}>
  <section class="card report" aria-label="Battle report">
    <header>
      <p class="eyebrow">Day {b.day} complete · {b.round} rounds</p>
      <h2>{title}</h2>
      {#if continuing}
        <ol class="steps" aria-label="Next day preparation">
          {#each steps as item, index (item.id)}
            <li class:current={stage === item.id} class:complete={steps.findIndex((s) => s.id === stage) > index} aria-current={stage === item.id ? 'step' : undefined}>
              <span>{index + 1}</span>{item.label}
            </li>
          {/each}
        </ol>
      {/if}
    </header>
    <div class="report-content" bind:this={content}>
      {#if stage === 'battlefield'}
        <p class="intro">Keep fighting over this ground, or move the surviving armies to a new field. Their health, morale, and recovery results carry forward.</p>
        <div class="map-choices" role="group" aria-label="Tomorrow's map">
          <button class:selected={!newMap} aria-pressed={!newMap} disabled={!viewer.isGm} onclick={() => void attempt(chooseNextBattlefield(null))}>
            <span class="choice-mark">{!newMap ? '●' : '○'}</span><span><strong>Same map</strong><small>Keep this terrain, damaged walls, and emplacements.</small></span>
          </button>
          <button class:selected={newMap} aria-pressed={newMap} disabled={!viewer.isGm} onclick={() => { if (!newMap) generateNext(); }}>
            <span class="choice-mark">{newMap ? '●' : '○'}</span><span><strong>New map</strong><small>Generate fresh ground for the next day.</small></span>
          </button>
        </div>
        <div class="field-layout">
          <div class="map-preview" aria-label="Battlefield preview">
            <PixiBoard board={field.board} fill terrainAppearance={gameMap.terrainAppearance} inkMap={gameMap.inkMap} />
          </div>
          <div class="map-settings">
            <h3>{newMap ? 'New battlefield' : 'The current battlefield'}</h3>
            {#if newMap}
              <label>Terrain<select aria-label="Next battlefield terrain" value={field.board.spec.base} onchange={(e) => generateNext({ base: e.currentTarget.value as BoardSpec['base'] })}>{#each HEX_TERRAINS as terrain (terrain)}<option value={terrain}>{terrain}</option>{/each}</select></label>
              <label>Feature<select aria-label="Next battlefield feature" value={field.board.spec.feature ?? 'none'} onchange={(e) => generateNext({ feature: e.currentTarget.value as BoardSpec['feature'] })}>{#each FEATURES as feature (feature)}<option value={feature}>{feature}</option>{/each}</select></label>
              <label>Fortification<select aria-label="Next battlefield fortification" value={field.board.spec.construction?.tier ?? -1} onchange={(e) => generateNext({ construction: Number(e.currentTarget.value) < 0 ? null : { kind: 'fort', tier: Number(e.currentTarget.value) } })}><option value={-1}>None</option>{#each FORTIFICATIONS as wall (wall.tier)}<option value={wall.tier}>{wall.tier} · {wall.name}</option>{/each}</select></label>
              <button onclick={() => generateNext({ seed: Math.floor(Math.random() * 1e9) })}>Generate another map</button>
              <p class="muted">Fixed emplacements and abandoned equipment stay on the old field. Crewed attached engines travel with their surviving units.</p>
            {:else}
              <p>{field.board.spec.base} · {field.board.grid} grid</p>
              <p class="muted">Terrain and breaches remain as they were at dusk. Survivors will redeploy in their home zones.</p>
            {/if}
            <ConnectionWarning board={field.board} />
            {#if !mapReady}<p role="alert">This map has too few deployment cells for the survivors. Generate another map.</p>{/if}
          </div>
        </div>
      {:else if stage === 'recovery'}
        <div class="instruction"><strong>{resolved ? 'Recovery complete.' : 'Each army tends its own troops.'}</strong><p>{resolved ? 'All results are final for this night. Review them before choosing to withdraw or hold.' : 'Choose None, Morale, or Health for each survivor, then roll. Each extra participant gives every recovery check on its side −2. Success restores 1; critical success restores 2.'}</p></div>
        <div class="armies">
          {#each SIDES as side (side)}
            {@const army = b.units.filter((u) => u.side === side)}
            <section class="army" class:attacking={side === 'attacker'} class:defending={side === 'defender'} aria-label={`${side} recovery`}>
              <div class="army-heading">
                <h3 class:side-att={side === 'attacker'} class:side-def={side === 'defender'}>{side === 'attacker' ? 'Attacking army' : 'Defending army'}</h3>
                <p class="counts">{army.filter(isStanding).length} standing · {army.filter((u) => u.status === 'camp').length} in camp · {army.filter((u) => u.status !== 'destroyed' && u.disorder >= ROUTED_AT).length} routed · {army.filter((u) => u.status === 'destroyed').length} destroyed</p>
              </div>
              {#each army as u (u.id)}
                {@const result = resultOf(u)}
                {@const activity = rolled(side) ? (result?.activity ?? '') : (choices[u.id] ?? '')}
                {@const revealed = !!result && b.night![side]!.indexOf(result) < shown[side]}
                {@const rolling = tumbling?.unit === u.id}
                <div class="report-unit" class:lost={!isSurvivor(u)} class:rolling class:revealed class:recovered={revealed && result!.recovered > 0} class:failed={revealed && result!.recovered === 0}>
                  <div class="unit-heading"><strong>{u.name}</strong>
                    {#if rolling}<span class="die tumbling" aria-hidden="true">{tumbling!.face}</span>
                    {:else if revealed}<span class="die" aria-label={`Rolled ${result!.check.roll}`}>{result!.check.roll}</span>{/if}
                  </div>
                  <div class="meters"><span>Morale <b>{ROUTED_AT - u.disorder}/{ROUTED_AT}</b></span><span>Health <b>{MAX_WOUNDS - u.wounds}/{MAX_WOUNDS}</b></span></div>
                  {#if !isSurvivor(u)}<small>{status(u)} · Cannot recover</small>
                  {:else if rolled(side)}
                    {#if !result}<small>Sat out the night.</small>
                    {:else if revealed}
                      <p class="recovery-outcome">{u.name} {outcome(result)}.<small class="check-preview">{result.activity === 'rally' ? 'Rally' : 'Treat Wounded'} · {result.check.degree.replaceAll('-', ' ')} · {result.check.roll} {signed(result.check.modifier)} = {result.check.total} vs DC {result.check.dc}</small></p>
                    {:else}<small>{result.activity === 'rally' ? 'Rallying…' : 'Treating wounded…'}</small>{/if}
                  {:else}
                    <div class="recovery-choice" role="radiogroup" aria-label={`Recovery for ${u.name}`}>
                      {#each recoveryOptions as option (option.id)}
                        {@const barred = (option.id === 'rally' && u.disorder === 0) || (option.id === 'treat' && u.wounds === 0)}
                        <button type="button" role="radio" aria-checked={activity === option.id} class:selected={activity === option.id} disabled={!mine(side) || barred}
                          onclick={() => choices[u.id] = option.id}>{#if option.mark}<span aria-hidden="true">{option.mark}</span> {/if}{option.label}</button>
                      {/each}
                    </div>
                    {#if activity}<small class="check-preview">{preview(u, activity)}</small>
                    {:else}<small>{u.wounds === 0 && u.disorder === 0 ? 'At full health and morale.' : 'Choose a recovery activity.'}</small>{/if}
                  {/if}
                </div>
              {/each}
              <div class="army-roll">
                {#if rolled(side)}
                  <p class="counts">{shown[side] < recovering(side) ? 'Rolling…' : 'Recovery complete.'}</p>
                {:else}
                  <button class="primary" disabled={!mine(side)} onclick={() => void attempt(declareRecovery(side, declarationsFor(side)))}>Roll {side} recovery</button>
                {/if}
                <p class="roll-penalty" aria-live="polite"><b>{signed(-recoveryPenalty(recovering(side)))}</b> on every check · {recovering(side)} {recovering(side) === 1 ? 'unit' : 'units'} recovering{#if !rolled(side) && recovering(side) > 1} · each unit past the first costs −2{/if}</p>
              </div>
            </section>
          {/each}
        </div>
      {:else}
        {#if stage === 'deployment'}
          <div class="deployment-heading"><p class="intro">{newMap ? 'New battlefield' : 'Same battlefield'} · Recovery is complete. Choose a deployment cell for each survivor.</p><button onclick={() => go('battlefield')}>Change map</button></div>
          <div class="deployment-preview" aria-label="Survivor deployment preview">
            <PixiBoard board={field.board} tokens={previewTokens} fill terrainAppearance={gameMap.terrainAppearance} inkMap={gameMap.inkMap} />
          </div>
        {:else}
          <p class="intro">{continuing ? (stage === 'orders' ? 'Recovery is complete. Choose an end-of-day decision for each army.' : 'Review the survivors, then recover before choosing your next move.') : b.endedBy === 'surrender' ? 'The opponent accepted the surrender. Agree campaign terms together; surviving troops keep their Health and Morale.' : b.endedBy === 'withdrawal' ? 'Withdrawal is complete. Surviving troops keep their Health and Morale.' : 'The battle is over. Review the final army report.'}</p>
        {/if}
        <div class="armies">
          {#each SIDES as side (side)}
            {@const army = b.units.filter((u) => u.side === side)}
            {@const opponent = side === 'attacker' ? 'defender' : 'attacker'}
            <section class="army" class:attacking={side === 'attacker'} class:defending={side === 'defender'} aria-label={`${side} report`}>
              <div class="army-heading">
                <h3 class:side-att={side === 'attacker'} class:side-def={side === 'defender'}>{side === 'attacker' ? 'Attacking army' : 'Defending army'}</h3>
                <p class="counts">{army.filter(isStanding).length} standing · {army.filter((u) => u.status === 'camp').length} in camp · {army.filter((u) => u.status !== 'destroyed' && u.disorder >= ROUTED_AT).length} routed · {army.filter((u) => u.status === 'destroyed').length} destroyed</p>
              </div>
              {#if stage === 'deployment'}
                <div class="deploy-confirm">
                  <button class:selected={deployed(side)} disabled={!mine(side) || !sideDeployReady(side) || deployed(side)}
                    onclick={() => void attempt(declareDeployment(side, placementOf(side)))}>
                    {deployed(side) ? 'Deployment submitted' : 'Submit deployment'}
                  </button>
                  <small>{deployed(side) ? 'Waiting for both armies before the day begins.' : 'Choose a cell for every survivor, then submit.'}</small>
                </div>
              {:else if stage === 'orders' && continuing}
                <div class="day-decision">
                  <strong class="decision-label">End-of-day decision</strong>
                  <div class="day-options" role="group" aria-label={`${side} end-of-day decision`}>
                    {#each dayOptions as option (option.id)}
                      <button class:selected={b.dayOrders?.choices[side] === option.id} aria-pressed={b.dayOrders?.choices[side] === option.id}
                        disabled={!mine(side)} onclick={() => void attempt(chooseDayOrder(side, option.id))}>{option.label}</button>
                    {/each}
                  </div>
                  <p class="decision-description">{dayOptions.find((o) => o.id === b.dayOrders?.choices[side])?.description ?? 'Choose whether to negotiate, leave, or stay.'}</p>
                  {#if b.dayOrders?.choices[opponent] === 'surrender'}
                    <div class="surrender-response" role="group" aria-label={`${side} response to surrender`}>
                      <p>The {opponent} proposes surrender.</p>
                      <div class="day-options">
                        <button disabled={!mine(side)} onclick={() => void attempt(respondToSurrender(side, true))}>Accept surrender</button>
                        <button disabled={!mine(side)} onclick={() => void attempt(respondToSurrender(side, false))}>Reject proposal</button>
                      </div>
                    </div>
                  {/if}
                </div>
              {:else if stage === 'report' && b.dayOrders && (b.dayOrders.choices[side] || b.endedBy === 'surrender')}
                <p class="final-decision">{b.endedBy === 'surrender' ? (b.winner === side ? 'Accepted surrender' : 'Surrendered') : b.endedBy === 'withdrawal' ? (b.dayOrders.choices[side] === 'withdraw' ? 'Withdrawn' : 'Holds the field') : dayOptions.find((o) => o.id === b.dayOrders?.choices[side])?.label}</p>
              {/if}
              {#each army.filter((u) => stage === 'report' || stage === 'orders' || isSurvivor(u)) as u (u.id)}
                <div class="report-unit" class:lost={!isSurvivor(u)}>
                  <div class="unit-heading"><strong>{u.name}</strong>{#if stage === 'report'}<span class="outcome">{status(u)}</span>{/if}</div>
                  <div class="meters">
                    <span>Health <b>{MAX_WOUNDS - u.wounds}/{MAX_WOUNDS}</b></span>
                    <span>Morale <b>{ROUTED_AT - u.disorder}/{ROUTED_AT}</b></span>
                  </div>
                  {#if stage === 'deployment'}
                    <label class="choice">Deployment cell<select aria-label={`Deployment for ${u.name}`} disabled={!mine(side)} bind:value={positions[u.id]}><option value="">Choose a cell</option>{#each deploymentCells(field, u) as cell (cell)}<option value={cell} disabled={Object.entries(positions).some(([id, value]) => id !== u.id && value === cell)}>{cell}</option>{/each}</select></label>
                  {/if}
                </div>
              {/each}
            </section>
          {/each}
        </div>
        {#if continuing}<p class="loss-note">Routed and destroyed units stay out of the next day’s battle.</p>{/if}
      {/if}
    </div>
    <footer>
      {#if stage === 'orders' && continuing}
        <p class="decision-status" role="status">{surrenderPending ? 'Awaiting the opponent’s response to surrender.' : !ordersReady ? 'Choose a decision for both armies.' : bothHold ? 'Both armies will hold. Continue to choose the next battlefield.' : SIDES.every((s) => b.dayOrders?.choices[s] === 'withdraw') ? 'Both armies will withdraw. The field stays contested.' : `The ${b.dayOrders?.choices.attacker === 'withdraw' ? 'defender' : 'attacker'} will hold the field.`}</p>
      {/if}
      <div class="footer-actions">
        <button class="end-battle" disabled={!viewer.isGm} onclick={() => void attempt(leaveBattle())}>End battle</button>
        {#if continuing && resolved}<button class="save-day" onclick={() => void saveForAnotherDay()}>Save for another day</button>{/if}
        {#if stage === 'deployment'}
          <button class="primary" disabled={!deployReady || !viewer.isGm} onclick={() => void attempt(startNextDay())}>Begin day {b.day + 1}</button>
        {:else if stage === 'recovery'}
          {#if resolved}
            <button class="primary" onclick={() => go('orders')}>Continue to orders</button>
          {:else}
            <p class="decision-status" role="status">{SIDES.some(rolled) ? `Waiting for the ${SIDES.find((s) => !rolled(s))} to roll.` : 'Each army rolls its own recovery.'}</p>
            <button onclick={() => go('report')}>Back</button>
          {/if}
        {:else if stage === 'battlefield'}
          <button onclick={() => go('orders')}>Back</button>
          <button class="primary" disabled={!mapReady} onclick={() => go('deployment')}>Continue to deployment</button>
        {:else if stage === 'orders' && continuing}
          <button onclick={() => go('recovery')}>Review recovery</button>
          <button class="primary" disabled={!ordersReady || !viewer.isGm} onclick={() => void finishDecisions()}>{bothHold ? 'Fight another day' : 'Confirm decisions'}</button>
        {:else if continuing}
          <button class="primary" onclick={() => go('recovery')}>Continue to recovery</button>
        {/if}
      </div>
    </footer>
  </section>
</div>

<style>
  .report-scrim { position: absolute; inset: 0; display: grid; place-items: center; padding: 1.25rem; background: color-mix(in srgb, var(--paper) 70%, transparent); backdrop-filter: blur(3px); }
  .report-scrim.over-art { background: transparent; backdrop-filter: none; }
  .report { display: flex; flex-direction: column; width: min(70rem, 100%); max-height: 100%; padding: 0; overflow: hidden; }
  header { padding: 1.4rem 1.6rem 0; }
  .eyebrow { margin: 0 0 .35rem; color: var(--muted); font-size: var(--type-small); font-weight: 600; }
  h2 { margin: 0; padding: 0; border: 0; font-size: clamp(var(--type-3), 3vw, var(--type-6)); line-height: var(--leading-heading); }
  .steps { display: flex; gap: 1.6rem; list-style: none; padding: 1rem 0; margin: .6rem 0 0; border-bottom: 1px solid var(--rule); }
  .steps li { display: flex; align-items: center; gap: .5rem; color: var(--muted); font-size: var(--type-small); }
  .steps li span { display: grid; place-items: center; width: 1.5rem; height: 1.5rem; border: 1px solid var(--rule); border-radius: 50%; font-size: var(--type-label); }
  .steps .current { color: var(--ink); font-weight: 700; }
  .steps .current span { background: var(--accent); color: var(--paper); border-color: var(--accent); }
  .steps .complete span { border-color: var(--accent); color: var(--accent); }
  .report-content { overflow-y: auto; min-height: 0; padding: 1.2rem 1.6rem; }
  .intro { margin: 0 0 1rem; color: var(--muted); }
  .armies, .map-choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; }
  .army { padding: 1rem; border: 1px solid color-mix(in srgb, var(--army-color) 23%, var(--rule)); border-radius: 8px; background: color-mix(in srgb, var(--army-color) 7%, var(--card)); }
  .attacking { --army-color: var(--att); }
  .defending { --army-color: var(--def); }
  .day-decision { padding: .7rem 0 .9rem; margin-bottom: .8rem; border-bottom: 1px solid color-mix(in srgb, var(--army-color) 25%, var(--rule)); }
  .decision-label { font-size: var(--type-label); }
  .day-options { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .5rem; }
  .day-options button { font-size: var(--type-label); padding: .4rem .55rem; }
  .day-options button.selected { border-color: var(--army-color); background: color-mix(in srgb, var(--army-color) 15%, var(--card)); }
  .decision-description { font-size: var(--type-label); color: var(--muted); margin: .5rem 0 0; }
  .surrender-response { margin-top: .7rem; padding: .65rem; background: var(--card); border: 1px solid var(--army-color); border-radius: 5px; }
  .surrender-response p { margin: 0; font-size: var(--type-small); }
  .final-decision { color: var(--army-color); font-size: var(--type-small); }
  .deploy-confirm { padding: .6rem 0 .8rem; margin-bottom: .6rem; border-bottom: 1px solid color-mix(in srgb, var(--army-color) 25%, var(--rule)); }
  .deploy-confirm button.selected { border-color: var(--army-color); background: color-mix(in srgb, var(--army-color) 15%, var(--card)); }
  .decision-status { margin: 0 0 .65rem; color: var(--muted); font-size: var(--type-small); }
  .army-heading { padding-bottom: .5rem; }
  h3 { margin: 0; }
  .counts { font-size: var(--type-label); color: var(--muted); margin: .25rem 0 0; }
  .report-unit { padding: .8rem; border: 1px solid var(--rule); border-radius: 6px; margin-bottom: .55rem; transition: background-color .25s, border-color .25s, box-shadow .25s; }
  .lost { opacity: .65; }
  .unit-heading { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: .4rem; }
  .outcome { color: var(--muted); font-size: var(--type-label); }
  .meters { display: flex; gap: 1.25rem; font-size: var(--type-small); color: var(--muted); margin: .4rem 0; }
  .meters b { color: var(--ink); font-weight: 400; }
  .recovery-choice { display: flex; gap: .3rem; margin-top: .5rem; }
  .recovery-choice button { flex: 1; font-size: var(--type-label); padding: .4rem .3rem; }
  .recovery-choice button.selected { border-color: var(--army-color); background: color-mix(in srgb, var(--army-color) 15%, var(--card)); }
  .army-roll { display: flex; align-items: center; flex-wrap: wrap; gap: .5rem 1rem; margin-top: .8rem; padding-top: .8rem; border-top: 1px solid color-mix(in srgb, var(--army-color) 25%, var(--rule)); }
  .army-roll .counts { margin: 0; }
  .roll-penalty { margin: 0; font-size: var(--type-small); color: var(--muted); }
  .roll-penalty b { color: var(--ink); font-variant-numeric: tabular-nums; }
  .report-unit.rolling { border-color: var(--army-color); background: color-mix(in srgb, var(--army-color) 14%, var(--card)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--army-color) 25%, transparent); }
  .report-unit.revealed { animation: settle .6s ease-out; }
  .report-unit.recovered { border-color: var(--good); }
  .report-unit.failed { border-color: var(--rule); }
  @keyframes settle { from { background-color: color-mix(in srgb, var(--army-color) 22%, var(--card)); } to { background-color: transparent; } }
  .die { display: inline-grid; place-items: center; min-width: 1.7rem; height: 1.7rem; padding: 0 .3rem; border: 1px solid var(--ink); border-radius: 5px; background: var(--paper); font-variant-numeric: tabular-nums; font-size: var(--type-small); font-weight: 700; }
  .die.tumbling { animation: tumble .11s linear infinite; border-color: var(--army-color); }
  @keyframes tumble { from { transform: rotate(-8deg) scale(1.05); } to { transform: rotate(8deg) scale(.95); } }
  .recovered .die { border-color: var(--good); color: var(--good); }
  .failed .die { color: var(--muted); }
  .recovery-outcome { margin: .4rem 0 0; font-size: var(--type-small); }
  .recovered .recovery-outcome { color: var(--good); }
  .failed .recovery-outcome { color: var(--muted); }
  .recovery-outcome small { color: var(--muted); }
  .footer-actions .decision-status { margin: 0; align-self: center; }
  button.selected { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--card)); }
  .choice { display: flex; align-items: center; justify-content: space-between; gap: .6rem; margin-top: .6rem; font-size: var(--type-small); }
  small { display: block; font-size: var(--type-label); margin-top: .35rem; color: var(--muted); }
  .check-preview { font-variant-numeric: tabular-nums; }
  .instruction { padding: .75rem 1rem; border-left: 2px solid var(--accent); background: var(--band); margin-bottom: 1.25rem; }
  .instruction p { margin: .25rem 0 0; color: var(--muted); font-size: var(--type-small); }
  .loss-note { font-size: var(--type-label); color: var(--muted); margin: .7rem 0 0; }
  .map-choices button { display: flex; gap: .8rem; text-align: left; padding: 1rem; }
  .map-choices strong { display: block; font-size: var(--type-1); }
  .choice-mark { color: var(--accent); font-size: var(--type-1); }
  .field-layout { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(14rem, 1fr); gap: 1.25rem; margin-top: 1.2rem; }
  .map-preview { position: relative; height: 22rem; border: 1px solid var(--rule); border-radius: 6px; overflow: hidden; }
  .map-settings { display: flex; flex-direction: column; gap: .75rem; }
  .map-settings label { display: flex; justify-content: space-between; gap: .6rem; font-size: var(--type-small); }
  .map-settings select { min-width: 8rem; }
  .map-settings p { margin: 0; }
  .deployment-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
  .deployment-heading button { white-space: nowrap; font-size: var(--type-label); }
  .deployment-preview { position: relative; height: 18rem; border: 1px solid var(--rule); border-radius: 6px; overflow: hidden; margin-bottom: 1rem; }
  footer { padding: 1rem 1.6rem; border-top: 1px solid var(--rule); background: var(--card); }
  .footer-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .6rem; }
  .end-battle, .save-day { margin-right: auto; }
  .end-battle:has(+ .save-day) { margin-right: 0; }
  @media (max-width: 650px) {
    .armies, .map-choices, .field-layout { grid-template-columns: 1fr; }
    .report-scrim { padding: .5rem; }
    header { padding: 1rem 1rem 0; }
    .report-content, footer { padding: 1rem; }
    .steps { gap: .7rem; justify-content: space-between; }
    .steps li { flex-direction: column; gap: .3rem; font-size: var(--type-label); }
    .map-preview { height: 17rem; }
  }
</style>
