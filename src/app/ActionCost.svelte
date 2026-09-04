<script lang="ts">
  interface Props {
    /** Actions: 1, 2 or 3 for the Pathfinder glyphs, 0 for the free-action glyph. */
    n: number;
    size?: string;
  }
  let { n, size = '1em' }: Props = $props();

  // The Pathfinder action glyphs, traced from ReignMaker's art-source. Each is 36 tall; the
  // two- and three-action marks are wider.
  const GLYPHS: Record<0 | 1 | 2 | 3, { w: number; d: string }> = {
    0: { w: 36, d: 'M18.12,2l15.88,15.91-16.09,16.09L2,18.19l8.34-8.38,7.78-7.81ZM7.88,17.5l3.41,3.41,3.41-3.41-3.41-3.41-3.41,3.41ZM17.59,29.38l11.75-11.72-11.22-11.22-3.88,3.88,7.66,7.69-7.84,7.84,3.53,3.53Z' },
    1: { w: 36, d: 'M7.78,12.28l5.72,5.72-5.72,5.72-5.72-5.72,5.72-5.72ZM33.94,18l-16,16-7.72-7.72,8.28-8.28-8.28-8.28,7.72-7.72,16,16Z' },
    2: { w: 54, d: 'M13.47,18l-5.72,5.72-5.72-5.72,5.72-5.72,5.72,5.72ZM17.88,33.97l-7.69-7.72,8.25-8.25-8.25-8.25,7.69-7.72,15.97,15.97-15.97,15.97ZM38.03,31.78l-6.78-6.78,7.25-7.25-7.25-7.25,6.78-6.75,14,14-14,14.03Z' },
    3: { w: 70, d: 'M13.51,18l-5.72,5.72-5.72-5.72,5.72-5.72,5.72,5.72ZM17.95,34l-7.72-7.72,8.28-8.28-8.28-8.28,7.72-7.72,16,16-16,16ZM38.35,31.81l-6.81-6.78,7.28-7.28-7.28-7.25,6.81-6.78,14.03,14.03-14.03,14.06ZM57.01,28.97l-5.47-5.44,5.84-5.84-5.84-5.81,5.47-5.44,11.25,11.25-11.25,11.28Z' },
  };
  const g = $derived(GLYPHS[Math.max(0, Math.min(3, Math.round(n))) as 0 | 1 | 2 | 3]);
  const label = $derived(n === 0 ? 'free action' : `${n} action${n === 1 ? '' : 's'}`);
</script>

<svg
  class="ag"
  viewBox="0 0 {g.w} 36"
  style="height: {size}; width: calc({size} * {g.w / 36})"
  role="img"
  aria-label={label}
><title>{label}</title><path d={g.d} /></svg>

<style>
  .ag { flex: none; vertical-align: -.12em; fill: currentColor; }
</style>
