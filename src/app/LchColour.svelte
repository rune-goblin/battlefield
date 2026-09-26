<script lang="ts">
  import { untrack } from 'svelte';
  import { cssHex, lchToRgb, rgbToLch, type Lch } from '../board/index.js';

  interface Props {
    label: string;
    /** 0xRRGGBB, which is what the board's settings store. */
    value: number;
    /** Prefix for the three slider ids. */
    id: string;
  }
  let { label, value = $bindable(), id }: Props = $props();

  // The three dials are kept rather than re-derived from the colour on every change: chroma 0
  // is the same grey at every hue, and a round trip through RGB would forget which hue the
  // slider was left on and snap it home the moment the colour went grey.
  let lch = $state(rgbToLch(value));
  $effect(() => {
    const outside = value;
    untrack(() => { if (lchToRgb(lch) !== outside) lch = rgbToLch(outside); });
  });
  function set(next: Partial<Lch>) {
    lch = { ...lch, ...next };
    value = lchToRgb(lch);
  }
  // Past the edge of sRGB the channels clip, so the swatch stops answering the dials. Saying
  // so is the difference between a slider that does nothing and a slider that is finished.
  const clipped = $derived.by(() => {
    const shown = rgbToLch(lchToRgb(lch));
    return Math.abs(shown.l - lch.l) > 1 || Math.abs(shown.c - lch.c) > 1;
  });
</script>

<div class="lch">
  <div class="head">
    <span class="name">{label}{#if clipped}<em> outside sRGB</em>{/if}</span>
    <input type="color" aria-label="{label} as a colour picker" value={cssHex(value)}
      oninput={(e) => { value = parseInt(e.currentTarget.value.slice(1), 16); }} />
  </div>
  <label class="slider" for="{id}-l"><span>Lightness</span><output>{lch.l.toFixed(0)}</output></label>
  <input id="{id}-l" type="range" min="0" max="100" step="0.5" value={lch.l}
    oninput={(e) => set({ l: +e.currentTarget.value })} />
  <label class="slider" for="{id}-c"><span>Chroma</span><output>{lch.c.toFixed(0)}</output></label>
  <input id="{id}-c" type="range" min="0" max="132" step="0.5" value={lch.c}
    oninput={(e) => set({ c: +e.currentTarget.value })} />
  <label class="slider" for="{id}-h"><span>Hue</span><output>{lch.h.toFixed(0)}°</output></label>
  <input id="{id}-h" type="range" min="0" max="359" step="1" value={lch.h}
    oninput={(e) => set({ h: +e.currentTarget.value })} />
</div>

<style>
  .lch { margin: .6rem 0 .8rem; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; font-size: var(--type-body); }
  .name em { font-style: normal; font-size: var(--type-small); color: var(--muted); }
  .head input[type=color] { width: 3rem; height: 1.4rem; padding: 0; border: 1px solid var(--rule); border-radius: 4px; background: none; }
  .slider { display: flex; justify-content: space-between; width: 100%; font-size: var(--type-small); color: var(--muted); margin-top: .35rem; }
  output { font-variant-numeric: tabular-nums; color: var(--accent); }
  input[type=range] { display: block; width: 100%; padding: 0; margin: .2rem 0 .1rem; accent-color: var(--accent); }
  input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
