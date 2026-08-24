<script lang="ts">
  import { FEATURES, HEX_TERRAINS } from '../engine/index.js';
  import Board from './Board.svelte';
  import PixiBoard from './PixiBoard.svelte';
  import { game, generate, next, rerollSeed, save } from './game.svelte.js';

  let pixiPreview = $state(false);

  const spec = $derived(game.setup.spec);
  const fortTier = $derived(spec.construction?.tier ?? -1);
  function setConstruction(tier: number) {
    game.setup.spec.construction = tier < 0 ? null : { kind: 'fort', tier };
    save();
  }
</script>

<h2>The battlefield</h2>
<div class="card">
  <div class="row">
    <label>Hex <select bind:value={game.setup.spec.base} onchange={save}>{#each HEX_TERRAINS as t (t)}<option value={t}>{t}</option>{/each}</select></label>
    <label>Feature <select bind:value={game.setup.spec.feature} onchange={save}>{#each FEATURES as f (f)}<option value={f}>{f}</option>{/each}</select></label>
    <label>Construction
      <select value={fortTier} onchange={(e) => setConstruction(Number(e.currentTarget.value))}>
        <option value={-1}>none</option>
        {#each [0, 1, 2, 3] as t (t)}<option value={t}>fort · tier {t}</option>{/each}
      </select>
    </label>
    <label>Seed <input type="number" bind:value={game.setup.spec.seed} onchange={save} style="width:9rem"></label>
  </div>
  <div class="row" style="margin-top:.6rem">
    <button class="primary" onclick={generate}>Generate</button>
    <button onclick={rerollSeed}>Reroll seed</button>
  </div>
  <p class="muted">Rank 1 is the attacker's edge, rank 8 the defender's. The seed reproduces the board; reroll until it looks like the hex.</p>
</div>

{#if game.setup.board}
  <label class="row" style="margin:.5rem 0"><input type="checkbox" bind:checked={pixiPreview}> Pixi preview</label>
  <div class:grid2={pixiPreview}>
    <Board board={game.setup.board} />
    {#if pixiPreview}<PixiBoard board={game.setup.board} />{/if}
  </div>
{:else}
  <p class="muted">No board yet. Generate one.</p>
{/if}

<div class="row">
  <button class="primary" disabled={!game.setup.board} onclick={next}>Next: paint</button>
</div>
