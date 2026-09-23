import * as PIXI from 'pixi.js';
import { engineArt, troopArt } from '../engine/art.js';
import type { Role, Status, Tree } from '../engine/index.js';
import bannerTemplate from './faction-banner.svg?raw';
import { assetUrl } from './asset-base.js';

// src/engine/art.ts stays free of Vite types (tsconfig.engine.json carries none) so it
// type-checks as pure engine code; it returns paths without a leading slash. The asset-base
// prefix a non-root deploy needs lives here instead — src/board/ is covered by the main
// tsconfig, which does include vite/client.

export function troopArtUrl(name: string, role: Role): string {
  return assetUrl(troopArt(name, role));
}

export function engineArtUrl(name: string): string | null {
  const path = engineArt(name);
  return path ? assetUrl(path) : null;
}

// proto: pf2e-trooper's *_strategy.webp renders put the miniature's own base ellipse about
// four-fifths of the way down a square image (checked by eye against half a dozen troop and
// engine samples). There is no per-image crop data to anchor exactly, so one tuned constant
// stands in for the whole set rather than measuring each image. The piece's art is anchored
// here, and its cast shadow is hinged here.
export const ART_ANCHOR_Y = 0.8;

// Copied from pf2e-reignmaker (img/effects/faction-banner.svg, and the substitution in
// src/services/army/factionEffect.ts). The cloth ships in one sentinel colour and carries an
// overlay-shading layer on top, so swapping the sentinel for any hue still reads as folded
// cloth rather than a flat fill.
const BANNER_SENTINEL = '#a50707';
const banners = new Map<number, PIXI.Texture>();

/** The side's flag, rasterized from the shared template at `colour`. Two sides means two
 * textures for the whole board, so they are cached rather than rebuilt per token. */
export function bannerTexture(colour: number): PIXI.Texture {
  const cached = banners.get(colour);
  if (cached) return cached;
  const hex = `#${colour.toString(16).padStart(6, '0')}`;
  const svg = bannerTemplate.split(BANNER_SENTINEL).join(hex);
  const texture = PIXI.Texture.from(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
  banners.set(colour, texture);
  return texture;
}

/** The action props. `charge` and `step` have no table behind them: charging is the drag
 * of the piece itself, and a step moves one open hex. Every spell shares
 * the one `cast` prop and is told apart by its label. `no` is the odd one out: it names no
 * action at all, and marks the cell a drag may not take. */
export type ActionIcon = 'attack' | 'block' | 'cast' | 'charge' | 'gate' | 'no' | 'rally' | 'shoot' | 'step';

/** Condition icons follow engine status names; Fortified shares the gate artwork. */
export type StatusIcon = Status;

export const statusIconUrl = (icon: StatusIcon): string => icon === 'fortified' ? actionIconUrl('gate') : assetUrl(`art/condition-icons/${icon}.webp`);

export const actionIconUrl = (icon: ActionIcon): string => assetUrl(`art/action-icons/${icon === 'step' ? 'withdraw' : icon}.webp`);

// One face per tree, for the picker that branches off Cast — a second ring, not a slice of
// the first, so it needs its own art rather than the single generic `cast` face above.
const CAST_ICON: Record<Tree, string> = {
  blast: 'blast', healing: 'heal', controlling: 'control',
  offense: 'buff-attacks', defense: 'buff-defenses', movement: 'buff-movement',
};

export const castIconUrl = (tree: Tree): string => assetUrl(`art/cast-icons/${CAST_ICON[tree]}.webp`);

/** Targeting uses the selected spell tree's art instead of the generic Cast menu icon. */
export type TargetIcon = ActionIcon | `cast:${Tree}`;
export const targetIconUrl = (icon: TargetIcon): string => icon.startsWith('cast:')
  ? castIconUrl(icon.slice(5) as Tree) : actionIconUrl(icon as ActionIcon);
