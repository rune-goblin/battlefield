import * as PIXI from 'pixi.js';
import type { TerrainGroup } from './terrain-textures.js';

export type InkFrames = Partial<Record<TerrainGroup, PIXI.Texture[]>>;

/** The pencil sprites, keyed by the terrain group they draw. `hero` holds the drawings that
 * stand one to a few hexes; water, shallows and settlement have none. `fill` holds the small
 * marks scattered under them; only settlement has none. */
export interface InkAtlas { hero: InkFrames; fill: InkFrames }

/** The fill sheets were cut into cells this wide at the drawings' own pixel scale, so a fill
 * drawn at `FILL_CELL` screen pixels per cell keeps its size against the hero art. */
export const FILL_CELL = 96;

interface Manifest {
  sheet: string;
  frames: Partial<Record<TerrainGroup, [number, number, number, number][]>>;
}

const DIR = `${import.meta.env.BASE_URL}art/terrain/ink/`;

let pending: Promise<InkAtlas | null> | null = null;

/** The illustrated map's sprite atlases, loaded once per page. `scripts/bake-ink.mjs` turns
 * the white-page sheets into alpha stencils, so every sprite here is colourless and takes its
 * ink from whatever tint the layer sets. Resolves null if the hero atlas is missing, and the
 * illustrated map shows its wash alone; a missing fill atlas leaves the ground bare. */
export function inkAtlas(): Promise<InkAtlas | null> {
  pending ??= build().catch((error) => {
    console.warn('ink sprites unavailable; run `npm run bake:ink`', error);
    return null;
  });
  return pending;
}

async function build(): Promise<InkAtlas | null> {
  const hero = await frames('frames.json');
  if (!hero) return null;
  return { hero, fill: (await frames('fill.json')) ?? {} };
}

async function frames(manifestFile: string): Promise<InkFrames | null> {
  const response = await fetch(DIR + manifestFile);
  if (!response.ok) return null;
  const manifest: Manifest = await response.json();
  const sheet = await PIXI.Assets.load<PIXI.Texture>(DIR + manifest.sheet);
  // Linework shrunk to a tenth without mipmaps sparkles; the fills spend most of their life
  // there.
  sheet.baseTexture.mipmap = PIXI.MIPMAP_MODES.ON;
  const atlas: InkFrames = {};
  for (const [group, rects] of Object.entries(manifest.frames)) {
    atlas[group as TerrainGroup] = rects.map(
      ([x, y, w, h]) => new PIXI.Texture(sheet.baseTexture, new PIXI.Rectangle(x, y, w, h)),
    );
  }
  return atlas;
}
