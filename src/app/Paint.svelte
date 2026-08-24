<script lang="ts">
  import { parse, type SquareTerrain } from '../engine/index.js';
  import Board from './Board.svelte';
  import { back, game, generate, next, save } from './game.svelte.js';

  const TERRAINS: SquareTerrain[] = ['open', 'forest', 'swamp', 'shallows', 'water', 'settlement'];
  type Tool = { kind: 'terrain'; terrain: SquareTerrain } | { kind: 'elevation'; level: number } | { kind: 'wall'; tier: number } | { kind: 'clear-wall' };
  let tool = $state<Tool>({ kind: 'terrain', terrain: 'open' });
  const wallMode = $derived(tool.kind === 'wall' || tool.kind === 'clear-wall');
  const is = (t: Tool) => JSON.stringify(t) === JSON.stringify(tool);

  function paint(n: string) {
    const board = game.setup.board;
    if (!board) return;
    const sq = parse(n);
    const s = board.squares[sq.rank][sq.file];
    if (tool.kind === 'terrain') {
      s.terrain = tool.terrain;
      if (tool.terrain === 'water') {
        s.elevation = 0;
        for (const u of game.setup.units) if (u.square === n) u.square = null;
      }
    } else if (tool.kind === 'elevation') {
      s.elevation = tool.level;
    }
    save();
  }
  function edge(key: string) {
    const board = game.setup.board;
    if (!board) return;
    if (tool.kind === 'wall') board.walls[key] = { tier: tool.tier, boxes: tool.tier + 1, remaining: tool.tier + 1 };
    else if (tool.kind === 'clear-wall') delete board.walls[key];
    save();
  }
</script>

<h2>Paint the board</h2>
{#if game.setup.board}
  <div class="card">
    <div class="palette">
      {#each TERRAINS as t (t)}<button class:on={is({ kind: 'terrain', terrain: t })} onclick={() => (tool = { kind: 'terrain', terrain: t })}>{t}</button>{/each}
    </div>
    <div class="palette">
      {#each [0, 1, 2] as l (l)}<button class:on={is({ kind: 'elevation', level: l })} onclick={() => (tool = { kind: 'elevation', level: l })}>elevation {l}</button>{/each}
    </div>
    <div class="palette">
      {#each [0, 1, 2, 3] as t (t)}<button class:on={is({ kind: 'wall', tier: t })} onclick={() => (tool = { kind: 'wall', tier: t })}>wall tier {t}</button>{/each}
      <button class:on={is({ kind: 'clear-wall' })} onclick={() => (tool = { kind: 'clear-wall' })}>remove wall</button>
    </div>
    <p class="muted">{wallMode ? 'Click an edge handle between two squares.' : 'Click a square to apply.'} Water sits at elevation 0; a difference of two levels between neighbours is a cliff.</p>
  </div>

  <Board board={game.setup.board} onSquare={wallMode ? undefined : paint} onEdge={edge} showEdgeHandles={wallMode} />
{/if}

<div class="row">
  <button onclick={back}>Back</button>
  <button onclick={generate}>Regenerate</button>
  <button class="primary" disabled={!game.setup.board} onclick={next}>Next: place units</button>
</div>
