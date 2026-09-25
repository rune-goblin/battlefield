<script lang="ts">
  import { FORTIFICATIONS } from '../engine/board.js';
  import { BRUSH_TERRAINS, sameBrush, type BoardEventOf, type Brush } from '../board/index.js';
  import { gameMap } from './map-style.svelte.js';
  import { MapControls, TopBar } from './shell/index.js';
  import { presentStage, stage } from './stage-view.svelte.js';
  import WizardRail from './WizardRail.svelte';
  import WizardSteps from './WizardSteps.svelte';
  import ConnectionWarning from './ConnectionWarning.svelte';
  import { game, generate, paintStroke, undo } from './game.svelte.js';
  import { useNotifications } from './notification-context.js';
  import { commandReporter, COMMAND_NOTICE } from './command-notices.js';
  import { onDestroy } from 'svelte';

  const notifications = useNotifications();
  const run = commandReporter(notifications);
  onDestroy(() => notifications.dismiss(COMMAND_NOTICE));

  let brush = $state<Brush | null>({ kind: 'terrain', terrain: 'open' });
  const on = (b: Brush) => sameBrush(b, brush);

  // The service applies the stroke and clears whatever placement it puts on water; the
  // executor's own history holds the undo snapshot now, not a local stack here.
  function apply(event: BoardEventOf<'paint'>): void {
    void run(paintStroke({ cells: event.cells, edges: event.edges, brush: event.brush }));
  }

  presentStage({
    leftTitle: 'Brushes', leftWidth: 17,
    get top() { return top; }, get rail() { return rail; }, get leftHead() { return steps; }, get float() { return float; }, get left() { return left; },
    get board() {
      return {
        board: game.setup.board, mode: 'paint' as const, brush, onpaint: apply, onbrush: (b: Brush | null) => (brush = b),
        terrainAppearance: gameMap.terrainAppearance, inkMap: gameMap.inkMap,
      };
    },
  });
</script>

