import * as PIXI from 'pixi.js';
import { STATUSES, TREES, type Role } from '../engine/index.js';
import { actionIconUrl, castIconUrl, engineArtUrl, statusIconUrl, troopArtUrl, type ActionIcon } from './art.js';
import { assetUrl } from './asset-base.js';
import { loadSheets } from './layers/EffectLayer.js';
import { silhouetteTexture } from './piece-shadow.js';
import { terrainAtlas } from './terrain-sheet.js';
import { BROKEN_OVERLAY, defaultTextureSettings, TEXTURE_CHOICES, type TerrainGroup } from './terrain-textures.js';

const ACTION_ICONS: ActionIcon[] = ['attack', 'block', 'cast', 'charge', 'gate', 'no', 'rally', 'shoot', 'step'];

// An `<img>` decodes on its own path, apart from the `ImageBitmap` PIXI holds. Keeping the
// element keeps the decoded image in the browser's memory cache, so a card that mounts later
// paints on its first frame.
const images = new Map<string, HTMLImageElement>();

function warmImage(url: string): void {
  if (typeof Image === 'undefined' || images.has(url)) return;
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  images.set(url, image);
  image.decode().catch(() => { images.delete(url); });
}

// proto: a warm-up load failing here leaves nothing cached; the real load at point of use
// reports its own failure (or is itself marked proto), so this stays silent.
const quiet = (loading: Promise<unknown>): void => { loading.catch(() => {}); };

let staticStarted = false;

/** Everything a battle shows whatever the armies are: icons, spell frames, scenery, and the
 * default ground. Safe to call at module start; a second call does nothing. */
export function preloadBoardArt(): void {
  if (staticStarted || typeof document === 'undefined') return;
  staticStarted = true;
  const icons = [
    ...ACTION_ICONS.map(actionIconUrl),
    ...TREES.map(castIconUrl),
    ...STATUSES.map(statusIconUrl),
    assetUrl('art/condition-icons/dead.webp'),
  ];
  for (const url of icons) warmImage(url);
  quiet(PIXI.Assets.load(icons));
  loadSheets();
  quiet(terrainAtlas());
  const ground = defaultTextureSettings().terrains;
  const textures = (Object.keys(ground) as TerrainGroup[])
    .map((group) => TEXTURE_CHOICES[group].find((choice) => choice.id === ground[group].texture)?.url)
    .filter((url): url is string => !!url);
  quiet(PIXI.Assets.load([...textures, BROKEN_OVERLAY.url]));
}

export interface PieceArt { name: string; role?: Role }

/** The art of the pieces a record names, for the board's tokens and the panels' cards alike. */
export function preloadPieceArt(units: readonly PieceArt[], engines: readonly string[]): void {
  if (typeof document === 'undefined') return;
  const urls = new Set<string>();
  for (const unit of units) urls.add(troopArtUrl(unit.name, unit.role ?? 'infantry'));
  for (const name of engines) {
    const url = engineArtUrl(name);
    if (url) urls.add(url);
  }
  for (const url of urls) {
    if (images.has(url)) continue;
    warmImage(url);
    quiet(silhouetteTexture(url));
  }
}
