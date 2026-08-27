<script lang="ts">
  import { FEATURES, HEX_TERRAINS, type GridKind } from '../engine/index.js';
  import PixiBoard from './PixiBoard.svelte';
  import { game, generate, rerollSeed, save } from './game.svelte.js';

  const GRIDS: GridKind[] = ['hex', 'square'];

  const spec = $derived(game.setup.spec);
  const fortTier = $derived(spec.construction?.tier ?? -1);
  function setConstruction(tier: number) {
    game.setup.spec.construction = tier < 0 ? null : { kind: 'fort', tier };
    save();
  }
</script>

<div class="stage">
  <div class="card controls">
    <div class="row">
      <label>Hex <select bind:value={game.setup.spec.base} onchange={save}>{#each HEX_TERRAINS as t (t)}<option value={t}>{t}</option>{/each}</select></label>
      <label>Grid
        <select value={spec.grid ?? 'hex'} onchange={(e) => { game.setup.spec.grid = e.currentTarget.value as GridKind; generate(); }}>
          {#each GRIDS as g (g)}<option value={g}>{g}</option>{/each}
        </select>
      </label>
      <label>Feature <select bind:value={game.setup.spec.feature} onchange={save}>{#each FEATURES as f (f)}<option value={f}>{f}</option>{/each}</select></label>
      <label>Construction
        <select value={fortTier} onchange={(e) => setConstruction(Number(e.currentTarget.value))}>
          <option value={-1}>none</option>
          {#each [0, 1, 2, 3] as t (t)}<option value={t}>fort · tier {t}</option>{/each}
        </select>
      </label>
      <label>Seed <input type="number" bind:value={game.setup.spec.seed} onchange={save} style="width:8rem"></label>
      <button class="primary" onclick={generate}>Generate</button>
      <button onclick={rerollSeed}>Reroll seed</button>
      <span class="muted hint">Rank 1 is the attacker's edge, rank 9 the defender's. The seed reproduces the board.</span>
    </div>
  </div>

  {#if game.setup.board}
    <div class="boardfill"><PixiBoard board={game.setup.board} fill /></div>
  {:else}
    <p class="muted">No board yet. Generate one.</p>
  {/if}
</div>

<style>
  .controls { padding: .55rem .7rem; }
  .hint { flex: 1; min-width: 14rem; }
</style>
