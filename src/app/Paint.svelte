<script lang="ts">
  import { BRUSH_TERRAINS, sameBrush, type BoardEventOf, type Brush } from '../board/index.js';
  import PixiBoard from './PixiBoard.svelte';
  import { gameMap } from './map-style.svelte.js';
  import { AppShell, MapControls, TopBar } from './shell/index.js';
  import StageNav from './StageNav.svelte';
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

  let boardRef = $state<PixiBoard>();
</script>

<AppShell leftTitle="Brushes" leftWidth={17}>
  {#snippet top()}
    <TopBar>
      {#snippet status()}<span class="muted">Drag to paint · right-drag erases · shift-click fills</span>{/snippet}
      {#snippet tools()}<StageNav />{/snippet}
    </TopBar>
  {/snippet}

  {#snippet map()}
    <PixiBoard bind:this={boardRef} board={game.setup.board} mode="paint" fill {brush} onpaint={apply} onbrush={(b) => (brush = b)}
      terrainAppearance={gameMap.terrainAppearance} inkMap={gameMap.inkMap} />
  {/snippet}

  {#snippet float()}
    <MapControls board={boardRef} />
  {/snippet}

  {#snippet left()}
    <div class="palette">
      {#each BRUSH_TERRAINS as t, i (t)}
        <button class:on={on({ kind: 'terrain', terrain: t })} onclick={() => (brush = { kind: 'terrain', terrain: t })}>{i + 1} · {t}</button>
      {/each}
      {#each [0, 1, 2] as l, i (l)}
        <button class:on={on({ kind: 'elevation', level: l })} onclick={() => (brush = { kind: 'elevation', level: l })}>{'QWE'[i]} · elev {l}</button>
      {/each}
      {#each [-1, -2] as l, i (l)}
        <button class:on={on({ kind: 'elevation', level: l })} onclick={() => (brush = { kind: 'elevation', level: l })}>{'AS'[i]} · elev {l}</button>
      {/each}
      <button class:on={on({ kind: 'erase' })} onclick={() => (brush = { kind: 'erase' })}>X · erase</button>
    </div>
    <div class="palette">
      {#each [0, 1, 2, 3] as t (t)}
        <button class:on={on({ kind: 'wall', tier: t })} onclick={() => (brush = { kind: 'wall', tier: t })}>wall tier {t}</button>
      {/each}
      <button class:on={on({ kind: 'wall-clear' })} onclick={() => (brush = { kind: 'wall-clear' })}>remove wall</button>
    </div>
    <div class="row">
      <button disabled={!game.history.length} onclick={() => void run(undo())}>Undo stroke</button>
      <button onclick={() => void run(generate())}>Regenerate</button>
    </div>
    <ConnectionWarning board={game.setup.board} />
    <p class="muted">Height 1 grants +1 when attacking lower ground. Height 2 adds mountain defence and blocks shots through the hex. Forest screens grant +1 ranged cover; swamp gives −1 Defence.</p>
    <p class="muted">A bridge replaces a water hex with a one-point crossing. Paint adjacent bridge or shallows hexes across a wider river until the banks connect.</p>
    <p class="muted">
      A wall brush snaps to the nearest edge between two squares. Click the board first, then
      <kbd>1</kbd>–<kbd>7</kbd>, <kbd>Q</kbd>/<kbd>W</kbd>/<kbd>E</kbd>/<kbd>A</kbd>/<kbd>S</kbd>, <kbd>R</kbd> (repeat to cycle tier),
      <kbd>X</kbd>, <kbd>Esc</kbd>. Wheel zooms, middle-drag or space-drag pans, double-click refits.
      Water sits at elevation 0; a difference of two levels between neighbours is a cliff.
    </p>
  {/snippet}
</AppShell>

<style>
  .palette { margin: 0; }
  .palette button { font-size: .82rem; padding: .2rem .5rem; }
</style>
