<script lang="ts">
  import BoardSetup from './BoardSetup.svelte';
  import Paint from './Paint.svelte';
  import Place from './Place.svelte';
  import Battle from './Battle.svelte';
  import { game, type Stage } from './game.svelte.js';

  const STAGES: { id: Stage; label: string }[] = [
    { id: 'board', label: '1 · Battlefield' }, { id: 'paint', label: '2 · Paint' }, { id: 'place', label: '3 · Place units' }, { id: 'battle', label: '4 · Battle' },
  ];
</script>

<div class="wrap">
  <div class="topbar">
    <div><h1>Battlefield</h1><div class="muted">Sixty-one hexes, three actions, four wounds.</div></div>
    <nav><a href="rules.html" target="_blank" rel="noopener">Rules</a><a href="https://github.com/rune-goblin/battlefield" target="_blank" rel="noopener">Source</a></nav>
  </div>
  {#if game.stage !== 'battle'}
    <div class="stagebar">{#each STAGES as s (s.id)}<span class:on={game.stage === s.id}>{s.label}</span>{/each}</div>
  {/if}
  {#if game.stage === 'battle' && game.battle}
    <Battle />
  {:else if game.stage === 'place' && game.setup.board}
    <Place />
  {:else if game.stage === 'paint' && game.setup.board}
    <Paint />
  {:else}
    <BoardSetup />
  {/if}
</div>
