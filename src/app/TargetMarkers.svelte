<script lang="ts">
  import type { Point } from '../engine/index.js';
  import { targetIconUrl } from '../board/index.js';
  import { targetAnchor, targetText, type TargetMarker } from './targeting.js';

  interface Props {
    targets: TargetMarker[];
    screenOf: (cell: string) => Point | null;
    cellRadius?: (cell: string) => number | null;
    resolved?: boolean;
    opacity?: number;
    selected: string | null;
    hover: (id: string | null) => void;
    choose: (id: string) => void;
  }
  let { targets, screenOf, cellRadius, resolved = false, opacity = 1, selected, hover, choose }: Props = $props();
  let markers = $state<(TargetMarker & Point & { size: number })[]>([]);

  // The midpoint names a Line's pair; the centroid names a Burst's shared corner.
  // Follow the board through pan, zoom, resize, and recentering.
  $effect(() => {
    const shapes = targets;
    const locate = screenOf;
    let frame = 0;
    let previous = '';
    function follow() {
      const next = shapes.flatMap((target) => {
        const point = targetAnchor(target.anchorCells, locate);
        if (!point) return [];
        const radius = cellRadius?.(target.anchorCells[0]) ?? 42;
        const compact = target.geometry === 'edge' || target.geometry === 'corner';
        const size = compact ? Math.min(34, Math.max(24, radius * .65))
          : target.icon === 'shoot' ? Math.min(100, Math.max(64, radius * 1.65)) : Math.min(76, Math.max(44, radius * 1.2));
        return [{ ...target, ...point, size }];
      });
      const key = JSON.stringify(next);
      if (key !== previous) { markers = next; previous = key; }
      frame = requestAnimationFrame(follow);
    }
    follow();
    return () => cancelAnimationFrame(frame);
  });
</script>

{#each markers as marker (marker.id)}
  <button
    class="target-marker"
    data-selected={(marker.selected || selected === marker.id)}
    class:resolved
    class:compact={marker.geometry === 'edge' || marker.geometry === 'corner'}
    class:shoot={marker.icon === 'shoot'}
    tabindex={resolved ? -1 : 0}
    style:opacity
    style:width="{marker.size}px"
    style:height="{marker.size}px"
    style:left="{marker.x}px"
    style:top="{marker.y}px"
    aria-label={targetText(marker, marker.cells)}
    aria-pressed={(marker.selected || selected === marker.id)}
    title={targetText(marker, marker.cells)}
    onpointerenter={() => hover(marker.id)}
    onpointerleave={() => hover(null)}
    onfocus={() => hover(marker.id)}
    onblur={() => hover(null)}
    onclick={() => choose(marker.id)}
  >
    <img src={targetIconUrl(marker.icon)} alt="" draggable="false" />
    {#if marker.geometry === 'edge' || marker.geometry === 'corner'}<span class="geometry" aria-hidden="true">{marker.geometry === 'corner' ? '✦' : '↔'}</span>{/if}
  </button>
{/each}

<style>
  .target-marker {
    position: absolute; z-index: 5; pointer-events: auto;
    transform: translate(-50%, -50%); display: grid; place-items: center;
    padding: 0; border: 1px solid transparent; border-radius: 50%; background: transparent;
    cursor: crosshair;
  }
  .target-marker img { width: 100%; height: 100%; object-fit: contain; pointer-events: none; filter: drop-shadow(var(--icon-shadow)); }
  .target-marker.compact { background: var(--card); border-color: var(--accent); padding: 2px; }
  .geometry { position: absolute; right: -5px; bottom: -6px; font-size: var(--type-label); padding: 0 .15rem; border-radius: 3px; background: var(--card); color: var(--ink); }
  .target-marker:hover:not([data-selected='true']), .target-marker:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .target-marker:hover img { filter: drop-shadow(var(--icon-shadow-lift)) brightness(1.2); }
  .target-marker.resolved { pointer-events: none; animation: resolve .8s ease-out forwards; }
  @keyframes resolve { 0% { opacity: 1; transform: translate(-50%, -50%) scale(.9); } 45% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1.2); } }
  @media (prefers-reduced-motion: reduce) { .target-marker.resolved { animation: none; } }
</style>
