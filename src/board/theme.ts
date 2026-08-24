import type { SquareTerrain } from '../engine/index.js';

export interface BoardTheme {
  mode: 'light' | 'dark';
  background: number;
  band: number;
  rule: number;
  ink: number;
  accent: number;
  attacker: number;
  defender: number;
  terrain: Record<SquareTerrain, number>;
}

// proto: seeded from pf2e-reignmaker's TERRAIN_OVERLAY_COLORS (src/styles/colors.ts) —
// forest/swamp/water keep those hues; 'open'/'shallows'/'settlement' have no Reignmaker
// terrain (its hex vocabulary is plains/forest/hills/mountains/swamp/marsh/water/desert/
// tundra/ruins/cave/wasteland, ours is open/forest/swamp/shallows/water/settlement), so
// those three and both light/dark variants are retuned to match Board.svelte's existing
// app.css palette, since Wave 0 puts the Pixi board next to the DOM board for comparison.
// Alpha is dropped: Wave 2 wants opaque cell fills, unlike Reignmaker's translucent overlay.
const LIGHT: BoardTheme = {
  mode: 'light',
  background: 0xf8f4ec,
  band: 0xefe7d8,
  rule: 0xb9ab93,
  ink: 0x1f1a17,
  accent: 0x7a2e1f,
  attacker: 0x3a5f8f,
  defender: 0x8f3a2e,
  terrain: {
    open: 0xefe7d8,
    forest: 0xb9cfa0,
    swamp: 0xb8ad78,
    shallows: 0xb4d4e0,
    water: 0x6f9fc4,
    settlement: 0xc2bcb2,
  },
};

const DARK: BoardTheme = {
  mode: 'dark',
  background: 0x1d1a17,
  band: 0x2a2520,
  rule: 0x4c4338,
  ink: 0xe8e1d5,
  accent: 0xd98b6e,
  attacker: 0x6f9bd1,
  defender: 0xd9705c,
  terrain: {
    open: 0x2a2520,
    forest: 0x3a5030,
    swamp: 0x4d4728,
    shallows: 0x37535f,
    water: 0x2f5476,
    settlement: 0x4a4744,
  },
};

export function prefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function currentTheme(): BoardTheme {
  return prefersDark() ? DARK : LIGHT;
}

export { LIGHT as lightTheme, DARK as darkTheme };
