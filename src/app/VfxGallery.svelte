<script lang="ts">
  // proto: the spell-effect gallery behind `?vfx`. One small board per tree, framed on a
  // caster and its target, with a play button — so every effect can be watched side by side
  // and tuned by eye without playing a battle up to a cast.
  import { onDestroy, onMount } from 'svelte';
  import { setVfxTimeScale, type TokenModel } from '../board/index.js';
  import { generateBoard, TREE_LABEL, TREES, type Tree } from '../engine/index.js';
  import PixiBoard from './PixiBoard.svelte';

  const CASTER = 'd3';
  const TARGET = 'd6';
  const FRAME = ['c3', 'e6'];
  const board = generateBoard({ base: 'plains', feature: 'none', construction: null, seed: 7 });
  const tokens: TokenModel[] = [
    { kind: 'unit', id: 'caster', side: 'attacker', name: 'Apprentice Magician Clique', role: 'infantry', level: 5, cell: CASTER, wounds: 0, disorder: 0, engine: null, verdict: null, statuses: [], pick: null, ring: null },
    { kind: 'unit', id: 'target', side: 'defender', name: 'Kobold Warriors', role: 'infantry', level: 3, cell: TARGET, wounds: 1, disorder: 0, engine: null, verdict: null, statuses: [], pick: null, ring: null },
  ];

  const panes: Partial<Record<Tree, PixiBoard>> = $state({});
  let speed = $state(1);
  let loop = $state(false);
  let fromCaster = $state(true);
  let timer: ReturnType<typeof setInterval> | null = null;

  $effect(() => { setVfxTimeScale(speed); });

  function frameAll() {
    for (const pane of Object.values(panes)) pane?.frame(FRAME);
  }

  function play(tree: Tree) {
    panes[tree]?.frame(FRAME);
    panes[tree]?.burst(TARGET, tree, fromCaster ? CASTER : null);
  }

  function playAll() {
    for (const tree of TREES) play(tree);
  }

  $effect(() => {
    if (timer) clearInterval(timer);
    timer = null;
    if (!loop) return;
    playAll();
    timer = setInterval(playAll, 2600 / speed);
  });

  // The boards fit themselves to the whole grid on their first resize, which lands on its
  // own schedule per board; framing twice covers the slow ones without a handshake.
  onMount(() => {
    const ids = [120, 700].map((ms) => setTimeout(frameAll, ms));
    window.addEventListener('resize', frameAll);
    return () => { ids.forEach(clearTimeout); window.removeEventListener('resize', frameAll); };
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
    setVfxTimeScale(1);
  });

  function key(e: KeyboardEvent) {
    if (e.key === ' ') { e.preventDefault(); playAll(); }
    const i = Number(e.key) - 1;
    if (i >= 0 && i < TREES.length) play(TREES[i]);
  }
</script>

<svelte:window onkeydown={key} />

<div class="gallery">
  <div class="panes">
    {#each TREES as tree, i (tree)}
      <section class="pane">
        <header>
          <h2>{i + 1} · {TREE_LABEL[tree]}</h2>
          <button onclick={() => play(tree)}>Play</button>
        </header>
        <!-- The number keys are the keyboard way in; the pane click is a convenience. -->
        <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
        <div class="board" onclick={() => play(tree)}>
          <PixiBoard bind:this={panes[tree]} {board} {tokens} fill mode="view" frozen />
        </div>
      </section>
    {/each}
  </div>
  <div class="controls">
    <button onclick={playAll}>Play all (space)</button>
    <label>speed
      <select bind:value={speed}>
        <option value={1}>1×</option>
        <option value={0.5}>½×</option>
        <option value={0.25}>¼×</option>
        <option value={0.1}>⅒×</option>
      </select>
    </label>
    <label><input type="checkbox" bind:checked={loop} /> loop</label>
    <label><input type="checkbox" bind:checked={fromCaster} /> from caster</label>
    <span class="hint">Click a pane or press its number to play it.</span>
    <a class="back" href="./">← Game board</a>
  </div>
</div>

<style>
  .gallery { position: fixed; inset: 0; display: grid; grid-template-rows: 1fr auto; background: #111; color: #ddd; font: 13px var(--sans); }
  .panes { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 1fr); gap: 0.5rem; padding: 0.5rem; min-height: 0; }
  /* min-width: 0 on every grid item: the canvas's own width attribute would otherwise blow
     the pane out past its column and the board would frame itself for that wider box. */
  .pane { display: grid; grid-template-rows: auto 1fr; min-height: 0; min-width: 0; border: 1px solid #333; border-radius: 6px; overflow: hidden; background: #1c1f1c; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 0.3rem 0.6rem; background: #181818; }
  h2 { margin: 0; font-size: 13px; font-weight: 600; }
  .board { min-height: 0; min-width: 0; overflow: hidden; cursor: pointer; }
  .controls { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; padding: 0.5rem 0.75rem; background: #181818; border-top: 1px solid #333; }
  .hint { color: #888; }
  .back { margin-left: auto; color: #888; }
  .back:hover { color: #ddd; }
  button { padding: 0.25rem 0.6rem; border: 1px solid #555; border-radius: 4px; background: #222; color: #ddd; cursor: pointer; }
  button:hover { background: #333; }
  label { display: inline-flex; gap: 0.3rem; align-items: center; }
</style>
