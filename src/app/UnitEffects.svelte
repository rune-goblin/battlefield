<script lang="ts">
  import { statusIconUrl } from '../board/index.js';
  import type { StatusEffect } from './status-effects.js';
  import { onEscape } from './keys.js';

  interface Props { unitName: string; effects: StatusEffect[] }
  let { unitName, effects }: Props = $props();

  let openStatus = $state<string | null>(null);
  const open = $derived(effects.find((e) => e.status === openStatus) ?? null);
  let missingArt = $state<Record<string, boolean>>({});
</script>

<svelte:window onkeydown={onEscape(() => (openStatus = null))} />

{#if effects.length}
  <aside class="effects" aria-label="Conditions on {unitName}">
    {#if open}
      <div class="detail {open.tone}" role="dialog" aria-label={open.label}>
        <header>
          <h3>{open.label}</h3>
          <button class="close" aria-label="Close" onclick={() => (openStatus = null)}>×</button>
        </header>
        <p class="on">{unitName}</p>
        <p>{open.text}</p>
      </div>
    {/if}
    <ul>
      {#each effects as e (e.status)}
        <li>
          <button
            class="icon {e.tone}" class:on={openStatus === e.status}
            aria-label="{e.label}: show its effects" aria-expanded={openStatus === e.status}
            onclick={() => (openStatus = openStatus === e.status ? null : e.status)}
          >
            {#if missingArt[e.status]}
              <span class="initial">{e.label[0]}</span>
            {:else}
              <img src={statusIconUrl(e.status)} alt="" onerror={() => (missingArt[e.status] = true)} />
            {/if}
            {#if e.badge}<span class="badge">{e.badge}</span>{/if}
          </button>
          <span class="tip">{e.label}</span>
        </li>
      {/each}
    </ul>
  </aside>
{/if}

<style>
  .effects {
    position: absolute;
    top: calc(var(--inset-top, 0px) + .85rem);
    right: calc(var(--inset-right, 0px) + .85rem);
    display: flex; align-items: flex-start; gap: .5rem;
    pointer-events: none;
  }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .35rem; }
  li { position: relative; display: flex; justify-content: flex-end; }

  .icon {
    pointer-events: auto; position: relative; width: 2.75rem; height: 2.75rem; padding: 0;
    border: 2px solid var(--tone); border-radius: 6px; background: var(--glass); overflow: visible;
    box-shadow: 0 2px 8px rgba(0, 0, 0, .35);
  }
  .icon img { width: 100%; height: 100%; object-fit: cover; border-radius: 4px; display: block; }
  .icon.on { box-shadow: 0 0 0 2px var(--tone), 0 2px 8px rgba(0, 0, 0, .35); }
  .initial { font-size: var(--type-3); font-weight: 700; color: var(--tone); }
  .good { --tone: var(--good); }
  .warn { --tone: var(--warn2); }
  .badge {
    position: absolute; right: -.3rem; bottom: -.3rem; min-width: 1.15rem; padding: 0 .2rem;
    font-size: var(--type-label); font-weight: 700; line-height: 1.15rem; text-align: center; font-variant-numeric: tabular-nums;
    color: var(--paper); background: var(--tone); border-radius: 999px;
  }

  .tip {
    position: absolute; right: calc(100% + .45rem); top: 50%; translate: 0 -50%;
    padding: .15rem .5rem; font-size: var(--type-small); white-space: nowrap; border-radius: 4px;
    color: var(--paper); background: color-mix(in srgb, var(--ink) 88%, transparent);
    opacity: 0; pointer-events: none; transition: opacity .12s;
  }
  li:hover .tip, .icon:focus-visible + .tip { opacity: 1; }

  .detail {
    pointer-events: auto; order: -1; width: 19rem; padding: .6rem .8rem .7rem;
    background: var(--card); border: 1px solid var(--tone);
    border-radius: 8px; box-shadow: 0 6px 22px rgba(0, 0, 0, .4); font-size: var(--type-body);
  }
  .detail header { display: flex; align-items: baseline; gap: .5rem; }
  .detail h3 { flex: 1; margin: 0; color: var(--tone); }
  .detail p { margin: .35rem 0 0; line-height: var(--leading-compact); }
  .detail .on { margin-top: .1rem; font-size: var(--type-small); font-weight: 600; color: var(--muted); }
  .close { border: 0; background: none; padding: 0 .2rem; font-size: var(--type-2); line-height: 1; color: var(--muted); }
  /* An open panel covers its neighbours' names, so they stay down while it is up. */
  .effects:has(.detail) .tip { display: none; }
</style>
