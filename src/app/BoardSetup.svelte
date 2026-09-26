<script lang="ts">
  import { FORTIFICATIONS } from '../engine/board.js';
  import { FEATURES, HEX_TERRAINS, type BoardSize, type Feature, type GridKind, type HexTerrain } from '../engine/index.js';
  import { gameMap } from './map-style.svelte.js';
  import { MapControls, TopBar } from './shell/index.js';
  import { presentStage, stage } from './stage-view.svelte.js';
  import WizardRail from './WizardRail.svelte';
  import WizardSteps from './WizardSteps.svelte';
  import ConnectionWarning from './ConnectionWarning.svelte';
  import { editSpec, game, generate, rerollSeed, setRoundsPerDay } from './game.svelte.js';
  import { goToStage } from './navigation.svelte.js';
  import { useNotifications } from './notification-context.js';
  import { commandReporter, COMMAND_NOTICE } from './command-notices.js';
  import { onDestroy } from 'svelte';
  import { openingScene } from './scene-art.js';

  const notifications = useNotifications();
  const run = commandReporter(notifications);
  onDestroy(() => notifications.dismiss(COMMAND_NOTICE));

  const GRIDS: GridKind[] = ['hex', 'square'];

  const spec = $derived(game.setup.spec);
  const fortTier = $derived(spec.construction?.tier ?? -1);
  function setConstruction(tier: number) {
    void editAndRegenerate({ construction: tier < 0 ? null : { kind: 'fort', tier } });
  }

  // Every spec edit regenerates in the same gesture, so Generate always means a new layout.
  async function editAndRegenerate(patch: Partial<typeof spec>) {
    const edited = await run(editSpec(patch));
    if (edited.ok) await run(generate());
  }

  presentStage({
    leftTitle: 'The ground', leftWidth: 20,
    get top() { return top; }, get rail() { return rail; }, get leftHead() { return steps; }, get float() { return float; }, get left() { return left; },
    get pin() { return game.setup.board ? undefined : scene; },
    get board() {
      return { board: game.setup.board, terrainAppearance: gameMap.terrainAppearance, inkMap: gameMap.inkMap };
    },
  });
</script>

{#snippet top()}
  <TopBar>
    {#snippet status()}<span class="muted">Rank 1 is the attacker's edge, rank {game.setup.board?.squares.length ?? 15} the defender's.</span>{/snippet}
  </TopBar>
{/snippet}

{#snippet scene()}<img class="scene" src={openingScene} alt="" />{/snippet}

{#snippet rail()}<WizardRail />{/snippet}

{#snippet steps()}<WizardSteps />{/snippet}

{#snippet float()}
  <MapControls board={stage.board} />
{/snippet}

{#snippet left()}
  <div class="fields">
    <label>Rounds per day
      <select value={game.setup.roundsPerDay ?? 6} onchange={(e) => void run(setRoundsPerDay(Number(e.currentTarget.value)))}>
        <option value={6}>6 rounds</option><option value={8}>8 rounds</option>
      </select>
    </label>
    <label>Hex <select value={spec.base} onchange={(e) => void editAndRegenerate({ base: e.currentTarget.value as HexTerrain })}>{#each HEX_TERRAINS as t (t)}<option value={t}>{t}</option>{/each}</select></label>
    <label>Grid
      <select value={spec.grid ?? 'hex'} onchange={(e) => void editAndRegenerate({ grid: e.currentTarget.value as GridKind })}>
        {#each GRIDS as g (g)}<option value={g}>{g}</option>{/each}
      </select>
    </label>
    <label>Board size
      <select value={spec.size ?? 15} onchange={(e) => void editAndRegenerate({ size: Number(e.currentTarget.value) as BoardSize })}>
        <option value={15}>Field · {spec.grid === 'square' ? '15 × 15' : '169 hexes'}</option><option value={11}>Large · {spec.grid === 'square' ? '11 × 11' : '91 hexes'}</option><option value={9}>Original · {spec.grid === 'square' ? '9 × 9' : '61 hexes'}</option>
      </select>
    </label>
    <label>Feature <select value={spec.feature} onchange={(e) => void editAndRegenerate({ feature: e.currentTarget.value as Feature })}>{#each FEATURES as f (f)}<option value={f}>{f}</option>{/each}</select></label>
    <label>Construction
      <select value={fortTier} onchange={(e) => setConstruction(Number(e.currentTarget.value))}>
        <option value={-1}>none</option>
        {#each FORTIFICATIONS as wall (wall.tier)}<option value={wall.tier}>{wall.tier} · {wall.name}</option>{/each}
      </select>
    </label>
  </div>
  <div class="row">
    <button class="primary" onclick={() => void run(rerollSeed())}>Generate</button>
  </div>
  <p class="muted">Painting comes next; nothing here is final.</p>
  <ConnectionWarning board={game.setup.board} edit={() => goToStage('paint')} />
  {#if !game.setup.board}<p class="muted">No board yet. Generate one.</p>{/if}
{/snippet}

<style>
  .scene { width: 100%; height: 100%; object-fit: cover; }
  .fields { display: flex; flex-direction: column; gap: .45rem; }
  .fields label { display: grid; grid-template-columns: 7rem minmax(0, 1fr); align-items: center; gap: .4rem; }
</style>
