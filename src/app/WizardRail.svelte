<script lang="ts">
  import { goToStage, nav, stageReason, stepDone, STEPS } from './navigation.svelte.js';

  const current = $derived(STEPS.findIndex((s) => s.id === nav.stage));
</script>

<nav class="wizard" aria-label="Create a battle">
  <h2>Create a battle</h2>
  <ol>
    {#each STEPS as s, i (s.id)}
      {@const done = i !== current && stepDone(s.id)}
      {@const reason = stageReason(s.id)}
      <li class:on={i === current} class:done title={reason ?? undefined}>
        <button
          disabled={!!reason}
          title={reason ?? s.hint}
          aria-label={s.label}
          aria-current={i === current ? 'step' : undefined}
          onclick={() => goToStage(s.id)}
        >
          <span class="mark">{done ? '✓' : i + 1}</span>
          <span class="text">
            <span class="label">{s.label}</span>
            {#if i === current}<span class="hint">{s.hint}</span>{/if}
          </span>
        </button>
      </li>
    {/each}
  </ol>
</nav>

<style>
  .wizard {
    pointer-events: auto;
    width: 13rem; flex: none; min-height: 0; overflow: auto;
    display: flex; flex-direction: column; gap: .6rem; padding: .7rem .6rem .8rem;
    background: color-mix(in srgb, var(--band) 92%, transparent);
    backdrop-filter: blur(6px);
    border-right: 1px solid var(--rule);
  }
  h2 { margin: 0 .3rem; border: 0; padding: 0; font-size: .9rem; font-weight: 600; color: var(--muted); }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }

  /* The line between two marks: a step's own mark sits on it. */
  li { position: relative; }
  li:not(:last-child)::after {
    content: ''; position: absolute; left: 1.17rem; top: 2.1rem; bottom: -.45rem; width: 1px; background: var(--rule);
  }

  li button {
    width: 100%; display: flex; gap: .55rem; align-items: flex-start; text-align: left;
    padding: .4rem .35rem; border: 0; border-radius: 6px; background: none;
  }
  li button:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .mark {
    position: relative; z-index: 1; flex: none; width: 1.65rem; height: 1.65rem; border-radius: 50%;
    display: grid; place-items: center; font-size: .8rem; font-variant-numeric: tabular-nums;
    border: 1px solid var(--rule); background: var(--card); color: var(--muted);
  }
  .text { display: flex; flex-direction: column; min-width: 0; }
  .label { font-size: .92rem; line-height: 1.25; color: var(--muted); }
  .hint { font-size: .7rem; line-height: 1.3; color: var(--muted); opacity: .8; }

  li.done .mark { border-color: var(--good); color: var(--good); }
  li.on .mark { background: var(--accent); border-color: var(--accent); color: var(--paper); font-weight: 700; }
  li.on .label { color: var(--ink); font-weight: 600; }

  @media (max-width: 60rem) {
    .wizard { width: 3rem; padding-inline: .3rem; }
    h2, .text { display: none; }
  }
</style>
