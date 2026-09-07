import * as PIXI from 'pixi.js';
import type { TerrainGroup } from './terrain-textures.js';

/** The pencil sprites, keyed by the terrain group they draw. Water, shallows and settlement
 * have no art in the library and never appear here. */
export type InkAtlas = Partial<Record<TerrainGroup, PIXI.Texture[]>>;

interface Manifest {
  sheet: string;
  frames: Partial<Record<TerrainGroup, [number, number, number, number][]>>;
}

const DIR = `${import.meta.env.BASE_URL}art/terrain/ink/`;

let pending: Promise<InkAtlas | null> | null = null;

/** The illustrated map's sprite atlas, loaded once per page. `scripts/bake-ink.mjs` turns the
 * white-page sheets into one alpha stencil, so every sprite here is colourless and takes its
 * ink from whatever tint the layer sets. Resolves null if the atlas is missing, and the
 * illustrated map shows its wash alone. */
export function inkAtlas(): Promise<InkAtlas | null> {
  pending ??= build().catch((error) => {
    console.warn('ink sprites unavailable; run `npm run bake:ink`', error);
    return null;
  });
  return pending;
}

async function build(): Promise<InkAtlas | null> {
  const response = await fetch(`${DIR}frames.json`);
  if (!response.ok) return null;
  const manifest: Manifest = await response.json();
  const sheet = await PIXI.Assets.load<PIXI.Texture>(DIR + manifest.sheet);
  const atlas: InkAtlas = {};
  for (const [group, frames] of Object.entries(manifest.frames)) {
    atlas[group as TerrainGroup] = frames.map(
      ([x, y, w, h]) => new PIXI.Texture(sheet.baseTexture, new PIXI.Rectangle(x, y, w, h)),
    );
  }
  return atlas;
}
