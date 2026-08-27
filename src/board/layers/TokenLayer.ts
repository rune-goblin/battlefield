import * as PIXI from 'pixi.js';
import type { Grid, Point } from '../../engine/index.js';
import type { TokenBounds } from '../hit.js';
import type { BoardTheme } from '../theme.js';
import { Token, TOKEN_FOOTPRINT_RATIO, type TokenModel } from '../Token.js';

/**
 * Token sprites, diffed by id against the previous `setTokens` call — modelled on
 * pf2e-reignmaker's `renderers/FogOfWarRenderer.ts` ghost-sprite cache: destroy what's gone,
 * create what's new, and just reposition/redraw everything else in place.
 */
export class TokenLayer {
  private readonly container: PIXI.Container;
  private readonly ticker: PIXI.Ticker;
  private theme: BoardTheme;
  private grid: Grid | null = null;
  private size = 0;
  private models: readonly TokenModel[] = [];
  private readonly cache = new Map<string, Token>();
  private draggingId: string | null = null;
  private ghost: PIXI.Sprite | null = null;

  // Wave 5 needs every token ticked regardless of drag state: a move tween or a free-strike
  // flash can be running on some other token while one is being dragged.
  private readonly tick = (): void => {
    for (const token of this.cache.values()) token.tick();
  };

  constructor(container: PIXI.Container, ticker: PIXI.Ticker, theme: BoardTheme) {
    this.container = container;
    this.container.sortableChildren = true;
    this.ticker = ticker;
    this.theme = theme;
    this.ticker.add(this.tick);
  }

  /** Called by `setBoard`'s redraw with the board's current grid and cell size. */
  setGeometry(grid: Grid | null, size: number, theme: BoardTheme): void {
    this.clearGhost();
    this.grid = grid;
    this.size = size;
    this.theme = theme;
    this.renderAll();
  }

  setTokens(models: readonly TokenModel[]): void {
    this.models = models;
    this.renderAll();
  }

  /** Discs in board-local coordinates, for `Interaction`'s hit test. */
  bounds(): TokenBounds[] {
    if (!this.size) return [];
    const radius = (this.size * TOKEN_FOOTPRINT_RATIO) / 2;
    return [...this.cache.values()].map((token) => ({ id: token.id, x: token.x, y: token.y, radius }));
  }

  /** `Interaction`'s board-internal token drag: `point` in board-local coordinates while
   * live, `null` on drop or cancel. */
  setDrag(id: string | null, point: Point | null): void {
    const live = id && point ? id : null;
    if (this.draggingId && this.draggingId !== live && this.grid) {
      this.cache.get(this.draggingId)?.endDrag(this.grid, this.size);
      this.clearGhost();
    }
    this.draggingId = live;
    if (!live) return;
    const token = this.cache.get(live);
    if (!token) return;
    if (token.isDragging) token.dragTo(point!);
    else {
      // Captured before the lift, while the token still stands on its own cell — the ghost
      // is what says where the piece came from, so the arrow needs no tether of its own.
      this.ghost = token.ghost();
      if (this.ghost) {
        this.ghost.zIndex = -1;
        this.container.addChild(this.ghost);
      }
      token.beginDrag(point!);
    }
  }

  private clearGhost(): void {
    if (!this.ghost) return;
    this.container.removeChild(this.ghost);
    this.ghost.destroy();
    this.ghost = null;
  }

  private renderAll(): void {
    const placeable = this.grid && this.size;
    const wanted = placeable ? new Map(this.models.map((m) => [m.id, m])) : new Map<string, TokenModel>();
    for (const [id, token] of this.cache) {
      if (wanted.has(id)) continue;
      this.container.removeChild(token);
      token.destroy();
      this.cache.delete(id);
    }
    if (!placeable) return;
    for (const model of this.models) {
      let token = this.cache.get(model.id);
      if (!token) {
        token = new Token(model.id);
        this.cache.set(model.id, token);
        this.container.addChild(token);
      }
      token.draw(model, this.grid!, this.size, this.theme);
    }
  }

  /** Unhooks the ticker and drops every cached token before the generic `LayerManager`
   * teardown runs on `BoardContainer.destroy` — nothing left for it to double-free. */
  destroy(): void {
    this.ticker.remove(this.tick);
    this.setGeometry(null, 0, this.theme);
  }
}
