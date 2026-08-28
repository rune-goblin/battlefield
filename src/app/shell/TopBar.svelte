<script lang="ts">
  import type { Snippet } from 'svelte';
  import { setDock, toggleDock, ui } from './layout.svelte.js';

  interface Props {
    /** Stage-specific readout, left of centre: round and turn in battle, the deploy note in
     * a placement stage. */
    status?: Snippet;
    /** Stage-specific controls, right of centre, before the dock toggles. */
    tools?: Snippet;
  }
  let { status, tools }: Props = $props();
</script>

<div class="topbar">
  <h1>Battlefield</h1>
  {#if status}<div class="status">{@render status()}</div>{/if}
  <div class="tools">
    {#if tools}{@render tools()}{/if}
    <div class="docks">
      {#each ['left', 'right'] as const as side (side)}
        <button
          class="dockbtn {side}"
          class:on={ui.has[side] && ui.dock[side] !== 'hidden'}
          disabled={!ui.has[side]}
          title={ui.has[side] ? `${ui.dock[side] === 'hidden' ? 'Show' : 'Hide'} the ${side} panel (${side === 'left' ? '[' : ']'}) · double-click to collapse it to a strip` : `No ${side} panel here`}
          aria-label="Toggle the {side} panel"
          onclick={() => toggleDock(side)}
          ondblclick={() => setDock(side, 'rail')}
        ></button>
      {/each}
    </div>
    <nav>
      <a href="rules.html" target="_blank" rel="noopener">Rules</a>
      <a href="https://github.com/rune-goblin/battlefield" target="_blank" rel="noopener">Source</a>
    </nav>
  </div>
</div>

<style>
  .topbar { display: flex; align-items: center; flex-wrap: nowrap; gap: .9rem; padding: .3rem .8rem; }
  h1 { flex: none; font-size: 1.05rem; }
  /* One line, and the first thing to give when the bar runs out of room — the panels and the
     board say the same things at more length. */
  .status { min-width: 0; font-size: .88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tools { flex: none; margin-left: auto; display: flex; align-items: center; gap: .6rem; }
  .tools :global(button) { white-space: nowrap; }
  nav { display: flex; }
  nav a { color: var(--muted); font-size: .82rem; margin-left: .7rem; }
  nav a:hover { color: var(--ink); }

  /* Two little page glyphs: a filled edge is a panel that is showing. */
  .docks { display: flex; gap: .25rem; }
  .dockbtn {
    width: 1.5rem; height: 1.15rem; padding: 0; border-radius: 3px;
    background: linear-gradient(to var(--to), var(--rule) 0 34%, transparent 34%);
  }
  .dockbtn.left { --to: right; }
  .dockbtn.right { --to: left; }
  .dockbtn.on { border-color: var(--accent); background: linear-gradient(to var(--to), var(--accent) 0 34%, transparent 34%); }
  .dockbtn:disabled { opacity: .3; }
</style>
