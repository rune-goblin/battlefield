import type { SquareTerrain } from '../engine/index.js';

// The standing move-band wash (selecting a unit, before any drag): 'move' is the free band
// (one action), 'moveFar'/'moveFar3' are the costed band at two and three actions — one shade
// per extra action — and 'push' is beyond every action the unit has, reachable only by
// gambling a check. The drag preview reuses 'move'/'moveFar' for its near/far path cells.
// The washes themselves are ink at three alphas; see `OverlayLayer`.
export type HighlightStyle = 'deploy' | 'move' | 'attack' | 'moveFar' | 'moveFar3' | 'push';
export const HIGHLIGHT_STYLES: HighlightStyle[] = ['deploy', 'move', 'attack', 'moveFar', 'moveFar3', 'push'];

export interface BoardTheme {
  mode: 'light' | 'dark';
  background: number;
  /** The canvas mat behind the board's own bounds — deliberately far off any terrain colour
   * so the map's edge reads against it in both themes. */
  canvas: number;
  band: number;
  rule: number;
  ink: number;
  accent: number;
  attacker: number;
  defender: number;
  terrain: Record<SquareTerrain, number>;
  overlay: {
    hover: number;
    selected: number;
    /** The shot arc and the barred X — where colour on the board means danger rather than
     * terrain. */
    shot: number;
  };
  token: {
    routed: number;
    ringFlash: number;
    pipFilled: number;
    pipEmpty: number;
    badgeFill: number;
    badgeText: number;
    /** The level, sitting on the flag's cloth — always the light one, since both sides tint
     * the cloth mid-dark. */
    bannerText: number;
  };
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
  canvas: 0x141210,
  band: 0xefe7d8,
  rule: 0xb9ab93,
  ink: 0x1f1a17,
  accent: 0x7a2e1f,
  attacker: 0x8f3a2e,
  defender: 0x3a5f8f,
  terrain: {
    open: 0xefe7d8,
    forest: 0xb9cfa0,
    swamp: 0xb8ad78,
    shallows: 0xb4d4e0,
    water: 0x6f9fc4,
    settlement: 0xc2bcb2,
  },
  overlay: {
    hover: 0x1f1a17,
    selected: 0xb4611f,
    shot: 0xb4231b,
  },
  token: {
    routed: 0xb9ab93,
    ringFlash: 0xf2c744,
    pipFilled: 0x1f1a17,
    pipEmpty: 0xf8f4ec,
    badgeFill: 0xf8f4ec,
    badgeText: 0x1f1a17,
    bannerText: 0xf8f4ec,
  },
};

const DARK: BoardTheme = {
  mode: 'dark',
  background: 0x1d1a17,
  canvas: 0x141210,
  band: 0x2a2520,
  rule: 0x4c4338,
  ink: 0xe8e1d5,
  accent: 0xd98b6e,
  attacker: 0xd9705c,
  defender: 0x6f9bd1,
  terrain: {
    open: 0x2a2520,
    forest: 0x3a5030,
    swamp: 0x4d4728,
    shallows: 0x37535f,
    water: 0x2f5476,
    settlement: 0x4a4744,
  },
  overlay: {
    hover: 0xe8e1d5,
    selected: 0xd98b6e,
    shot: 0xe0453a,
  },
  token: {
    routed: 0x8c8378,
    ringFlash: 0xffe066,
    pipFilled: 0xe8e1d5,
    pipEmpty: 0x2a2520,
    badgeFill: 0x1d1a17,
    badgeText: 0xe8e1d5,
    bannerText: 0xf3ece0,
  },
};

export function prefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function currentTheme(): BoardTheme {
  return prefersDark() ? DARK : LIGHT;
}

export { LIGHT as lightTheme, DARK as darkTheme };
