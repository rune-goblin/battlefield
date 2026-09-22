<script lang="ts">
  import type { ActivityTarget } from '../../engine/index.js';

  let { targets, selected, choose, hover, cells, label = 'Targets' }: {
    targets: ActivityTarget[]; selected: string | null;
    choose: (id: string) => void; hover: (id: string | null) => void;
    cells: (target: ActivityTarget) => string[]; label?: string;
  } = $props();
  let toggle: HTMLButtonElement;
  let open = $state(false);
  let page = $state(0);
  const pageSize = 3;
  const pages = $derived(Math.max(1, Math.ceil(targets.length / pageSize)));
  const current = $derived(Math.min(page, pages - 1));
  const selection = $derived(targets.find(target => target.id === selected));
  $effect(() => { void targets; page = 0; });
</script>

<div class="target-choices">
  {#if selection}<p class="selection" aria-live="polite">{selection.label} · {cells(selection).join(' + ')}</p>{/if}
  <button bind:this={toggle} class="toggle" aria-expanded={open} onclick={() => { open = !open; hover(null); }}>
    {open ? 'Hide target list' : 'Choose from list'} <span>{targets.length}</span>
  </button>
  {#if open}
    <div role="group" aria-label={label}>
      {#each targets.slice(current * pageSize, (current + 1) * pageSize) as target (target.id)}
        <button class="target" class:on={selected === target.id} aria-pressed={selected === target.id}
          onpointerenter={() => hover(target.id)} onpointerleave={() => hover(null)}
          onfocus={() => hover(target.id)} onblur={() => hover(null)}
          onclick={() => { choose(target.id); open = false; hover(null); toggle.focus(); }}>
          <strong>{target.label}</strong><small>{cells(target).join(' + ')}</small>
        </button>
      {/each}
      {#if !targets.length}<p>No target in range</p>{/if}
    </div>
    {#if pages > 1}
      <div class="pages">
        <button aria-label="Previous targets" disabled={current === 0} onclick={() => { page = current - 1; hover(null); }}>←</button>
        <span aria-live="polite">{current + 1} / {pages}</span>
        <button aria-label="Next targets" disabled={current === pages - 1} onclick={() => { page = current + 1; hover(null); }}>→</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .target-choices { margin: .35rem .3rem; }
  .selection { margin: .35rem 0; font-weight: 600; overflow-wrap: anywhere; }
  button { font: inherit; color: var(--ink); cursor: pointer; }
  .toggle { display: flex; justify-content: space-between; width: 100%; padding: .3rem 0; border: 0; background: transparent; text-align: left; }
  .toggle span, small, .pages span { color: var(--muted); }
  .target { display: flex; flex-direction: column; width: 100%; padding: .35rem .5rem; border: 1px solid transparent; border-radius: 6px; background: transparent; text-align: left; }
  .target:hover, .target.on { background: var(--band); border-color: var(--accent); }
  .pages { display: flex; justify-content: space-between; align-items: center; margin-top: .25rem; }
  .pages button { padding: .15rem .65rem; }
</style>
