// proto: adapted from pf2e-reignmaker's LayerManager.ts (2026-08-24); only the methods this
// board calls remain.
import * as PIXI from 'pixi.js';

export type LayerId = typeof LAYER_ORDER[number] | string;

/**
 * The board's stack, bottom to top. Three bands, and every layer belongs to one of them:
 * the ground and everything painted on it, then the pieces standing on that ground, then
 * everything thrown over the pieces — spell effects and the reference lines.
 *
 * A layer's z-index is its place in this list, so the order is stated here and nowhere else.
 * Adding a layer means putting its name in the band it belongs to.
 */
export const LAYER_ORDER = [
  // The ground.
  'terrain',        // cell fills, elevation, procedural textures
  'ink',            // the illustrated map, in place of the textured surfaces
  'fallen',         // where a unit died, lying on the surface and under every wash and line
  'overlay',        // hover, selection, highlight sets, paint preview
  'effectsGround',  // pools and scorch marks, which lie on the ground the pieces stand on
  'grid',           // the reference hex outline
  'edges',          // walls, breached walls, cliffs — built on the ground, so over the line of it
  // The pieces.
  'tokens',         // unit and engine sprites
  // Over the pieces.
  'shot',           // the aimed shot's arc
  'cast',           // the aimed cast's line and motes
  'effects',        // flames, frames and sparks
  'mapLines',       // terrain-area outlines and elevation rings
  'fallenIntro',    // a death as it is announced, large over the piece before it drops to `fallen`
  'combatText',     // the word a roll came to, floated over the piece it landed on
] as const;

export interface MapLayer {
  id: LayerId;
  container: PIXI.Container;
  visible: boolean;
  zIndex: number;
}

export class LayerManager {
  private layers: Map<LayerId, MapLayer> = new Map();
  private container: PIXI.Container;

  constructor(container: PIXI.Container) {
    this.container = container;
  }

  createLayer(id: LayerId, zIndex: number = this.getDefaultZIndex(id)): PIXI.Container {
    if (this.layers.has(id)) {
      const existingLayer = this.layers.get(id)!;

      if (existingLayer.zIndex !== zIndex && zIndex !== 0) {
        existingLayer.container.zIndex = zIndex;
        existingLayer.zIndex = zIndex;
      }

      return existingLayer.container;
    }

    const layerContainer = new PIXI.Container();
    layerContainer.name = `Layer_${id}`;
    layerContainer.zIndex = zIndex;
    layerContainer.visible = true;

    const layer: MapLayer = {
      id,
      container: layerContainer,
      visible: true,
      zIndex
    };

    this.layers.set(id, layer);
    this.container.addChild(layerContainer);

    return layerContainer;
  }

  showLayer(id: LayerId): void {
    const layer = this.layers.get(id);
    if (layer) {
      layer.container.visible = true;
      layer.visible = true;
    }
  }

  hideLayer(id: LayerId): void {
    const layer = this.layers.get(id);
    if (layer) {
      layer.container.visible = false;
      layer.visible = false;
    }
  }

  clearAllLayers(): void {
    this.layers.forEach((layer, id) => {
      layer.container.removeChildren().forEach(child => {
        if (child instanceof PIXI.Graphics) {
          child.clear();
        }
        child.destroy({ children: true, texture: false, baseTexture: false });
      });

      layer.container.visible = false;
      layer.visible = false;
    });
  }

  private getDefaultZIndex(layerId: LayerId): number {
    const place = (LAYER_ORDER as readonly string[]).indexOf(layerId);
    // A layer nobody placed sits on the ground rather than over the pieces: a stray name must
    // not land on top of the board.
    return place < 0 ? 0 : (place + 1) * 10;
  }
}
