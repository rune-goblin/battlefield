<script lang="ts">
  import { BRUSH_TERRAINS, sameBrush, type BoardEventOf, type Brush } from '../board/index.js';
  import { parse, type Board } from '../engine/index.js';
  import PixiBoard from './PixiBoard.svelte';
  import { AppShell, MapControls, TopBar } from './shell/index.js';
  import StageNav from './StageNav.svelte';
  import { game, generate, save } from './game.svelte.js';

  const UNDO_LIMIT = 5;

  let brush = $state<Brush | null>({ kind: 'terrain', terrain: 'open' });
  let undoStack = $state<Board[]>([]);
  const on = (b: Brush) => sameBrush(b, brush);

  function paintCell(board: Board, key: string, b: Brush): void {
    const sq = parse(key);
    const square = board.squares[sq.rank][sq.file];
    if (b.kind === 'terrain') {
      square.terrain = b.terrain;
      if (b.terrain === 'water') square.elevation = 0;
    } else if (b.kind === 'elevation') {
      square.elevation = b.level;
    } else if (b.kind === 'erase') {
      square.terrain = 'open';
      square.elevation = 0;
    }
  }

  function paintEdge(board: Board, key: string, b: Brush): void {
    if (b.kind === 'wall') board.walls[key] = { tier: b.tier, boxes: b.tier + 1, remaining: b.tier + 1 };
    else if (b.kind === 'wall-clear' || b.kind === 'erase') delete board.walls[key];
  }

  // One store write per stroke: the whole pending set lands on a copy, which then replaces
  // the board. The copy doubles as the undo snapshot.
  function apply(event: BoardEventOf<'paint'>): void {
    const current = game.setup.board;
    if (!current) return;
    const before = $state.snapshot(current) as Board;
    const board = $state.snapshot(current) as Board;
    for (const key of event.cells) paintCell(board, key, event.brush);
    for (const key of event.edges) paintEdge(board, key, event.brush);
    for (const unit of game.setup.units) {
      if (!unit.square) continue;
      const sq = parse(unit.square);
      if (board.squares[sq.rank][sq.file].terrain === 'water') unit.square = null;
    }
    undoStack = [...undoStack, before].slice(-UNDO_LIMIT);
    game.setup.board = board;
    save();
  }

  function undo(): void {
    const previous = undoStack.at(-1);
    if (!previous) return;
    undoStack = undoStack.slice(0, -1);
    game.setup.board = previous;
    save();
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
    <PixiBoard bind:this={boardRef} board={game.setup.board} mode="paint" fill {brush} onpaint={apply} onbrush={(b) => (brush = b)} />
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
      <button disabled={!undoStack.length} onclick={undo}>Undo stroke</button>
      <button onclick={generate}>Regenerate</button>
    </div>
    <p class="muted">
      A wall brush snaps to the nearest edge between two squares. Click the board first, then
      <kbd>1</kbd>–<kbd>6</kbd>, <kbd>Q</kbd>/<kbd>W</kbd>/<kbd>E</kbd>/<kbd>A</kbd>/<kbd>S</kbd>, <kbd>R</kbd> (repeat to cycle tier),
      <kbd>X</kbd>, <kbd>Esc</kbd>. Wheel zooms, middle-drag or space-drag pans, double-click refits.
      Water sits at elevation 0; a difference of two levels between neighbours is a cliff.
    </p>
  {/snippet}
</AppShell>

<style>
  .palette { margin: 0; }
  .palette button { font-size: .82rem; padding: .2rem .5rem; }
</style>
