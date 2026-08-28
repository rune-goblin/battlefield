<script lang="ts">
  import BoardSetup from './BoardSetup.svelte';
  import Paint from './Paint.svelte';
  import Place from './Place.svelte';
  import Battle from './Battle.svelte';
  import { game, STAGE_SIDE } from './game.svelte.js';
</script>

<!-- Every stage mounts its own AppShell: the shell is the layout, the stage says what goes in
     its layers. App itself only decides which stage is on. -->
{#if game.stage === 'battle' && game.battle}
  <Battle />
{:else if STAGE_SIDE[game.stage] && game.setup.board}
  <Place side={STAGE_SIDE[game.stage]!} />
{:else if game.stage === 'paint' && game.setup.board}
  <Paint />
{:else}
  <BoardSetup />
{/if}
