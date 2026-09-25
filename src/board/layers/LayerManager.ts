/**
 * LayerManager - Handles PIXI layer lifecycle management
 *
 * Responsibilities:
 * - Layer creation and singleton pattern
 * - Layer visibility management (show/hide)
 * - Layer cleanup and disposal
 * - Z-index ordering
 * - Layer state tracking
 *
 * This class extracts layer lifecycle concerns from ReignMakerMapLayer,
 * allowing ReignMakerMapLayer to focus on rendering orchestration.
 */

// proto: lifted verbatim from pf2e-reignmaker src/services/map/core/LayerManager.ts
// (2026-08-24) for backport parity. Changes: added the PIXI import (Reignmaker relies on
// Foundry's ambient global), inlined LayerId/MapLayer here instead of importing Reignmaker's
// kingdom-map ../types (those types carry Foundry icon paths that don't apply to a battle
// board), dropped the unused `logger` import, and replaced getDefaultZIndex's switch with
// LAYER_ORDER, this board's own stack.
import * as PIXI from 'pixi.js';

/**
 * Predefined and custom layer identifiers
 */
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

/**
 * Internal layer metadata
 */
export interface MapLayer {
  id: LayerId;
  container: PIXI.Container;
  visible: boolean;
  zIndex: number;
}

export class LayerManager {
  private layers: Map<LayerId, MapLayer> = new Map();
  private container: PIXI.Container;

  /**
   * Create a new LayerManager
   * @param container - The parent PIXI container to add layers to
   */
  constructor(container: PIXI.Container) {
    this.container = container;
  }

  /**
   * Create or get a layer by ID (SINGLETON PATTERN)
   *
   * If a layer with this ID already exists, returns the existing layer.
   * This prevents duplicate layer containers and ensures proper lifecycle management.
   *
   * @param id - Unique layer identifier
   * @param zIndex - Z-index for rendering order (only used when creating new layer)
   * @returns The layer's PIXI container
   */
  createLayer(id: LayerId, zIndex: number = this.getDefaultZIndex(id)): PIXI.Container {
    // SINGLETON: Return existing layer if it already exists
    if (this.layers.has(id)) {
      const existingLayer = this.layers.get(id)!;

      // Update z-index if different (allows re-ordering)
      if (existingLayer.zIndex !== zIndex && zIndex !== 0) {
        existingLayer.container.zIndex = zIndex;
        existingLayer.zIndex = zIndex;
      }

      return existingLayer.container;
    }

    // Create new layer
    const layerContainer = new PIXI.Container();
    layerContainer.name = `Layer_${id}`;
    layerContainer.zIndex = zIndex;
    layerContainer.visible = true; // Explicitly set visible

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

  /**
   * Get an existing layer by ID
   * @param id - Layer identifier
   * @returns The layer's PIXI container, or undefined if not found
   */
  getLayer(id: LayerId): PIXI.Container | undefined {
    return this.layers.get(id)?.container;
  }

  /**
   * Remove a layer completely
   * Destroys the layer's PIXI container and removes it from tracking
   *
   * @param id - Layer identifier
   */
  removeLayer(id: LayerId): void {
    const layer = this.layers.get(id);
    if (layer) {
      this.container.removeChild(layer.container);
      layer.container.destroy({ children: true });
      this.layers.delete(id);
    }
  }

  /**
   * Clear content from a layer (remove graphics but keep visibility state)
   * Use this when you want to redraw a layer without changing its visibility
   * Creates the layer if it doesn't exist yet
   *
   * @param id - Layer identifier
   */
  clearLayerContent(id: LayerId): void {
    // Ensure layer exists (create if needed)
    let layer = this.layers.get(id);
    if (!layer) {
      // Create empty layer with default z-index
      const zIndex = this.getDefaultZIndex(id);
      this.createLayer(id, zIndex);
      return; // Layer is already empty, nothing to clear
    }

    const childCount = layer.container.children.length;

    // Clear and destroy all children
    layer.container.removeChildren().forEach(child => {
      // If it's a Graphics object, clear it first
      if (child instanceof PIXI.Graphics) {
        child.clear();
      }
      child.destroy({ children: true, texture: false, baseTexture: false });
    });

    if (childCount > 0) {
      // Logging removed - let caller log if needed
    }
  }

  /**
   * Clear all content from a layer AND hide it
   * Use this when you want to completely remove a layer from view
   *
   * @param id - Layer identifier
   */
  clearLayer(id: LayerId): void {
    this.clearLayerContent(id);
    this.hideLayer(id);
  }

  /**
   * Show a layer (make it visible)
   * @param id - Layer identifier
   */
  showLayer(id: LayerId): void {
    const layer = this.layers.get(id);
    if (layer) {
      layer.container.visible = true;
      layer.visible = true;
    }
  }

  /**
   * Hide a layer (make it invisible)
   * @param id - Layer identifier
   */
  hideLayer(id: LayerId): void {
    const layer = this.layers.get(id);
    if (layer) {
      layer.container.visible = false;
      layer.visible = false;
    }
  }

  /**
   * Clear all layers and reset state
   * Hides all layers and clears their content
   */
  clearAllLayers(): void {
    this.layers.forEach((layer, id) => {
      // Clear and destroy all children
      layer.container.removeChildren().forEach(child => {
        // If it's a Graphics object, clear it first to remove all drawing commands
        if (child instanceof PIXI.Graphics) {
          child.clear();
        }
        child.destroy({ children: true, texture: false, baseTexture: false });
      });

      // Hide the layer
      layer.container.visible = false;
      layer.visible = false;
    });
  }

  /**
   * Get default z-index for a layer based on its type
   * Ensures consistent layer ordering across the application
   *
   * @param layerId - Layer identifier
   * @returns Default z-index for the layer type
   */
  getDefaultZIndex(layerId: LayerId): number {
    const place = (LAYER_ORDER as readonly string[]).indexOf(layerId);
    // A layer nobody placed sits on the ground rather than over the pieces: a stray name must
    // not land on top of the board.
    return place < 0 ? 0 : (place + 1) * 10;
  }

  /**
   * Get all layer IDs currently managed
   * @returns Array of layer identifiers
   */
  getLayerIds(): LayerId[] {
    return Array.from(this.layers.keys());
  }

  /**
   * Get the number of layers currently managed
   * @returns Layer count
   */
  getLayerCount(): number {
    return this.layers.size;
  }

  /**
   * Check if a layer exists
   * @param id - Layer identifier
   * @returns true if layer exists, false otherwise
   */
  hasLayer(id: LayerId): boolean {
    return this.layers.has(id);
  }

  /**
   * Get the visibility state of a layer
   * @param id - Layer identifier
   * @returns true if layer is visible, false otherwise (or if layer doesn't exist)
   */
  isLayerVisible(id: LayerId): boolean {
    return this.layers.get(id)?.visible ?? false;
  }
}
