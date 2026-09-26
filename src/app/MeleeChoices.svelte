<script lang="ts">
  import type { MeleePlan, Point } from '../engine/index.js';
  import { actionIconUrl } from '../board/index.js';
  import { ui } from './shell/layout.svelte.js';

  let { cell, plans, selected, screenOf, radiusOf, choose, hover }: {
    cell: string; plans: MeleePlan[]; selected: 'fight' | 'charge' | null;
    screenOf: (cell: string) => Point | null;
    radiusOf: (cell: string) => number | null;
    choose: (kind: 'fight' | 'charge') => void;
    hover: (kind: 'fight' | 'charge' | null) => void;
  } = $props();
  let anchor = $state<Point | null>(null);
  $effect(() => {
    const target = cell;
    let frame = 0;
    function follow() {
      const point = screenOf(target);
      if (point) {
        const halfWidth = plans.length * 40;
        const x = Math.max(ui.chrome.left + halfWidth + 8, Math.min(window.innerWidth - ui.chrome.right - halfWidth - 8, point.x));
        const y = Math.max(ui.chrome.top + 92, point.y - (radiusOf(target) ?? 42) - 8);
        if (!anchor || anchor.x !== x || anchor.y !== y) anchor = { x, y };
      }
      frame = requestAnimationFrame(follow);
    }
    follow();
    return () => cancelAnimationFrame(frame);
  });
  // The buttons unmount under the pointer when the choice closes, and no leave event fires.
  $effect(() => () => hover(null));
</script>

{#if anchor}
  <div class="melee-choices" role="group" aria-label="Choose a melee action" style:left="{anchor.x}px" style:top="{anchor.y}px">
    {#each plans as plan (plan.kind)}
      {@const label = plan.kind === 'fight' ? 'Melee' : 'Charge'}
      <button class:selected={selected === plan.kind} aria-pressed={selected === plan.kind}
        title={`${label}. Choose to review and confirm.`}
        onpointerenter={() => hover(plan.kind)} onpointerleave={() => hover(null)}
        onfocus={() => hover(plan.kind)} onblur={() => hover(null)}
        onclick={() => choose(plan.kind)}>
        <img src={actionIconUrl(plan.kind === 'fight' ? 'attack' : 'charge')} alt="" draggable="false" />
        <strong>{label}</strong>
      </button>
    {/each}
  </div>
{/if}

<style>
  .melee-choices { position: absolute; z-index: 5; display: flex; gap: .35rem; transform: translate(-50%, -100%); pointer-events: auto; }
  button { display: flex; flex-direction: column; align-items: center; min-width: 4.2rem; gap: .1rem; padding: .3rem; border: 1px solid var(--rule); border-radius: 8px; background: var(--card); color: var(--ink); font: inherit; font-size: var(--type-small); box-shadow: var(--shadow-1); cursor: pointer; }
  button:hover, button:focus-visible, button.selected { outline: 2px solid var(--accent); outline-offset: 1px; }
  img { height: 2.5rem; width: auto; pointer-events: none; }
</style>
