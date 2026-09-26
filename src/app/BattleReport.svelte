<script lang="ts">
  import { FEATURES, FORTIFICATIONS, HEX_TERRAINS, type BoardSpec } from '../engine/index.js';
  import { viewer } from './viewer.svelte.js';
  import PixiBoard from './PixiBoard.svelte';
  import ConnectionWarning from './ConnectionWarning.svelte';
  import { gameMap } from './map-style.svelte.js';
  import { onDestroy } from 'svelte';
  import { useNotifications } from './notification-context.js';
  import { createBattleReport, DAY_OPTIONS, STEPS } from './battle-report.svelte.js';
  let { backdrop = true }: { backdrop?: boolean } = $props();
  const report = createBattleReport({ notifications: useNotifications() });
  onDestroy(() => report.destroy());
</script>

<div class="report-scrim" class:over-art={!backdrop}>
  <section class="card report" aria-label="Battle report">
    <header>
      <p class="eyebrow">Day {report.b.day} complete · {report.b.round} rounds</p>
      <h2>{report.title}</h2>
      {#if report.continuing}
        <ol class="steps" aria-label="Next day preparation">
          {#each STEPS as item, index (item.id)}
            <li class:current={report.stage === item.id} class:complete={report.stepIndex > index} aria-current={report.stage === item.id ? 'step' : undefined}>
              <span>{index + 1}</span>{item.label}
            </li>
          {/each}
        </ol>
      {/if}
    </header>
    <div class="report-content" bind:this={report.content}>
      {#if report.stage === 'battlefield'}
        <p class="intro">Keep fighting over this ground, or move the surviving armies to a new field. Their health, morale, and recovery results carry forward.</p>
        <div class="map-choices" role="group" aria-label="Tomorrow's map">
          <button class:selected={!report.newMap} aria-pressed={!report.newMap} disabled={!viewer.isGm} onclick={report.keepMap}>
            <span class="choice-mark">{!report.newMap ? '●' : '○'}</span><span><strong>Same map</strong><small>Keep this terrain, damaged walls, and emplacements.</small></span>
          </button>
          <button class:selected={report.newMap} aria-pressed={report.newMap} disabled={!viewer.isGm} onclick={report.newField}>
            <span class="choice-mark">{report.newMap ? '●' : '○'}</span><span><strong>New map</strong><small>Generate fresh ground for the next day.</small></span>
          </button>
        </div>
        <div class="field-layout">
          <div class="map-preview" aria-label="Battlefield preview">
            <PixiBoard board={report.field.board} fill terrainAppearance={gameMap.terrainAppearance} inkMap={gameMap.inkMap} />
          </div>
          <div class="map-settings">
            <h3>{report.newMap ? 'New battlefield' : 'The current battlefield'}</h3>
            {#if report.newMap}
              <label>Terrain<select aria-label="Next battlefield terrain" value={report.field.board.spec.base} onchange={(e) => report.generateNext({ base: e.currentTarget.value as BoardSpec['base'] })}>{#each HEX_TERRAINS as terrain (terrain)}<option value={terrain}>{terrain}</option>{/each}</select></label>
              <label>Feature<select aria-label="Next battlefield feature" value={report.field.board.spec.feature ?? 'none'} onchange={(e) => report.generateNext({ feature: e.currentTarget.value as BoardSpec['feature'] })}>{#each FEATURES as feature (feature)}<option value={feature}>{feature}</option>{/each}</select></label>
              <label>Fortification<select aria-label="Next battlefield fortification" value={report.field.board.spec.construction?.tier ?? -1} onchange={(e) => report.setFortification(Number(e.currentTarget.value))}><option value={-1}>None</option>{#each FORTIFICATIONS as wall (wall.tier)}<option value={wall.tier}>{wall.tier} · {wall.name}</option>{/each}</select></label>
              <button onclick={report.anotherMap}>Generate another map</button>
              <p class="muted">Fixed emplacements and abandoned equipment stay on the old field. Crewed attached engines travel with their surviving units.</p>
            {:else}
              <p>{report.field.board.spec.base} · {report.field.board.grid} grid</p>
              <p class="muted">Terrain and breaches remain as they were at dusk. Survivors will redeploy in their home zones.</p>
            {/if}
            <ConnectionWarning board={report.field.board} />
            {#if !report.mapReady}<p role="alert">This map has too few deployment cells for the survivors. Generate another map.</p>{/if}
          </div>
        </div>
      {:else if report.stage === 'recovery'}
        <div class="instruction"><strong>{report.resolved ? 'Recovery complete.' : 'Each army tends its own troops.'}</strong><p>{report.resolved ? 'All results are final for this night. Review them before choosing to withdraw or hold.' : 'Choose None, Morale, or Health for each survivor, then roll. Each extra participant gives every recovery check on its side −2. Success restores 1; critical success restores 2.'}</p></div>
        <div class="armies">
          {#each report.armies as army (army.side)}
            <section class="army" class:attacking={army.side === 'attacker'} class:defending={army.side === 'defender'} aria-label={`${army.side} recovery`}>
              <div class="army-heading">
                <h3 class:side-att={army.side === 'attacker'} class:side-def={army.side === 'defender'}>{army.heading}</h3>
                <p class="counts">{army.counts}</p>
              </div>
              {#each army.rows as u (u.id)}
                <div class="report-unit" class:lost={!u.survivor} class:rolling={u.rolling} class:revealed={u.revealed} class:recovered={u.revealed && u.result!.recovered > 0} class:failed={u.revealed && u.result!.recovered === 0}>
                  <div class="unit-heading"><strong>{u.name}</strong>
                    {#if u.rolling}<span class="die tumbling" aria-hidden="true">{u.face}</span>
                    {:else if u.revealed}<span class="die" aria-label={`Rolled ${u.result!.check.roll}`}>{u.result!.check.roll}</span>{/if}
                  </div>
                  <div class="meters"><span>Morale <b>{u.morale}</b></span><span>Health <b>{u.health}</b></span></div>
                  {#if !u.survivor}<small>{u.outcome} · Cannot recover</small>
                  {:else if army.rolled}
                    {#if !u.result}<small>Sat out the night.</small>
                    {:else if u.revealed}
                      <p class="recovery-outcome">{u.resultText}<small class="check-preview">{u.checkText}</small></p>
                    {:else}<small>{u.pendingText}</small>{/if}
                  {:else}
                    <div class="recovery-choice" role="radiogroup" aria-label={`Recovery for ${u.name}`}>
                      {#each u.options as option (option.id)}
                        <button type="button" role="radio" aria-checked={u.activity === option.id} class:selected={u.activity === option.id} disabled={!army.mine || option.barred}
                          onclick={() => report.choose(u.id, option.id)}>{#if option.mark}<span aria-hidden="true">{option.mark}</span> {/if}{option.label}</button>
                      {/each}
                    </div>
                    {#if u.preview}<small class="check-preview">{u.preview}</small>
                    {:else}<small>{u.idleNote}</small>{/if}
                  {/if}
                </div>
              {/each}
              <div class="army-roll">
                {#if army.rolled}
                  <p class="counts">{army.rollStatus}</p>
                {:else}
                  <button class="primary" disabled={!army.mine} onclick={() => report.rollRecovery(army.side)}>Roll {army.side} recovery</button>
                {/if}
                <p class="roll-penalty" aria-live="polite"><b>{army.rollPenalty}</b> on every check · {army.rollNote}</p>
              </div>
            </section>
          {/each}
        </div>
      {:else}
        {#if report.stage === 'deployment'}
          <div class="deployment-heading"><p class="intro">{report.newMap ? 'New battlefield' : 'Same battlefield'} · Recovery is complete. Choose a deployment cell for each survivor.</p><button onclick={() => report.go('battlefield')}>Change map</button></div>
          <div class="deployment-preview" aria-label="Survivor deployment preview">
            <PixiBoard board={report.field.board} tokens={report.previewTokens} fill terrainAppearance={gameMap.terrainAppearance} inkMap={gameMap.inkMap} />
          </div>
        {:else}
          <p class="intro">{report.intro}</p>
        {/if}
        <div class="armies">
          {#each report.armies as army (army.side)}
            <section class="army" class:attacking={army.side === 'attacker'} class:defending={army.side === 'defender'} aria-label={`${army.side} report`}>
              <div class="army-heading">
                <h3 class:side-att={army.side === 'attacker'} class:side-def={army.side === 'defender'}>{army.heading}</h3>
                <p class="counts">{army.counts}</p>
              </div>
              {#if report.stage === 'deployment'}
                <div class="deploy-confirm">
                  <button class:selected={army.deployed} disabled={!army.mine || !army.deployReady || army.deployed}
                    onclick={() => report.submitDeployment(army.side)}>
                    {army.deployed ? 'Deployment submitted' : 'Submit deployment'}
                  </button>
                  <small>{army.deployed ? 'Waiting for both armies before the day begins.' : 'Choose a cell for every survivor, then submit.'}</small>
                </div>
              {:else if report.stage === 'orders' && report.continuing}
                <div class="day-decision">
                  <strong class="decision-label">End-of-day decision</strong>
                  <div class="day-options" role="group" aria-label={`${army.side} end-of-day decision`}>
                    {#each DAY_OPTIONS as option (option.id)}
                      <button class:selected={army.order === option.id} aria-pressed={army.order === option.id}
                        disabled={!army.mine} onclick={() => report.chooseOrder(army.side, option.id)}>{option.label}</button>
                    {/each}
                  </div>
                  <p class="decision-description">{army.orderDescription}</p>
                  {#if army.foeProposes}
                    <div class="surrender-response" role="group" aria-label={`${army.side} response to surrender`}>
                      <p>The {army.foe} proposes surrender.</p>
                      <div class="day-options">
                        <button disabled={!army.mine} onclick={() => report.respond(army.side, true)}>Accept surrender</button>
                        <button disabled={!army.mine} onclick={() => report.respond(army.side, false)}>Reject proposal</button>
                      </div>
                    </div>
                  {/if}
                </div>
              {:else if army.finalDecision}
                <p class="final-decision">{army.finalDecision}</p>
              {/if}
              {#each army.listed as u (u.id)}
                <div class="report-unit" class:lost={!u.survivor}>
                  <div class="unit-heading"><strong>{u.name}</strong>{#if report.stage === 'report'}<span class="outcome">{u.outcome}</span>{/if}</div>
                  <div class="meters">
                    <span>Health <b>{u.health}</b></span>
                    <span>Morale <b>{u.morale}</b></span>
                  </div>
                  {#if report.stage === 'deployment'}
                    <label class="choice">Deployment cell<select aria-label={`Deployment for ${u.name}`} disabled={!army.mine} bind:value={report.positions[u.id]}><option value="">Choose a cell</option>{#each u.cells as option (option.cell)}<option value={option.cell} disabled={option.taken}>{option.cell}</option>{/each}</select></label>
                  {/if}
                </div>
              {/each}
            </section>
          {/each}
        </div>
        {#if report.continuing}<p class="loss-note">Routed and destroyed units stay out of the next day’s battle.</p>{/if}
      {/if}
    </div>
    <footer>
      {#if report.stage === 'orders' && report.continuing}
        <p class="decision-status" role="status">{report.ordersStatus}</p>
      {/if}
      <div class="footer-actions">
        <button class="end-battle" disabled={!viewer.isGm} onclick={report.endBattle}>End battle</button>
        {#if report.continuing && report.resolved}<button class="save-day" onclick={() => void report.saveForAnotherDay()}>Save for another day</button>{/if}
        {#if report.stage === 'deployment'}
          <button class="primary" disabled={!report.deployReady || !viewer.isGm} onclick={report.beginNextDay}>Begin day {report.b.day + 1}</button>
        {:else if report.stage === 'recovery'}
          {#if report.resolved}
            <button class="primary" onclick={() => report.go('orders')}>Continue to orders</button>
          {:else}
            <p class="decision-status" role="status">{report.waitingNote}</p>
            <button onclick={() => report.go('report')}>Back</button>
          {/if}
        {:else if report.stage === 'battlefield'}
          <button onclick={() => report.go('orders')}>Back</button>
          <button class="primary" disabled={!report.mapReady} onclick={() => report.go('deployment')}>Continue to deployment</button>
        {:else if report.stage === 'orders' && report.continuing}
          <button onclick={() => report.go('recovery')}>Review recovery</button>
          <button class="primary" disabled={!report.ordersReady || !viewer.isGm} onclick={() => void report.finishDecisions()}>{report.bothHold ? 'Fight another day' : 'Confirm decisions'}</button>
        {:else if report.continuing}
          <button class="primary" onclick={() => report.go('recovery')}>Continue to recovery</button>
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
  .eyebrow { margin: 0 0 .35rem; color: var(--muted); font-size: var(--type-body); font-weight: 600; }
  h2 { margin: 0; padding: 0; border: 0; font-size: clamp(var(--type-3), 3vw, var(--type-6)); line-height: var(--leading-heading); }
  .steps { display: flex; gap: 1.6rem; list-style: none; padding: 1rem 0; margin: .6rem 0 0; border-bottom: 1px solid var(--rule); }
  .steps li { display: flex; align-items: center; gap: .5rem; color: var(--muted); font-size: var(--type-body); }
  .steps li span { display: grid; place-items: center; width: 1.5rem; height: 1.5rem; border: 1px solid var(--rule); border-radius: 50%; font-size: var(--type-small); }
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
  .decision-label { font-size: var(--type-small); }
  .day-options { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .5rem; }
  .day-options button { font-size: var(--type-small); padding: .4rem .55rem; }
  .day-options button.selected { border-color: var(--army-color); background: color-mix(in srgb, var(--army-color) 15%, var(--card)); }
  .decision-description { font-size: var(--type-small); color: var(--muted); margin: .5rem 0 0; }
  .surrender-response { margin-top: .7rem; padding: .65rem; background: var(--card); border: 1px solid var(--army-color); border-radius: 5px; }
  .surrender-response p { margin: 0; font-size: var(--type-body); }
  .final-decision { color: var(--army-color); font-size: var(--type-body); }
  .deploy-confirm { padding: .6rem 0 .8rem; margin-bottom: .6rem; border-bottom: 1px solid color-mix(in srgb, var(--army-color) 25%, var(--rule)); }
  .deploy-confirm button.selected { border-color: var(--army-color); background: color-mix(in srgb, var(--army-color) 15%, var(--card)); }
  .decision-status { margin: 0 0 .65rem; color: var(--muted); font-size: var(--type-body); }
  .army-heading { padding-bottom: .5rem; }
  h3 { margin: 0; }
  .counts { font-size: var(--type-small); color: var(--muted); margin: .25rem 0 0; }
  .report-unit { padding: .8rem; border: 1px solid var(--rule); border-radius: 6px; margin-bottom: .55rem; transition: background-color .25s, border-color .25s, box-shadow .25s; }
  .lost { opacity: .65; }
  .unit-heading { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: .4rem; }
  .outcome { color: var(--muted); font-size: var(--type-small); }
  .meters { display: flex; gap: 1.25rem; font-size: var(--type-body); color: var(--muted); margin: .4rem 0; }
  .meters b { color: var(--ink); font-weight: 400; }
  .recovery-choice { display: flex; gap: .3rem; margin-top: .5rem; }
  .recovery-choice button { flex: 1; font-size: var(--type-small); padding: .4rem .3rem; }
  .recovery-choice button.selected { border-color: var(--army-color); background: color-mix(in srgb, var(--army-color) 15%, var(--card)); }
  .army-roll { display: flex; align-items: center; flex-wrap: wrap; gap: .5rem 1rem; margin-top: .8rem; padding-top: .8rem; border-top: 1px solid color-mix(in srgb, var(--army-color) 25%, var(--rule)); }
  .army-roll .counts { margin: 0; }
  .roll-penalty { margin: 0; font-size: var(--type-body); color: var(--muted); }
  .roll-penalty b { color: var(--ink); font-variant-numeric: tabular-nums; }
  .report-unit.rolling { border-color: var(--army-color); background: color-mix(in srgb, var(--army-color) 14%, var(--card)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--army-color) 25%, transparent); }
  .report-unit.revealed { animation: settle .6s ease-out; }
  .report-unit.recovered { border-color: var(--good); }
  .report-unit.failed { border-color: var(--rule); }
  @keyframes settle { from { background-color: color-mix(in srgb, var(--army-color) 22%, var(--card)); } to { background-color: transparent; } }
  .die { display: inline-grid; place-items: center; min-width: 1.7rem; height: 1.7rem; padding: 0 .3rem; border: 1px solid var(--ink); border-radius: 5px; background: var(--paper); font-variant-numeric: tabular-nums; font-size: var(--type-body); font-weight: 700; }
  .die.tumbling { animation: tumble .11s linear infinite; border-color: var(--army-color); }
  @keyframes tumble { from { transform: rotate(-8deg) scale(1.05); } to { transform: rotate(8deg) scale(.95); } }
  .recovered .die { border-color: var(--good); color: var(--good); }
  .failed .die { color: var(--muted); }
  .recovery-outcome { margin: .4rem 0 0; font-size: var(--type-body); }
  .recovered .recovery-outcome { color: var(--good); }
  .failed .recovery-outcome { color: var(--muted); }
  .recovery-outcome small { color: var(--muted); }
  .footer-actions .decision-status { margin: 0; align-self: center; }
  button.selected { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--card)); }
  .choice { display: flex; align-items: center; justify-content: space-between; gap: .6rem; margin-top: .6rem; font-size: var(--type-body); }
  small { display: block; font-size: var(--type-small); margin-top: .35rem; color: var(--muted); }
  .check-preview { font-variant-numeric: tabular-nums; }
  .instruction { padding: .75rem 1rem; border-left: 2px solid var(--accent); background: var(--band); margin-bottom: 1.25rem; }
  .instruction p { margin: .25rem 0 0; color: var(--muted); font-size: var(--type-body); }
  .loss-note { font-size: var(--type-small); color: var(--muted); margin: .7rem 0 0; }
  .map-choices button { display: flex; gap: .8rem; text-align: left; padding: 1rem; }
  .map-choices strong { display: block; font-size: var(--type-2); }
  .choice-mark { color: var(--accent); font-size: var(--type-2); }
  .field-layout { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(14rem, 1fr); gap: 1.25rem; margin-top: 1.2rem; }
  .map-preview { position: relative; height: 22rem; border: 1px solid var(--rule); border-radius: 6px; overflow: hidden; }
  .map-settings { display: flex; flex-direction: column; gap: .75rem; }
  .map-settings label { display: flex; justify-content: space-between; gap: .6rem; font-size: var(--type-body); }
  .map-settings select { min-width: 8rem; }
  .map-settings p { margin: 0; }
  .deployment-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
  .deployment-heading button { white-space: nowrap; font-size: var(--type-small); }
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
    .steps li { flex-direction: column; gap: .3rem; font-size: var(--type-small); }
    .map-preview { height: 17rem; }
  }
</style>
