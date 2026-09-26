import * as PIXI from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TerrainLayer } from '../board/layers/TerrainLayer.js';
import { defaultTextureSettings } from '../board/terrain-textures.js';
import { darkTheme } from '../board/theme.js';

afterEach(() => vi.restoreAllMocks());

describe('terrain redraw after texture loading', () => {
  it('requests a second bake for new textures, then skips it for settings-only edits', async () => {
    const load = vi.spyOn(PIXI.Assets, 'load').mockImplementation((async () => PIXI.Texture.EMPTY) as typeof PIXI.Assets.load);
    const layer = new TerrainLayer(new PIXI.Container(), {} as PIXI.IRenderer, darkTheme);
    const appearance = { settings: defaultTextureSettings() };
    expect(await layer.setAppearance(appearance)).toBe(true);
    load.mockClear();
    const adjusted = structuredClone(appearance);
    adjusted.settings.trees.size *= 1.1;
    expect(await layer.setAppearance(adjusted)).toBe(false);
    expect(load).not.toHaveBeenCalled();
    expect(await layer.setAppearance(null)).toBe(false);
  });

  it('ignores a texture load that finishes after its appearance was replaced', async () => {
    let resolve!: (texture: PIXI.Texture) => void;
    const waiting = new Promise<PIXI.Texture>(done => { resolve = done; });
    vi.spyOn(PIXI.Assets, 'load').mockImplementation((() => waiting) as typeof PIXI.Assets.load);
    const layer = new TerrainLayer(new PIXI.Container(), {} as PIXI.IRenderer, darkTheme);
    const pending = layer.setAppearance({ settings: defaultTextureSettings() });
    await layer.setAppearance(null);
    resolve(PIXI.Texture.EMPTY);
    expect(await pending).toBe(false);
  });

  it('keeps the first bake when a texture fails to load', async () => {
    vi.spyOn(PIXI.Assets, 'load').mockRejectedValue(new Error('unavailable'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const layer = new TerrainLayer(new PIXI.Container(), {} as PIXI.IRenderer, darkTheme);
    expect(await layer.setAppearance({ settings: defaultTextureSettings() })).toBe(false);
  });
});
