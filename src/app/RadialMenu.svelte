<script lang="ts">
  import { cubicIn } from 'svelte/easing';

  interface Item {
    key: string;
    src: string;
    label: string;
    note: string;
    legal: boolean;
  }

  interface Props {
    /** The piece's centre, in CSS pixels inside the board container. */
    x: number;
    y: number;
    items: Item[];
    pick: (key: string) => void;
  }
  let { x, y, items, pick }: Props = $props();

  const RADIUS = 98;
  const TRACK = 62;
  const R_OUT = RADIUS + TRACK / 2;
  const R_IN = RADIUS - TRACK / 2;

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
  const zip = () => ({
    duration: reduced() ? 0 : 170,
    easing: cubicIn,
    css: (t: number) => `transform: scale(${0.06 + 0.94 * t}); opacity: ${t};`,
  });

  let hover = $state<number | null>(null);
</script>

<div class="radial" style="left: {x}px; top: {y}px">
  <!-- Band, rims and icons are one piece: everything is placed off --ro/--ri, so the outer edge
       can run ahead to full width while the hole opens behind it. -->
  <div class="ring" style="--ro: {R_OUT}; --ri: {R_IN}" out:zip>
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
        title={item.note}
        onclick={() => item.legal && pick(item.key)}
        onpointerenter={() => { hover = i; }}
        onpointerleave={() => { hover = hover === i ? null : hover; }}
      >
        <span class="face"><img src={item.src} alt={item.label} draggable="false" /></span>
        <span class="name" class:show={hover === i}>{item.label}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .radial { position: absolute; z-index: 7; width: 0; height: 0; }

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
    width: 3.2rem; height: 3.2rem; padding: 0; border: 0; background: none;
    color: var(--ink); font: inherit; cursor: pointer;
    transform: translate(
      calc(-50% + var(--ux) * var(--seat) * 1px),
      calc(-50% + var(--uy) * var(--seat) * 1px)
    );
  }
  /* The seat rides the band; only the disc itself pops, so the two never come apart. */
  .face {
    position: absolute; inset: 0;
    display: grid; place-items: center;
    border: 1px solid var(--rule); border-radius: 50%;
    background: var(--card);
    animation: pop .3s cubic-bezier(.25, 1.3, .45, 1) 120ms backwards;
  }
  .face img { width: 2.4rem; height: 2.4rem; object-fit: contain; pointer-events: none; }

  /* The name is read off the pointer, not carried by every slice at once — six labelled discs
     is a wall of text, and the ring is meant to be learned by direction. Absolute, so revealing
     it never nudges the ring. */
  .name {
    position: absolute; top: 100%; left: 50%; transform: translate(-50%, .15rem);
    padding: .05rem .3rem; border-radius: 6px; white-space: nowrap;
    font-size: .7rem; font-weight: 600; pointer-events: none;
    background: var(--card); border: 1px solid var(--accent);
    opacity: 0; transition: opacity .1s ease;
  }
  .name.show { opacity: 1; }

  .slice:hover:not(.dim) .face { border-color: var(--accent); background: var(--band); }
  /* Dim slices still answer the pointer: hovering one is how you learn why it is out. */
  .slice.dim { cursor: default; }
  .slice.dim .face { filter: grayscale(1); opacity: .4; }

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
