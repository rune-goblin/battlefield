<script lang="ts">
  import type { Snippet } from 'svelte';
  import { MAX_WOUNDS, ROUTED_AT, notation, type Unit } from '../engine/index.js';
  import { bannerSvg, cssHex, statusBars, STATUS_OUTLINE, STATUS_TRACK, troopArtUrl } from '../board/index.js';
  import { sideColour } from './presentation.js';

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
  const side = $derived(sideColour(units[0]?.side ?? 'attacker'));
  const ready = $derived(units.filter((u) => !done.has(u.id)));
  const spent = $derived(units.filter((u) => done.has(u.id)));
  const flag = bannerSvg('currentColor');
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
      <span class="square">{notation(u.square)}</span>
      <span class="flag" aria-label="Level {u.level}">{@html flag}<span class="level">{u.level}</span></span>
      <img class:desaturated={u.wounds >= MAX_WOUNDS || u.disorder >= ROUTED_AT} src={troopArtUrl(u.name, u.role)} alt="" />
      <span class="name" lang="en">{u.name}</span>
      <span class="status-bars" style:--track={cssHex(STATUS_TRACK)} style:--outline={cssHex(STATUS_OUTLINE)}>
        {#each [bars.health, bars.morale] as bar, i (i)}
          <span class="status-bar" class:morale={i === 1} role="meter" aria-label={bar.label} aria-valuemin={0} aria-valuemax={bar.max} aria-valuenow={bar.remaining} aria-valuetext={bar.label} title={bar.label}>
            <span class="bar-fill" style:width={`${bar.remaining / bar.max * 100}%`} style:background={cssHex(bar.colour)}></span>
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
        <span class="name" lang="en">{u.name}</span>
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
    --hi: color-mix(in srgb, var(--side) 65%, #fff);
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
    pointer-events: auto; position: relative;
    flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: .15rem;
    width: min-content; min-width: 5.4rem; padding: .25rem .35rem;
    /* Dark in both themes so the miniature and flag stand out; only the border carries the side. */
    background: var(--chip);
    border: 2px solid var(--side);
    border-radius: 8px; box-shadow: var(--shadow-1);
    font: inherit; font-size: var(--type-small); color: var(--chip-ink); text-align: center; cursor: pointer;
    /* Width follows the name's longest word and cannot tween, so a card grows by padding: the
       name keeps its room and does not rewrap mid-animation. */
    transition: min-width .16s ease, padding .16s ease, opacity .16s ease;
  }
  .unit-card .square {
    position: absolute; top: .2rem; left: .3rem;
    color: var(--chip-muted); font-size: var(--type-label); line-height: 1;
  }
  /* The piece's own flag, in the army's colour, with the level on its cloth. */
  .flag {
    position: absolute; top: -.1rem; right: .1rem; width: 1.5rem; height: 1.5rem;
    color: var(--side);
  }
  .flag :global(svg) { display: block; width: 100%; height: 100%; }
  .flag .level {
    position: absolute; inset: 0 0 .25rem; display: grid; place-items: center;
    color: var(--chip-ink); font-size: var(--type-label); font-weight: 700; line-height: 1;
  }
  .unit-card img {
    width: 3.2rem; height: 3.2rem; object-fit: contain;
    transition: width .16s ease, height .16s ease;
  }
  /* A card is as wide as its name's longest word, so a name wraps only between words; a third
     line is cut, since the title carries the whole name. */
  .name { overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; }
  .unit-card .name { font-weight: 600; line-height: var(--leading-heading); }

  /* The army reel reads like the Dock: the chosen army stands up out of the row and the rest step
     back, with a hover that shows what picking one would do. `.hot` is the same hover arriving
     from the board: card and miniature light together, whichever one the pointer is over. */
  .unit-card:hover:not(.on):not(:disabled),
  .unit-card.hot:not(.on):not(:disabled) { min-width: 5.6rem; padding-inline: .7rem; }
  .unit-card:hover:not(.on):not(:disabled) img,
  .unit-card.hot:not(.on):not(:disabled) img { width: 3.8rem; height: 3.8rem; }
  .unit-card:hover:not(:disabled), .unit-card.hot { border-color: var(--hi); }
  .unit-card.on {
    position: relative; z-index: 1;
    min-width: 6.6rem; padding: .45rem .95rem;
  }
  .unit-card.on img { width: 4.8rem; height: 4.8rem; }
  .unit-card.aside { opacity: .35; }

  .divider { flex: 0 0 auto; align-self: stretch; width: 1px; margin: .2rem .35rem; background: color-mix(in srgb, var(--side) 55%, var(--rule)); }
  /* An army that has acted keeps the card's dress and its side's edge, while the grey art says
     the turn is spent. */
  .chit {
    pointer-events: auto;
    flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: .1rem;
    width: min-content; min-width: 3.4rem; padding: .15rem .3rem;
    background: var(--chip);
    border: 1px solid var(--side); border-radius: 6px;
    color: var(--chip-muted);
  }
  .chit img { width: 2rem; height: 2rem; object-fit: contain; filter: grayscale(1); opacity: .7; }
  .chit .name { font-size: var(--type-label); line-height: var(--leading-heading); text-align: center; }

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
