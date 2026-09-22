<script lang="ts">
  import type { Snippet } from 'svelte';
  import { MAX_WOUNDS, ROUTED_AT, notation, type Unit } from '../engine/index.js';
  import { troopArtUrl } from '../board/index.js';
  import { statusBars, statusColourCss, STATUS_TRACK, STATUS_OUTLINE } from '../board/status-bars.js';

  interface Props {
    /** Every standing unit of the side now on turn, in activation order. */
    units: Unit[];
    activated: string[];
    selected: string | null;
    /** An activation already under way: the pick stands until it ends. */
    locked: boolean;
    /** The piece the pointer is over on the board, so a card lights with its own miniature. */
    hovered: string | null;
    pick: (u: Unit) => void;
    hover: (id: string | null) => void;
    below?: Snippet;
  }
  let { units, activated, selected, locked, hovered, pick, hover, below }: Props = $props();

  const done = $derived(new Set(activated));
  const side = $derived(units[0]?.side === 'defender' ? 'var(--def)' : 'var(--att)');
  const ready = $derived(units.filter((u) => !done.has(u.id)));
  const spent = $derived(units.filter((u) => done.has(u.id)));
</script>

<div class="reel-position" style:--side={side}>
<div class="army-reel">
  {#each ready as u (u.id)}
    {@const bars = statusBars(u.wounds, u.disorder)}
    <button
      class="unit-card"
      class:on={selected === u.id}
      data-selected={selected === u.id}
      aria-pressed={selected === u.id}
      class:aside={locked && selected !== u.id}
      class:hot={hovered === u.id}
      disabled={locked && selected !== u.id}
      title={locked && selected !== u.id ? 'An army is already committed this activation' : `${u.name}\n${bars.health.label}\n${bars.morale.label}`}
      onclick={() => pick(u)}
      onpointerenter={() => hover(u.id)}
      onpointerleave={() => hover(null)}
      onfocus={() => hover(u.id)}
      onblur={() => hover(null)}
    >
      <img class:desaturated={u.wounds >= MAX_WOUNDS || u.disorder >= ROUTED_AT} src={troopArtUrl(u.name, u.role)} alt="" />
      <span class="name">{u.name}</span>
      <span class="meta">L{u.level} · {notation(u.square)}</span>
      <span class="status-bars" style:--track={statusColourCss(STATUS_TRACK)} style:--outline={statusColourCss(STATUS_OUTLINE)}>
        {#each [bars.health, bars.morale] as bar, i}
          <span class="status-bar" class:morale={i === 1} role="meter" aria-label={bar.label} aria-valuemin={0} aria-valuemax={bar.max} aria-valuenow={bar.remaining} aria-valuetext={bar.label} title={bar.label}>
            <span class="bar-fill" style:width={`${bar.remaining / bar.max * 100}%`} style:background={statusColourCss(bar.colour)}></span>
            {#each Array(bar.max - 1) as _, n (n)}
              <span class="bar-tick" style:left={`${(n + 1) / bar.max * 100}%`}></span>
            {/each}
          </span>
        {/each}
      </span>
    </button>
  {:else}
    <p class="muted empty">Every army has acted. The round turns.</p>
  {/each}
  {#if spent.length}
    <span class="divider"></span>
    {#each spent as u (u.id)}
      <span class="chit" title="{u.name} has acted">
        <img src={troopArtUrl(u.name, u.role)} alt="" />
        <span class="name">{u.name}</span>
      </span>
    {/each}
  {/if}
</div>
{#if below}{@render below()}{/if}
</div>

<style>
  /* The army reel hangs over the top of the map rather than sitting in the chrome: it takes no
     inset, so the board keeps the whole canvas, and the ground shows between the cards. Only
     the cards themselves take the pointer — the strip around them belongs to the map.
     It centres on the canvas, not on the strip the docks leave: the board does not move when
     a panel opens, so the armies over it must not move either. */
  .reel-position {
    /* Army colour identifies the card; the shared neutral outline identifies selection. */
    --hi: color-mix(in srgb, var(--side) 65%, var(--ink));
    position: absolute; pointer-events: none;
    top: calc(var(--inset-top, 0px) + .5rem);
    left: .5rem;
    right: .5rem;
  }
  .army-reel {
    display: flex; align-items: flex-start; justify-content: safe center;
    gap: .4rem; overflow-x: auto; padding: .15rem;
  }
  .empty {
    pointer-events: auto; margin: 0; padding: .3rem .7rem; border-radius: 999px;
    background: color-mix(in srgb, var(--side) 22%, var(--glass));
  }

  .unit-card {
    pointer-events: auto;
    flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: .15rem;
    width: 4.4rem; padding: .25rem;
    background: color-mix(in srgb, var(--side) 30%, var(--glass));
    border: 1px solid color-mix(in srgb, var(--side) 60%, var(--rule));
    border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, .22);
    font: inherit; font-size: .68rem; color: var(--ink); text-align: center; cursor: pointer;
    transition: width .16s ease, padding .16s ease, font-size .16s ease, opacity .16s ease;
  }
  .unit-card img {
    width: 2.5rem; height: 2.5rem; object-fit: contain;
    transition: width .16s ease, height .16s ease;
  }
  .unit-card .name { font-weight: 600; line-height: 1.15; }
  .unit-card .meta { color: var(--muted); font-size: .92em; }

  /* The army reel reads like the Dock: the chosen army stands up out of the row and the rest step
     back, with a hover that shows what picking one would do. `.hot` is the same hover arriving
     from the board: card and miniature light together, whichever one the pointer is over. */
  .unit-card:hover:not(.on):not(:disabled),
  .unit-card.hot:not(.on):not(:disabled) { width: 5.2rem; font-size: .72rem; }
  .unit-card:hover:not(.on):not(:disabled) img,
  .unit-card.hot:not(.on):not(:disabled) img { width: 3.1rem; height: 3.1rem; }
  .unit-card:hover:not(:disabled), .unit-card.hot { border-color: var(--hi); }
  .unit-card.on {
    position: relative; z-index: 1;
    width: 6.6rem; padding: .45rem; font-size: .8rem;
  }
  .unit-card.on img { width: 4.2rem; height: 4.2rem; }
  .unit-card.aside { opacity: .35; }

  .divider { flex: 0 0 auto; align-self: stretch; width: 1px; margin: .2rem .35rem; background: color-mix(in srgb, var(--side) 55%, var(--rule)); }
  /* An army that has acted keeps its colour and loses its miniature: the chip stays tinted so the
     row still reads as one side, while the grey art says the turn is spent. */
  .chit {
    pointer-events: auto;
    flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: .1rem;
    width: 3.2rem; padding: .15rem .1rem; opacity: .7;
    background: color-mix(in srgb, var(--side) 18%, transparent);
    border: 1px solid color-mix(in srgb, var(--side) 35%, transparent); border-radius: 6px;
    color: color-mix(in srgb, var(--hi) 65%, var(--muted));
    text-shadow: 0 1px 2px var(--paper);
  }
  .chit img { width: 2rem; height: 2rem; object-fit: contain; filter: grayscale(1); }
  .chit .name { font-size: .6rem; line-height: 1.1; text-align: center; }

  .status-bars { display: flex; flex-direction: column; gap: 2px; width: 2.7rem; margin-top: 1px; }
  .status-bar { position: relative; display: block; height: .45rem; border: 1px solid var(--outline); background: var(--track); overflow: hidden; }
  .status-bar.morale { height: .28rem; }
  .bar-fill { display: block; height: 100%; }
  .bar-tick { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--outline); opacity: .5; }
  .unit-card img.desaturated { filter: grayscale(1); }

  @media (prefers-reduced-motion: reduce) {
    .unit-card, .unit-card img { transition: none; }
  }
</style>
