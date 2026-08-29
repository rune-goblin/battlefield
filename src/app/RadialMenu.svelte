<script lang="ts">
  import { cubicIn } from 'svelte/easing';
  import type { TransitionConfig } from 'svelte/transition';

  interface Item {
    key: string;
    src: string;
    label: string;
    legal: boolean;
  }

  interface Props {
    /** The piece's centre, in CSS pixels inside the board container. */
    x: number;
    y: number;
    /** The actor's cell circumradius on screen; the ring's hole clears it. */
    hole: number;
    items: Item[];
    pick: (key: string) => void;
  }
  let { x, y, hole, items, pick }: Props = $props();

  // The seat is UI, not board: it holds its size through pan and zoom. The icons are wider
  // than the track on purpose — they break both rims, so the ring reads as their backing
  // rather than as six buttons in a gutter.
  const SEAT = 96;
  const TRACK = 76;
  const CLEAR = 10;
  const MIN_IN = 67;

  // The hole sits outside the actor's hex, so the piece stays readable under an open ring.
  const R_IN = $derived(Math.max(hole + CLEAR, MIN_IN));
  const R_OUT = $derived(R_IN + TRACK);

  // Twelve o'clock, then clockwise. A ring is learned by direction, so the order must be the
  // same every time a piece is touched — `props` in Battle.svelte holds it at six.
  // Only the direction is fixed here; how far out the seat sits is whatever the band's
  // centre line reads this frame, so the icons open with the ring instead of beside it.
  const at = (i: number) => {
    const a = (-90 + (360 / items.length) * i) * (Math.PI / 180);
    return { ux: Math.cos(a), uy: Math.sin(a) };
  };

  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Closing is the one piece running backwards: scaling the ring carries its icons back down
  // their spokes with it. `t` falls 1 -> 0, so 0 is shut on the piece centre.
  const zip = (_node: Element): TransitionConfig => ({
    duration: reduced() ? 0 : 170,
    easing: cubicIn,
    css: (t: number) => `transform: scale(${0.06 + 0.94 * t}); opacity: ${t};`,
  });

  let hover = $state<number | null>(null);
</script>

<div class="radial" style="left: {x}px; top: {y}px">
  <!-- Band, rims and icons are one piece: everything is placed off --ro/--ri, so the outer edge
       can run ahead to full width while the hole opens behind it. -->
  <div class="ring" style="--ro: {R_OUT}; --ri: {R_IN}; --seat-size: {SEAT}px" out:zip>
    <div class="band"></div>
    <div class="rim outer"></div>
    <div class="rim inner"></div>

    {#each items as item, i (item.key)}
      {@const p = at(i)}
      <button
        class="slice"
        class:dim={!item.legal}
        aria-disabled={!item.legal}
        style="--ux: {p.ux}; --uy: {p.uy}"
        onclick={() => item.legal && pick(item.key)}
        onpointerenter={() => { hover = i; }}
        onpointerleave={() => { hover = hover === i ? null : hover; }}
      >
        <img class="face" src={item.src} alt={item.label} draggable="false" />
        <span class="name" class:show={hover === i}>{item.label}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .radial { position: absolute; z-index: 7; width: 0; height: 0; pointer-events: auto; }

  .ring {
    position: absolute; left: 0; top: 0; width: 0; height: 0;
    /* The rim reaches full width first; the hole trails it open. */
    animation:
      spread .26s cubic-bezier(.16, 1, .3, 1) backwards,
      hollow .40s cubic-bezier(.22, 1, .36, 1) 40ms backwards;
    --seat: calc((var(--ro) + var(--ri)) / 2);
  }

  .band, .rim {
    position: absolute; left: 0; top: 0;
    transform: translate(-50%, -50%);
    border-radius: 50%; pointer-events: none;
    width: calc(var(--ro) * 2px); height: calc(var(--ro) * 2px);
  }
  /* Translucent, so the board keeps reading through the ring — an opaque band flattens it. */
  .band {
    background: rgb(26 23 20 / .78);
    filter: drop-shadow(0 2px 4px rgb(0 0 0 / .18));
    mask: radial-gradient(
      closest-side,
      transparent calc(var(--ri) / var(--ro) * 100%),
      #000 calc(var(--ri) / var(--ro) * 100% + .5px)
    );
  }
  .rim { border: 1px solid rgb(150 143 132 / .5); }
  .inner { width: calc(var(--ri) * 2px); height: calc(var(--ri) * 2px); }

  .slice {
    position: absolute; left: 0; top: 0;
    width: var(--seat-size); height: var(--seat-size); padding: 0; border: 0; background: none;
    color: var(--ink); font: inherit; cursor: pointer;
    transform: translate(
      calc(-50% + var(--ux) * var(--seat) * 1px),
      calc(-50% + var(--uy) * var(--seat) * 1px)
    );
  }
  /* The seat rides the band; only the icon itself pops, so the two never come apart. The
     shadow is what separates it from the board where it overhangs the rims. */
  .face {
    position: absolute; inset: 0;
    width: 100%; height: 100%; object-fit: contain; pointer-events: none;
    filter: drop-shadow(0 2px 5px rgb(0 0 0 / .55));
    transition: transform .12s cubic-bezier(.25, 1.3, .45, 1), filter .12s ease;
    animation: pop .3s cubic-bezier(.25, 1.3, .45, 1) 120ms backwards;
  }

  /* The name is read off the pointer, not carried by every slice at once — six labelled discs
     is a wall of text, and the ring is meant to be learned by direction. Absolute, so revealing
     it never nudges the ring. */
  .name {
    position: absolute; top: 100%; left: 50%; transform: translate(-50%, .15rem);
    padding: .15rem .45rem; border-radius: 6px; white-space: nowrap;
    font-size: .95rem; font-weight: 600; pointer-events: none;
    background: var(--card); border: 1px solid var(--accent);
    opacity: 0; transition: opacity .1s ease;
  }
  .name.show { opacity: 1; }

  /* Growth is the highlight: the hovered icon lifts off the ring instead of lighting a disc. */
  .slice:hover:not(.dim) .face {
    transform: scale(1.22);
    filter: drop-shadow(0 3px 8px rgb(0 0 0 / .6)) brightness(1.12);
  }
  .slice.dim { cursor: default; }
  .slice.dim .face { filter: grayscale(1) drop-shadow(0 2px 5px rgb(0 0 0 / .45)); opacity: .4; }

  @keyframes spread {
    from { --ro: 10; opacity: 0; }
  }
  @keyframes hollow {
    from { --ri: 0; }
  }
  @keyframes pop {
    from { transform: scale(.2); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ring, .face { animation: none; }
  }
</style>
