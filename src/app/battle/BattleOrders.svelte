<script lang="ts">
  import { ACTIONS_PER_ACTIVATION, engagedEnemies, isRouted, levelDc, ROUTED_AT, notation, shootCeiling, shootRangeLabel, reachOf } from '../../engine/index.js';
  import { actionIconUrl } from '../../board/index.js';
  import ActionCost from '../ActionCost.svelte';
  import { turnNote } from '../viewer.svelte.js';
  import type { BattleController } from './battle-controller.svelte.js';

  let { c }: { c: BattleController } = $props();
</script>

{#if c.active && c.act}
  <div class="orders-head">
    <h3 class={c.active.side === 'attacker' ? 'side-att' : 'side-def'}>{c.active.name}</h3>
    <span class="muted">{c.active.side} · {notation(c.active.square)}</span>
  </div>
  <div class="row action-pips">
    {#if c.active.actions > 0}<ActionCost n={c.active.actions} size="1.3em" />{/if}
    <span class="muted">{c.active.actions} of {ACTIONS_PER_ACTIVATION} left</span>
  </div>
  <p class="cost-key">
    Activities show their action cost: <ActionCost n={1} />, <ActionCost n={2} /> or
    <ActionCost n={3} />. Commit extra actions for +2 each on supported activities. One attack an activation.
  </p>

  {#if c.siegeEquipment.length || c.nearbyGates.length}
    <div class="row" aria-label="Equipment and gates">
      {#each c.siegeEquipment as engine (engine.id)}
        <button onclick={() => c.openSiege(engine.id)}>Operate {engine.name}</button>
      {/each}
      {#if c.nearbyGates.length}<button onclick={() => { c.cancelAction(); c.gateOpen = true; }}>Gates</button>{/if}
    </div>
  {/if}
  <table class="stats"><tbody>
    <tr><td>Strike</td><td class="stat">{c.active.stats.strike === null ? '—' : '+' + c.active.stats.strike}</td><td>Volley</td><td class="stat">{c.active.stats.volley === null ? '—' : `+${c.active.stats.volley} · ${['—', 'short', 'medium', 'long', 'extreme'][Math.max(0, reachOf(c.b, c.active))]}`}</td></tr>
    {#if shootCeiling(c.b, c.active) > 0}<tr><td>Range</td><td colspan="3">{shootRangeLabel(c.b, c.active)}</td></tr>{/if}
    <tr><td>Defence</td><td class="stat">{c.active.stats.defence}</td><td>Will</td><td class="stat">+{c.active.stats.will}</td></tr>
    <tr><td>Morale</td><td class="stat">{ROUTED_AT - c.active.disorder}/{ROUTED_AT}</td><td>Level DC</td><td class="stat">{levelDc(c.active.level)}</td></tr>
    <tr><td>Move</td><td class="stat">{c.act.speed} ft{c.act.feet ? ` (+${c.act.feet} banked)` : ''}</td><td>Engaged</td><td>{engagedEnemies(c.b, c.active).length}</td></tr>
    {#if c.active.tactics.length}<tr><td>Tactics</td><td colspan="3">{c.active.tactics.join(', ')}</td></tr>{/if}
    {#if c.status(c.active)}<tr><td>Status</td><td colspan="3">{c.status(c.active)}</td></tr>{/if}
  </tbody></table>

  <!-- Move opens with the selection rather than staying pinned: its bands are the same
       ones the board washes, and the rows track a live drag both ways. -->
  <div class="move-card">
    <button
      class="move-head"
      aria-expanded={c.moveOpen}
      onclick={() => { c.moveOpen = !c.moveOpen; if (!c.moveOpen) c.hoveredBand = null; }}
    >
      <h3>Move</h3>
      <span class="muted">
        {#if c.holders.length}
          — held in contact
        {:else if c.stuck}
          — {c.stuck.tag}
        {:else if c.moveOpen}
          — drag the token, or read the bands
        {:else}
          — {c.moveBands[1].length + c.moveBands[2].length + c.moveBands[3].length} cells reachable
        {/if}
      </span>
    </button>
    {#if c.moveOpen}
    {#if c.holders.length}
      <p class="move-note">
        <strong>{c.holders.map((e) => e.name).join(' and ')}</strong>
        {c.holders.length === 1 ? 'holds' : 'hold'} you. A Stride is closed while you are in
        contact — <strong>Maneuver</strong> is the only way off this square. Break off rolls
        once against the highest of them; pay more and they roll instead.
        {#if c.act.maneuver}
          Drag to one of its {c.act.maneuver.targets.length} cell{c.act.maneuver.targets.length === 1 ? '' : 's'}.
        {/if}
      </p>
    {:else if c.stuck}
      <p class="move-note">
        <img class="row-prop" src={actionIconUrl('no')} alt="" />
        {c.stuck.why}
      </p>
    {:else}
    <div class="move-rows">
      {#each ([1, 2, 3] as const) as n (n)}
        <div
          class="move-row band-{n}"
          class:current={c.dragBand === n}
          role="group"
          onmouseenter={() => { c.hoveredBand = n; }}
          onmouseleave={() => { if (c.hoveredBand === n) c.hoveredBand = null; }}
        >
          <span class="move-row-label"><ActionCost n={n} size="1.1em" /></span>
          <span class="muted">{c.moveBands[n].length} cell{c.moveBands[n].length === 1 ? '' : 's'} reachable</span>
        </div>
      {/each}
    </div>
    {/if}
    {/if}
  </div>

  {#if isRouted(c.active)}
    <p class="muted">
      Routed at {ROUTED_AT - c.active.disorder}/{ROUTED_AT} Morale — it may Move or maneuver, nothing else, and
      it leaves the field at its own edge. An ally's Rally, Inspire or Healing can bring it back.
    </p>
  {:else if !c.offers.length}
    <p class="muted">Nothing else to do here — end the turn.</p>
  {:else}
    <p class="muted hint">Touch a piece for what you can do to it, or drag your own to move.</p>
  {/if}

  <button class="end-turn" disabled={!c.myTurn} onclick={c.endTurn}>End turn</button>
{:else if c.myTurn}
  <p class="muted">Pick an army off the army reel above, or touch one of your own pieces on the board.</p>
{:else}
  <p class="muted">{turnNote()}. The board shows every move as it is made.</p>
{/if}

<style>
  .row-prop { width: 1.7rem; height: 1.3rem; object-fit: contain; }
  .orders-head { display: flex; align-items: baseline; gap: .5rem; }
  .orders-head h3 { margin: 0; }
  .orders-head .muted { font-size: .78rem; }
  .action-pips { align-items: center; gap: .45rem; margin: .3rem 0 .1rem; color: var(--accent); }
  .end-turn { width: 100%; margin-top: auto; }
  .cost-key { margin: .2rem 0 .5rem; font-size: .76rem; color: var(--muted); line-height: 1.7; }
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
  .move-note { margin: 0; padding: .45rem .55rem; border-radius: 6px; border-left: 4px solid var(--bad); background: var(--band); line-height: 1.45; }
  .move-row.current { outline: 2px solid var(--accent); outline-offset: -1px; }
  .move-row-label { display: inline-flex; align-items: center; min-width: 3rem; color: var(--ink); }
  .hint { font-size: .8rem; }
</style>
