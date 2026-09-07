<script lang="ts">
  import { FEATURES, HEX_TERRAINS, type GridKind } from '../engine/index.js';
  import PixiBoard from './PixiBoard.svelte';
  import { gameMap } from './map-style.svelte.js';
  import { AppShell, MapControls, TopBar } from './shell/index.js';
  import StageNav from './StageNav.svelte';
  import { game, generate, rerollSeed, save } from './game.svelte.js';

  const GRIDS: GridKind[] = ['hex', 'square'];

  const spec = $derived(game.setup.spec);
  const fortTier = $derived(spec.construction?.tier ?? -1);
  function setConstruction(tier: number) {
    game.setup.spec.construction = tier < 0 ? null : { kind: 'fort', tier };
    save();
  }

  let boardRef = $state<PixiBoard>();
</script>

<AppShell leftTitle="The ground" leftWidth={20}>
  {#snippet top()}
    <TopBar>
      {#snippet status()}<span class="muted">Rank 1 is the attacker's edge, rank 9 the defender's.</span>{/snippet}
      {#snippet tools()}<StageNav />{/snippet}
    </TopBar>
  {/snippet}

  {#snippet map()}
    <PixiBoard bind:this={boardRef} board={game.setup.board} fill
      terrainAppearance={gameMap.terrainAppearance} inkMap={gameMap.inkMap} />
  {/snippet}

  {#snippet float()}
    <MapControls board={boardRef} />
  {/snippet}

  {#snippet left()}
    <div class="fields">
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
      <label>Seed <input type="number" bind:value={game.setup.spec.seed} onchange={save}></label>
    </div>
    <div class="row">
      <button class="primary" onclick={generate}>Generate</button>
      <button onclick={rerollSeed}>Reroll seed</button>
    </div>
    <p class="muted">The seed reproduces the board exactly. Painting comes next; nothing here is final.</p>
    {#if !game.setup.board}<p class="muted">No board yet. Generate one.</p>{/if}
  {/snippet}
</AppShell>

<style>
  .fields { display: flex; flex-direction: column; gap: .45rem; }
  .fields label { display: grid; grid-template-columns: 7rem minmax(0, 1fr); align-items: center; gap: .4rem; }
</style>
