import * as PIXI from 'pixi.js';
import { LayerManager } from './layers/LayerManager.js';

// A plain PIXI.Container holding the board's layer stack. It makes no assumption about what
// it is mounted into — BoardApp's stage today, a Foundry "primary" container in the Wave 6
// portability prototype — so it never touches PIXI.Application or the DOM.
export class BoardContainer extends PIXI.Container {
  readonly layers: LayerManager;

  constructor() {
    super();
    this.sortableChildren = true;
    this.layers = new LayerManager(this);
  }

  destroy(options?: Parameters<PIXI.Container['destroy']>[0]): void {
    this.layers.clearAllLayers();
    super.destroy(options);
  }
}
