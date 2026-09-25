<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import UnitEffects from './UnitEffects.svelte';
  import { statusEffectsOf } from './status-effects.js';
  import { notation } from '../engine/index.js';
  import BattleLog from './BattleLog.svelte';
  import BattleReport from './BattleReport.svelte';
  import BattleOutcome from './BattleOutcome.svelte';
  import { MapControls, TopBar } from './shell/index.js';
  import { presentStage, stage } from './stage-view.svelte.js';
  import ArmyReel from './ArmyReel.svelte';
  import BattleAnnouncement from './BattleAnnouncement.svelte';
  import { deselectUnit, endActivation, game, gmUserId, presentation, selectUnit, tableUsers, takeAction, undo } from './game.svelte.js';
  import { gameMap } from './map-style.svelte.js';
  import { useNotifications } from './notification-context.js';
  import EndBattleDialog from './EndBattleDialog.svelte';
  import { offTurnNote, turnNote, viewer } from './viewer.svelte.js';
  import { createBattleController } from './battle/battle-controller.svelte.js';
  import BattleOrders from './battle/BattleOrders.svelte';
  import BattlePins from './battle/BattlePins.svelte';
  import { battleOutcome, createBattleEnding, type EndingPhase } from './battle/battle-ending.js';

  const c = createBattleController({
    game, viewer, gameMap, presentation, takeAction, selectUnit, deselectUnit, endActivation, undo, tableUsers, offTurnNote,
    notifications: useNotifications(),
    board: () => stage.board,
  });

  onMount(c.connect);
  onDestroy(c.close);

  let endingPhase = $state<EndingPhase>('playing');
  const ending = createBattleEnding(() => stage.board?.remainingMs() ?? 0, phase => { endingPhase = phase; });
  const outcome = $derived(battleOutcome(c.b, game.control, gmUserId(), viewer.userId));
  $effect(() => { ending.update(`${game.battleId}:${c.b.day}`, c.b.phase === 'ended'); });
  onDestroy(ending.dispose);

  presentStage({
    leftTitle: 'Orders', leftWidth: 24, rightTitle: 'Battle log', rightWidth: 21,
    get top() { return top; }, get float() { return float; }, get pin() { return pin; }, get left() { return left; }, get right() { return right; },
    get modal() { return c.b.phase === 'ended' && (endingPhase === 'announcement' || endingPhase === 'report') ? result : undefined; },
    get aiming() { return c.aiming; },
    get board() { return c.board; },
  });
</script>

{#snippet result()}
  {#if endingPhase === 'announcement' || endingPhase === 'report'}
    <BattleOutcome {outcome} phase={endingPhase} onfinish={ending.announcementFinished}>
      <BattleReport backdrop={false} />
    </BattleOutcome>
  {/if}
{/snippet}

<svelte:window onkeydown={c.onKey} onpointerdown={c.onWindowPointerDown} onclick={c.onWindowClick} />

{#snippet top()}
  <TopBar>
    {#snippet status()}
      <strong>Day {c.b.day} · Round {c.b.round} / {c.b.roundsPerDay}</strong>
      <span class={c.b.pending === 'attacker' ? 'side-att' : 'side-def'}>{c.b.pending}</span>
      <span class="turn" class:mine={viewer.isHolder}>{turnNote()}</span>
      {#if c.active}<span class="muted">· {c.active.name}{c.locked ? ' is committed' : ''}</span>
      {:else}<span class="muted">· {c.myTurn ? 'choose an army' : 'watching'}</span>{/if}
      <span class="muted">· {c.spec}</span>
    {/snippet}
    {#snippet tools()}
      <button onclick={c.undoLast} disabled={!viewer.isGm || !game.history.length} title="Undo the last action">Undo</button>
      <button onclick={() => (c.ending = true)} disabled={!viewer.isGm} title="End this battle for the whole table">End battle</button>
    {/snippet}
  </TopBar>
{/snippet}

{#snippet float()}
  <MapControls
    board={stage.board}
    army={() => c.b.units.filter((u) => u.side === (c.active?.side ?? c.b.pending) && u.status === 'active').map((u) => notation(u.square))}
    armyLabel="Frame the {c.active?.side ?? c.b.pending} force"
  />
  {#if c.active}<UnitEffects unitName={c.active.name} effects={statusEffectsOf(c.active, c.b)} />{/if}
  {#if c.b.phase === 'battle'}
    {#if c.announced}<BattleAnnouncement kind="round" text={`Round ${c.announced.round}`} cue={`${c.announced.day}:${c.announced.round}`} />{/if}
    <ArmyReel
      units={c.roster}
      activated={c.b.activated}
      selected={c.active?.id ?? null}
      locked={c.locked}
      hovered={c.hoveredPiece}
      pick={c.pickUnit}
      hover={(id) => { c.hoveredCard = id; }}
    >
      {#snippet below()}
        {#if c.announced}
          <BattleAnnouncement kind="side" text={c.announced.pending === 'attacker' ? 'Attackers' : 'Defenders'}
            side={c.announced.pending} afterRound={c.announced.activated === 0} detail={c.announced.player} cue={`${c.announced.day}:${c.announced.round}:${c.announced.activated}:${c.announced.pending}`} />
        {/if}
      {/snippet}
    </ArmyReel>
  {/if}
{/snippet}

{#snippet pin()}
  <BattlePins {c} />
{/snippet}

{#snippet left()}
  <BattleOrders {c} />
{/snippet}

{#snippet right()}
  <BattleLog battle={c.b} />
{/snippet}

{#if c.ending}<EndBattleDialog close={() => (c.ending = false)} />{/if}

<style>
  .turn { padding: .05rem .45rem; border: 1px solid var(--rule); border-radius: 999px; font-size: var(--type-small); color: var(--muted); }
  .turn.mine { border-color: var(--accent); color: var(--ink); }
</style>
