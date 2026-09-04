import * as PIXI from 'pixi.js';

/** One quadrant of one baked terrain sheet. `scripts/bake-terrain.mjs` names them. */
export type ScatterKind =
  | 'trees' | 'swamp' | 'boulders' | 'mounds'
  | 'desert' | 'water' | 'plains' | 'badlands';

export type TerrainAtlas = Partial<Record<ScatterKind, PIXI.Texture[]>>;

interface Manifest {
  [kind: string]: { sheet: string; frames: [number, number, number, number][] };
}

const DIR = `${import.meta.env.BASE_URL}art/terrain/`;

let pending: Promise<TerrainAtlas | null> | null = null;

/** The scenery sheets, loaded once per page. The sheets ship pre-keyed with real alpha and a
 * manifest of frame rectangles — see `scripts/bake-terrain.mjs`, which does the chroma key and
 * the frame-finding offline. Resolves null if they are missing, and the board falls back to
 * its procedural patterns. */
export function terrainAtlas(): Promise<TerrainAtlas | null> {
  pending ??= build().catch((error) => {
    console.warn('terrain scenery unavailable; run `npm run bake:terrain`', error);
    return null;
  });
  return pending;
}

async function build(): Promise<TerrainAtlas | null> {
  const response = await fetch(`${DIR}frames.json`);
  if (!response.ok) return null;
  const manifest: Manifest = await response.json();

  const sheets = new Map<string, Promise<PIXI.Texture>>();
  const load = (name: string): Promise<PIXI.Texture> => {
    let sheet = sheets.get(name);
    if (!sheet) { sheet = PIXI.Assets.load<PIXI.Texture>(DIR + name); sheets.set(name, sheet); }
    return sheet;
  };

  const atlas: TerrainAtlas = {};
  await Promise.all(Object.entries(manifest).map(async ([kind, entry]) => {
    const sheet = await load(entry.sheet);
    atlas[kind as ScatterKind] = entry.frames.map(
      ([x, y, w, h]) => new PIXI.Texture(sheet.baseTexture, new PIXI.Rectangle(x, y, w, h)),
    );
  }));
  return atlas;
}
