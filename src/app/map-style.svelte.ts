import { normalizeInkSettings } from '../board/ink-map.js';
import { normalizeTextureSettings } from '../board/terrain-textures.js';

export const MAP_STYLES = ['textures', 'ink'] as const;
export type MapStyle = (typeof MAP_STYLES)[number];
export const MAP_STYLE_LABELS: Record<MapStyle, string> = {
  textures: 'Textured', ink: 'Illustrated',
};

const TEXTURE_KEY = 'battlefield.texture-lab.v1';
const INK_KEY = 'battlefield.ink-lab.v1';
const STYLE_KEY = 'battlefield.map-style.v1';

function load(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}
function loadStyle(): MapStyle {
  const saved = load(STYLE_KEY);
  return MAP_STYLES.includes(saved as MapStyle) ? saved as MapStyle : 'ink';
}

// The lab and the game board share one object rather than a saved file each reads on load:
// the lab is reachable from the game without a reload, so an edit there has to reach the
// board it came from.
export const mapSettings = $state({
  style: loadStyle(),
  textures: normalizeTextureSettings(load(TEXTURE_KEY)),
  ink: normalizeInkSettings(load(INK_KEY)),
});

export function setMapStyle(style: MapStyle): void {
  mapSettings.style = style;
  try { localStorage.setItem(STYLE_KEY, JSON.stringify(style)); } catch { /* private browsing */ }
}

/** Saves both settings blobs, and says whether the write stuck. */
export function persistMapSettings(): boolean {
  try {
    localStorage.setItem(TEXTURE_KEY, JSON.stringify(mapSettings.textures));
    localStorage.setItem(INK_KEY, JSON.stringify(mapSettings.ink));
    return true;
  } catch { return false; }
}

/** What a game stage hands its board: the lab's settings, under the chosen style. */
export const gameMap = {
  get terrainAppearance() {
    return mapSettings.style === 'textures' ? { settings: mapSettings.textures } : null;
  },
  get inkMap() {
    return mapSettings.style === 'ink' ? { settings: mapSettings.ink } : null;
  },
};