{#snippet top()}
  <TopBar>
    {#snippet status()}<span class="muted">Drag to paint · right-drag erases · shift-click fills</span>{/snippet}
  </TopBar>
{/snippet}

{#snippet rail()}<WizardRail />{/snippet}

{#snippet steps()}<WizardSteps />{/snippet}

{#snippet float()}
  <MapControls board={stage.board} />
{/snippet}

{#snippet left()}
  <section class="brush-section" aria-labelledby="terrain-heading">
    <h3 id="terrain-heading">Terrain</h3>
    <div class="palette terrain-brushes">
      {#each BRUSH_TERRAINS as t, i (t)}
        <button class:on={on({ kind: 'terrain', terrain: t })} aria-pressed={on({ kind: 'terrain', terrain: t })}
          onclick={() => (brush = { kind: 'terrain', terrain: t })}><span class="terrain-name">{t}</span><kbd>{i + 1}</kbd></button>
      {/each}
    </div>
  </section>
  <section class="brush-section" aria-labelledby="elevation-heading">
    <h3 id="elevation-heading">Elevation <span>Low → high</span></h3>
    <div class="palette elevation-brushes">
      {#each [{ level: -2, key: 'S' }, { level: -1, key: 'A' }, { level: 0, key: 'Q' }, { level: 1, key: 'W' }, { level: 2, key: 'E' }] as item (item.level)}
        <button class:on={on({ kind: 'elevation', level: item.level })} aria-pressed={on({ kind: 'elevation', level: item.level })}
          title={`Set elevation to ${item.level}`} onclick={() => (brush = { kind: 'elevation', level: item.level })}>
          <span>{item.level > 0 ? `+${item.level}` : item.level < 0 ? `−${-item.level}` : '0'}</span><kbd>{item.key}</kbd>
        </button>
      {/each}
    </div>
  </section>
  <section class="brush-section" aria-labelledby="walls-heading">
    <h3 id="walls-heading">Walls <span>Weakest first</span></h3>
    <div class="palette wall-brushes">
      {#each FORTIFICATIONS as wall (wall.tier)}
        {@const tier = wall.tier}
        <button class:on={on({ kind: 'wall', tier })} aria-pressed={on({ kind: 'wall', tier })}
          title={`${wall.name}: ${wall.boxes} HP · Hardness ${wall.hardness} · Cover +${wall.cover}`}
          onclick={() => (brush = { kind: 'wall', tier })}>
          <span><span class="tier">{tier}</span> {wall.name}</span>
          <span class="wall-strength"><span class="strength-pips" aria-hidden="true">{#each [1, 2, 3, 4, 5] as pip}<i class:filled={pip <= wall.boxes}></i>{/each}</span>{wall.boxes} HP</span>
        </button>
      {/each}
    </div>
    <div class="palette wall-tools">
      <button title="Click a wall to cycle: open A → closed A → open B → closed B → no gate" class:on={brush?.kind === 'gate'} aria-pressed={brush?.kind === 'gate'} onclick={() => (brush = { kind: 'gate' })}>Gate</button>
      <button class:on={on({ kind: 'wall-clear' })} aria-pressed={on({ kind: 'wall-clear' })} onclick={() => (brush = { kind: 'wall-clear' })}>Remove wall</button>
    </div>
  </section>
  <div class="brush-tools">
    <div class="palette">
      <button class:on={on({ kind: 'erase' })} aria-pressed={on({ kind: 'erase' })} title="Reset a hex to open terrain at elevation 0" onclick={() => (brush = { kind: 'erase' })}>Erase <kbd>X</kbd></button>
      <button disabled={!game.history.length} onclick={() => void run(undo())}>Undo stroke</button>
    </div>
    <button class="regenerate" onclick={() => void run(generate())}>Regenerate map</button>
  </div>
  <ConnectionWarning board={game.setup.board} />
  <details>
    <summary>Terrain rules and shortcuts</summary>
  <p class="muted">Higher ground attacks at +1 and shoots a hex further a level; lower ground attacks at −1. A hex as high as the higher unit blocks the shot across it, and height 2 adds mountain defence. Forest and settlement grant +1 ranged cover; rough ground stops a charge; swamp gives −1 Defence and Strike.</p>
  <p class="muted">A bridge replaces a water hex with a one-point crossing. Paint adjacent bridge or shallows hexes across a wider river until the banks connect. A bridge brush on a hex that already carries a bridge turns its deck to the next axis; the direction is decoration, and a unit crosses from any side.</p>
  <p class="muted">
    A gate goes on a wall you have already painted and keeps its tier. The handles mark the interior, where a unit opens and closes the gate for one action; the dark reinforcement faces outward. Each click cycles open A, closed A, open B, closed B, then no gate. A starts on the wall’s inside; B faces the other way. The chosen state carries into battle. A wall brush snaps to the nearest edge between two squares. Click the board first, then
    <kbd>1</kbd>–<kbd>8</kbd>, <kbd>Q</kbd>/<kbd>W</kbd>/<kbd>E</kbd>/<kbd>A</kbd>/<kbd>S</kbd>, <kbd>R</kbd> (repeat to cycle tier),
    <kbd>X</kbd>, <kbd>Esc</kbd>. Wheel zooms, middle-drag or space-drag pans, double-click refits.
    Water can sit at any elevation. Terrain brushes preserve height; use an elevation brush to raise or lower it. A difference of two levels between neighbours is a cliff.
  </p>
  </details>
{/snippet}

<style>
  summary { cursor: pointer; color: var(--muted); font-size: var(--type-small); }
  .brush-section { margin-bottom: .85rem; }
  h3 { display: flex; align-items: baseline; justify-content: space-between; margin: 0 0 .4rem; font-size: var(--type-1); }
  h3 span { color: var(--muted); font-size: var(--type-small); font-weight: 400; }
  .palette { margin: 0; gap: .3rem; }
  .palette button { font-size: var(--type-small); padding: .3rem .45rem; min-width: 0; }
  .palette kbd { font-size: var(--type-small); border: 0; padding: 0; background: transparent; color: var(--muted); }
  .terrain-brushes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .terrain-brushes button, .wall-brushes button { display: flex; align-items: center; justify-content: space-between; gap: .4rem; }
  .terrain-name { text-transform: capitalize; }
  .elevation-brushes { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .elevation-brushes button { display: flex; flex-direction: column; align-items: center; gap: .15rem; }
  .wall-brushes { display: grid; grid-template-columns: minmax(0, 1fr); }
  .tier { display: inline-block; width: 1rem; color: var(--muted); font-variant-numeric: tabular-nums; }
  .wall-strength { display: flex; align-items: center; gap: .4rem; font-size: var(--type-small); white-space: nowrap; }
  .strength-pips { display: flex; gap: 2px; }
  .strength-pips i { width: 4px; height: 8px; background: currentColor; opacity: .18; }
  .strength-pips i.filled { opacity: .8; }
  .wall-tools { display: grid; grid-template-columns: 1fr 1fr; margin-top: .4rem; }
  .brush-tools { border-top: 1px solid var(--rule); padding-top: .65rem; margin-bottom: .8rem; }
  .brush-tools .palette { display: grid; grid-template-columns: 1fr 1fr; }
  .regenerate { width: 100%; margin-top: .3rem; font-size: var(--type-small); padding: .3rem .45rem; }
</style>
