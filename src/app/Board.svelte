<script lang="ts">
  import { edgeKey, FILES, inBounds, notation, SIZE, type Board, type Side, type Square } from '../engine/index.js';

  export interface BoardUnit {
    id: string; name: string; side: Side; square: string;
    wounds?: number; shaken?: number; active?: boolean; tags?: string;
  }

  interface Props {
    board: Board;
    units?: BoardUnit[];
    highlight?: Set<string>;
    selected?: string | null;
    onSquare?: (notation: string) => void;
    onEdge?: (key: string) => void;
    onUnit?: (id: string) => void;
    showEdgeHandles?: boolean;
  }
  let { board, units = [], highlight = new Set(), selected = null, onSquare, onEdge, onUnit, showEdgeHandles = false }: Props = $props();

  const ranks = Array.from({ length: SIZE }, (_, i) => SIZE - 1 - i);
  const files = Array.from({ length: SIZE }, (_, i) => i);
  const byId = $derived(new Map(units.map((u) => [u.square, u])));

  const east = (sq: Square): Square | null => (inBounds({ file: sq.file + 1, rank: sq.rank }) ? { file: sq.file + 1, rank: sq.rank } : null);
  const south = (sq: Square): Square | null => (inBounds({ file: sq.file, rank: sq.rank - 1 }) ? { file: sq.file, rank: sq.rank - 1 } : null);
  const wall = (a: Square, b: Square | null) => (b ? board.walls[edgeKey(a, b)] : undefined);
  const cliff = (a: Square, b: Square | null) => !!b && Math.abs(board.squares[a.rank][a.file].elevation - board.squares[b.rank][b.file].elevation) >= 2;
</script>

<div class="boardwrap">
  <div class="ranks">{#each ranks as r (r)}<span>{r + 1}</span>{/each}</div>
  <div class="grid">
    {#each ranks as rank (rank)}
      {#each files as file (file)}
        {@const sq = { file, rank }}
        {@const n = notation(sq)}
        {@const s = board.squares[rank][file]}
        {@const u = byId.get(n)}
        {@const we = wall(sq, east(sq))}
        {@const ws = wall(sq, south(sq))}
        <div
          class="sq {s.terrain}"
          class:hi={highlight.has(n)}
          class:sel={selected === n}
          class:click={!!onSquare}
          role="button"
          tabindex={onSquare ? 0 : -1}
          title={`${n} · ${s.terrain}${s.elevation ? ` · elevation ${s.elevation}` : ''}`}
          onclick={() => onSquare?.(n)}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSquare?.(n); } }}
        >
          {#if s.elevation > 0}<span class="elev">{'▲'.repeat(s.elevation)}</span>{/if}
          <span class="coord">{n}</span>
          {#if u}
            <div
              class="chip"
              class:def={u.side === 'defender'}
              class:active={u.active}
              class:clickable={!!onUnit}
              title={u.tags || u.name}
              role="button"
              tabindex={onUnit ? 0 : -1}
              onclick={(e) => { if (onUnit) { e.stopPropagation(); onUnit(u.id); } }}
              onkeydown={(e) => { if (onUnit && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); onUnit(u.id); } }}
            >
              <span class="name">{u.name}</span>
              {#if u.wounds !== undefined}
                <span class="pips">{#each [1, 2, 3, 4] as k (k)}<span class="pip" class:on={(u.wounds ?? 0) >= k}></span>{/each}</span>
                <span class="pips">{#each [1, 2, 3] as k (k)}<span class="pip shaken" class:on={(u.shaken ?? 0) >= k}></span>{/each}</span>
              {/if}
            </div>
          {/if}
          {#if we}<span class="wall e" class:breached={we.remaining === 0}></span>
          {:else if cliff(sq, east(sq))}<span class="cliff e"></span>{/if}
          {#if ws}<span class="wall s" class:breached={ws.remaining === 0}></span>
          {:else if cliff(sq, south(sq))}<span class="cliff s"></span>{/if}
          {#if showEdgeHandles && onEdge}
            {#if east(sq)}<button type="button" class="handle e" title="Wall east of {n}" onclick={(e) => { e.stopPropagation(); onEdge(edgeKey(sq, east(sq)!)); }} aria-label="Wall east of {n}"></button>{/if}
            {#if south(sq)}<button type="button" class="handle s" title="Wall south of {n}" onclick={(e) => { e.stopPropagation(); onEdge(edgeKey(sq, south(sq)!)); }} aria-label="Wall south of {n}"></button>{/if}
          {/if}
        </div>
      {/each}
    {/each}
  </div>
  <div class="files">{#each files as f (f)}<span>{FILES[f]}</span>{/each}</div>
</div>
