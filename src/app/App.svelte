<script lang="ts">
  import Setup from './Setup.svelte';
  import Battle from './Battle.svelte';
  import { game } from './game.svelte.js';
</script>

<div class="wrap">
  <div class="topbar">
    <div><h1>Battlefield</h1><div class="muted">Seven steps, two actions, four wounds.</div></div>
    <nav><a href="rules.html" target="_blank" rel="noopener">Rules</a><a href="https://github.com/rune-goblin/battlefield" target="_blank" rel="noopener">Source</a></nav>
  </div>
  {#if game.screen === 'battle' && game.battle}
    <Battle />
  {:else}
    <Setup />
  {/if}
</div>
