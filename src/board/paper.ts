import * as PIXI from 'pixi.js';

/** The paper tiles `scripts/bake-paper.mjs` cuts, seamless, four from each sheet: the page as
 * scanned, and three grains levelled to a mean of 0.95 — a fine and a coarse grey cut that
 * leave the colour to the settings, and a coloured one that keeps half the sheet's own hue. */
const SHEETS = ['mottled', 'cloud', 'stained', 'streaked', 'scratched', 'plaster'] as const;
const CUTS = ['page', 'fine', 'coarse', 'colour'] as const;
export const PAPER_TEXTURES = SHEETS.flatMap(sheet => CUTS.map(cut => `${sheet}-${cut}` as const));
export type PaperTexture = typeof PAPER_TEXTURES[number];
const SHEET_LABELS: Record<typeof SHEETS[number], string> = {
  mottled: 'Mottled parchment', cloud: 'Soft cloud', stained: 'Stained paper',
  streaked: 'Streaked hide', scratched: 'Scratched vellum', plaster: 'Plaster',
};
export const PAPER_LABELS = Object.fromEntries(PAPER_TEXTURES.map((name) => {
  const [sheet, cut] = name.split('-') as [typeof SHEETS[number], typeof CUTS[number]];
  return [name, cut === 'page' ? SHEET_LABELS[sheet] : `${SHEET_LABELS[sheet]} · ${cut}`];
})) as Record<PaperTexture, string>;
/** The sheets as scanned. The board lays one of these under a translucent wash; every other
 * cut is multiplied over an opaque one. */
export const PAPER_PAGES = PAPER_TEXTURES.filter(isPage);
export const PAPER_GRAINS = PAPER_TEXTURES.filter(name => !isPage(name));
export function isPage(name: PaperTexture): boolean { return name.endsWith('-page'); }
/** Pixels across one tile. */
export const PAPER_TILE = 1024;

const DIR = `${import.meta.env.BASE_URL}art/terrain/paper/`;
const pending = new Map<PaperTexture, Promise<PIXI.Texture | null>>();

/** One tile, loaded once per page; null if the bake is missing, and the wash goes ungrained. */
export function paperTexture(name: PaperTexture): Promise<PIXI.Texture | null> {
  let promise = pending.get(name);
  if (!promise) {
    promise = PIXI.Assets.load<PIXI.Texture>(`${DIR}${name}.webp`).then((texture) => {
      texture.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
      texture.baseTexture.mipmap = PIXI.MIPMAP_MODES.ON;
      return texture;
    }).catch((error) => {
      console.warn(`paper texture ${name} unavailable; run \`npm run bake:paper\``, error);
      return null;
    });
    pending.set(name, promise);
  }
  return promise;
}
