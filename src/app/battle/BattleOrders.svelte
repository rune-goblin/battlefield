<script lang="ts">
  import { notation, CELL_FEET } from '../../engine/index.js';
  import { actionIconUrl } from '../../board/index.js';
  import ActionCost from '../ActionCost.svelte';
  import ActionBudget from '../ActionBudget.svelte';
  import UnitSheet from './UnitSheet.svelte';
  import GateStatus from '../GateStatus.svelte';
  import { turnNote } from '../viewer.svelte.js';
  import { signed } from '../presentation.js';
  import type { BattleController } from './battle-controller.svelte.js';

  let { c }: { c: BattleController } = $props();
  const interiorGates = $derived(c.gates.filter((g) => g.interior));
</script>

{#if c.active && c.act}
  <div class="orders-head">
    <h3 class={c.active.side === 'attacker' ? 'side-att' : 'side-def'}>{c.active.name}</h3>
    <span class="muted">{c.active.side} · {notation(c.active.square)}</span>
  </div>
  <div class="row action-pips">
    <ActionBudget remaining={c.actionsLeft} bonus={c.active.haste > 0 ? 1 : 0} />
    <span class="muted">{c.actionsLeft} left</span>
  </div>
  <UnitSheet battle={c.b} unit={c.active} />

  {#if c.siegeEquipment.length || interiorGates.length}
    <div class="equipment-controls" aria-label="Equipment and gates">
      {#each c.siegeEquipment as engine (engine.id)}
        <button onclick={() => c.openSiege(engine.id)}>Operate {engine.name}</button>
      {/each}
      {#each interiorGates as gate (gate.key)}
        <button class="gate-control" disabled={!c.myTurn || c.gateBusy || !!gate.reason}
          title={gate.reason ?? `Gate ${gate.name} is ${gate.open ? 'open' : 'closed'}. Costs one action.`}
          onclick={() => { c.cancelAction(); void c.operateGate(gate.key); }}>
          <GateStatus open={gate.open} />
          <span>{gate.open ? 'Close' : 'Open'} gate{#if interiorGates.length > 1}<small>{gate.name}</small>{/if}</span>
          <ActionCost n={1} />
        </button>
      {/each}
    </div>
  {/if}
  <details class="unit-details">
    <summary>Tactics and rules</summary>
  <table class="stats"><tbody>
    <tr><td>Level</td><td>{c.active.level}</td><td>Level DC</td><td>{c.activeDc}</td></tr>
    <tr><td>Engaged</td><td>{c.drag.holders.length}</td><td>Banked move</td><td>{Number((c.act.feet / CELL_FEET).toFixed(2))} points</td></tr>
    {#if c.active.tactics.length}<tr><td>Tactics</td><td colspan="3">{c.active.tactics.join(', ')}</td></tr>{/if}
    {#if c.statusLine}<tr><td>Status</td><td colspan="3">{c.statusLine}</td></tr>{/if}
  </tbody></table>
    <p class="cost-key">One attack per activation. Each extra action adds +2 to a supported roll.</p>
  </details>

  <!-- Move opens with the selection rather than staying pinned: its bands are the same
       ones the board washes, and the rows track a live drag both ways. -->
  <div class="move-card">
    <button
      class="move-head"
      aria-expanded={c.drag.moveOpen}
      onclick={() => { c.drag.moveOpen = !c.drag.moveOpen; if (!c.drag.moveOpen) c.drag.hoveredBand = null; }}
    >
      <h3>Move</h3>
      <span class="muted">
        {#if c.drag.holders.length}
          — held in contact
        {:else if c.drag.stuck}
          — {c.drag.stuck.tag}
        {:else if c.drag.moveOpen}
          — drag to move
        {:else}
          — {c.drag.moveBands[1].length + c.drag.moveBands[2].length + c.drag.moveBands[3].length} cells reachable
        {/if}
      </span>
    </button>
    {#if c.drag.moveOpen}
    {#if c.drag.holders.length}
      <p class="move-note">
        <strong>{c.drag.holders.map((e) => e.name).join(' and ')}</strong>
        {c.drag.holders.length === 1 ? 'holds' : 'hold'} this unit in contact.
        {#if c.act.escape}A Move away rolls Reflex {signed(c.act.escape.modifier)} against DC {c.act.escape.dc}.{/if}
        {#if c.act.steps.length}A Step to open ground needs no roll.{/if}
      </p>
    {/if}
    {#if c.drag.stuck}
      <p class="move-note">
        <img class="row-prop" src={actionIconUrl('no')} alt="" />
        {c.drag.stuck.why}
      </p>
    {:else}
    <div class="move-rows">
      {#each ([1, 2, 3] as const) as n (n)}
        <div
          class="move-row band-{n}"
          class:current={c.drag.dragBand === n}
          role="group"
          onmouseenter={() => { c.drag.hoveredBand = n; }}
          onmouseleave={() => { if (c.drag.hoveredBand === n) c.drag.hoveredBand = null; }}
        >
          <span class="move-row-label"><ActionCost n={n} size="1.1em" /></span>
          <span class="muted">{c.drag.moveBands[n].length} cell{c.drag.moveBands[n].length === 1 ? '' : 's'} reachable</span>
        </div>
      {/each}
    </div>
    {/if}
    {/if}
  </div>

  {#if c.activeRouted}
    <p class="muted">
      Routed · Move or Step to your edge, or recover Morale with an ally.
    </p>
  {:else if !c.offers.length}
    <p class="muted">End this turn when ready.</p>
  {:else}
    <p class="muted hint">Select a piece for actions. Drag your unit to move.</p>
  {/if}

  <button class="end-turn" disabled={!c.myTurn} onclick={c.endTurn}>End turn</button>
{:else if c.myTurn}
  <p class="muted">Select a unit from your army or the board.</p>
{:else}
  <p class="muted">{turnNote()}.</p>
{/if}

<style>
  .unit-details { margin: .5rem 0; }
  summary { cursor: pointer; color: var(--muted); font-size: var(--type-body); }
  .equipment-controls { display: flex; flex-direction: column; gap: .35rem; margin: .3rem 0 .6rem; }
  .gate-control { display: flex; align-items: center; gap: .6rem; text-align: left; }
  .gate-control > span { flex: 1; }
  .gate-control small { display: block; color: var(--muted); }
  .row-prop { width: 1.7rem; height: 1.3rem; object-fit: contain; }
  .orders-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: .2rem .5rem; }
  .orders-head h3 { margin: 0; }
  .orders-head .muted { font-size: var(--type-small); }
  .action-pips { align-items: center; gap: .8rem; margin: .4rem 0 .1rem; }
  .end-turn { width: 100%; margin-top: auto; }
  .cost-key { margin: .2rem 0 .5rem; font-size: var(--type-small); color: var(--muted); line-height: var(--leading-body); }
  .move-card h3 { margin: 0; font-size: inherit; }
  .move-head {
    display: flex; align-items: baseline; gap: .4rem; width: 100%;
    margin: 0 0 .4rem; padding: 0; border: 0; background: none;
    color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .move-rows { display: flex; flex-direction: column; gap: .25rem; }
  .move-row {
    display: flex; justify-content: space-between; align-items: center; gap: .5rem;
    padding: .3rem .55rem; border-radius: 6px; background: var(--band);
  }
  .move-note .row-prop { vertical-align: -.35rem; margin-right: .2rem; }
  .move-note { margin: 0; padding: .45rem .55rem; border-radius: 6px; border-left: 4px solid var(--bad); background: var(--band); line-height: var(--leading-compact); }
  .move-row.current { outline: 2px solid var(--accent); outline-offset: -1px; }
  .move-row-label { display: inline-flex; align-items: center; min-width: 3rem; color: var(--ink); }
  .hint { font-size: var(--type-small); }
</style>
