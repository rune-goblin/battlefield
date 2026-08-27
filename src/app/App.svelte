<script lang="ts">
  import BoardSetup from './BoardSetup.svelte';
  import Paint from './Paint.svelte';
  import Place from './Place.svelte';
  import Battle from './Battle.svelte';
  import { back, forward, game, STAGE_SIDE, type Stage } from './game.svelte.js';

  const STAGES: { id: Stage; label: string }[] = [
    { id: 'board', label: '1 · Battlefield' }, { id: 'paint', label: '2 · Paint' },
    { id: 'attackers', label: '3 · Attackers' }, { id: 'defenders', label: '4 · Defenders' }, { id: 'battle', label: '5 · Battle' },
  ];

  const step = $derived(forward());
</script>

<div class="wrap">
  <div class="topbar">
    <div class="brand"><h1>Battlefield</h1><span class="muted">Sixty-one hexes, three actions, four wounds.</span></div>
    <nav><a href="rules.html" target="_blank" rel="noopener">Rules</a><a href="https://github.com/rune-goblin/battlefield" target="_blank" rel="noopener">Source</a></nav>
  </div>
  {#if game.stage !== 'battle'}
    <div class="stagebar">
      {#each STAGES as s (s.id)}<span class="step" class:on={game.stage === s.id}>{s.label}</span>{/each}
      <div class="nav">
        <button onclick={back} disabled={game.stage === 'board'}>Back</button>
        <button class="primary" disabled={!step.enabled} onclick={step.go}>{step.label}</button>
      </div>
    </div>
  {/if}
  {#if game.stage === 'battle' && game.battle}
    <Battle />
  {:else if STAGE_SIDE[game.stage] && game.setup.board}
    <Place side={STAGE_SIDE[game.stage]!} />
  {:else if game.stage === 'paint' && game.setup.board}
    <Paint />
  {:else}
    <BoardSetup />
  {/if}
</div>
