<script lang="ts">
  import { at, gridOf, parse, type Board } from '../engine/index.js';
  import { brokenCells, surfaceGroup, TERRAIN_LABELS, type FallenModel, type TokenModel } from '../board/index.js';

  interface Props { board: Board | null; cell: string | null; tokens: TokenModel[]; fallen: FallenModel[] }
  let { board, cell, tokens, fallen }: Props = $props();

  const info = $derived.by(() => {
    if (!board || !cell) return null;
    const sq = parse(cell);
    if (!gridOf(board).inBounds(sq)) return null;
    const { terrain, elevation } = at(board, sq);
    const grid = gridOf(board);
    const ground = terrain === 'bridge' ? 'Bridge' : TERRAIN_LABELS[surfaceGroup(board, sq)];
    const rough = brokenCells(board).some((c) => grid.key(c) === cell);
    return {
      terrain: rough ? `${ground}, rough` : ground,
      elevation: elevation > 0 ? `+${elevation}` : elevation < 0 ? `−${-elevation}` : '0',
      names: tokens.filter((t) => t.cell === cell).map((t) => t.name),
      fallen: fallen.filter((f) => f.cell === cell),
    };
  });
</script>

{#if info}
  <div class="hex-info" role="status">
    <span class="cell">{cell}</span>
    <span class="terrain">{info.terrain}</span>
    <span>height {info.elevation}</span>
    {#each info.names as name (name)}<span class="unit">{name}</span>{/each}
    {#each info.fallen as dead (dead.id)}<span class="fallen">{dead.name} deceased</span>{/each}
  </div>
{/if}

<style>
  .hex-info {
    position: absolute; z-index: 5;
    bottom: calc(var(--inset-bottom, 0px) + .85rem);
    left: calc((100% + var(--inset-left, 0px) - var(--inset-right, 0px)) / 2);
    transform: translateX(-50%);
    display: flex; gap: .9rem; align-items: baseline; white-space: nowrap;
    padding: .35rem .8rem; border-radius: 8px; font-size: var(--type-body);
    background: color-mix(in srgb, var(--card) 72%, transparent);
    border: 1px solid color-mix(in srgb, var(--rule) 70%, transparent);
    backdrop-filter: blur(3px);
    pointer-events: none;
  }
  .cell { color: var(--muted); font-variant-numeric: tabular-nums; }
  .terrain { font-weight: 600; }
  .unit { color: var(--accent); font-weight: 600; }
  .fallen { color: var(--muted); font-style: italic; }
</style>
