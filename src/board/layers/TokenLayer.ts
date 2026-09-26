import * as PIXI from 'pixi.js';
import type { Grid, Point } from '../../engine/index.js';
import type { TokenPlacement } from '../hit.js';
import type { BoardTheme } from '../theme.js';
import { SHADOW_GROUP } from '../piece-shadow.js';
import { actionIconUrl, type ActionIcon, type StatusIcon } from '../art.js';
import { Token, TOKEN_FOOTPRINT_RATIO, type TokenModel, type UnitTokenModel } from '../Token.js';
import type { TokenReaction } from '../vfx/Effect.js';

const DRAG_PROP_RATIO = 0.95;

/**
 * Token sprites, diffed by id against the previous `setTokens` call — modelled on
 * pf2e-reignmaker's `renderers/FogOfWarRenderer.ts` ghost-sprite cache: destroy what's gone,
 * create what's new, and just reposition/redraw everything else in place.
 */
export class TokenLayer {
  private readonly container: PIXI.Container;
  // Every piece's shadow in one group under every piece, darkened and softened once as a
  // whole — see `Token.shadow`.
  private readonly shadows = new PIXI.Container();
  private readonly shadowBlur = new PIXI.BlurFilter();
  private readonly ticker: PIXI.Ticker;
  private theme: BoardTheme;
  private grid: Grid | null = null;
  private size = 0;
  private models: readonly TokenModel[] = [];
  private readonly cache = new Map<string, Token>();
  // Pieces the list has dropped that stand until their death is announced — see `FallenLayer`.
  private readonly held = new Set<string>();
  private draggingId: string | null = null;
  private ghost: PIXI.Sprite | null = null;
  // A drag's verdict on the piece under it, drawn over the whole cell and above the carried token.
  private readonly dragProp = new PIXI.Sprite();
  private dragPropIcon: ActionIcon | null = null;

  // Every token ticks regardless of drag state: a move tween or a free-strike flash can be
  // running on some other token while one is being dragged.
  private readonly tick = (): void => {
    for (const token of this.cache.values()) token.tick();
  };

  constructor(container: PIXI.Container, ticker: PIXI.Ticker, theme: BoardTheme, screen: PIXI.Rectangle) {
    this.container = container;
    this.container.sortableChildren = true;
    this.shadows.name = 'Token_shadows';
    this.shadows.zIndex = -2;
    // Auto bounds follow the outermost breathing piece. Their rounding shifts the shared
    // filter's sampling origin and makes even stationary shadows twitch. The renderer owns
    // this screen-space rectangle and updates it on resize; pan and zoom leave it fixed.
    this.shadows.filterArea = screen;
    this.shadows.filters = [this.shadowBlur, new PIXI.AlphaFilter(SHADOW_GROUP.alpha)];
    this.container.addChild(this.shadows);
    this.dragProp.anchor.set(0.5);
    this.dragProp.zIndex = 2000;
    this.dragProp.visible = false;
    this.container.addChild(this.dragProp);
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
    this.shadowBlur.blur = size * SHADOW_GROUP.blur;
    this.renderAll();
  }

  setTokens(models: readonly TokenModel[]): void {
    this.models = models;
    this.renderAll();
  }

  /** The cell each piece stands on, for `Interaction`'s hit test. In model order, so a unit
   * is found before an engine left on the same ground. */
  placements(): TokenPlacement[] {
    return this.models
      .map((m): TokenPlacement => {
        const token = this.cache.get(m.id);
        const offset = this.size * TOKEN_FOOTPRINT_RATIO / 2 * .72;
        return { id: m.id, cell: m.cell,
          badge: m.kind === 'unit' && m.engineId && token ? {
            id: m.engineId, x: token.x - offset * token.scale.x, y: token.y - offset * token.scale.y, size: this.size * .3 * Math.max(token.scale.x, token.scale.y),
          } : undefined };
      })
      .filter((p) => this.cache.has(p.id));
  }

  /** Where the piece is drawn this frame, mid-walk included. Null once the board has taken it off. */
  positionOf(id: string): Point | null {
    const token = this.cache.get(id);
    return token ? { x: token.x, y: token.y } : null;
  }

  expectStatuses(id: string, icons: readonly StatusIcon[]): void {
    this.cache.get(id)?.expectStatuses(icons);
  }

  announceStatuses(id: string, icons: readonly StatusIcon[]): boolean {
    return this.cache.get(id)?.announceStatuses(icons) ?? false;
  }

  hold(id: string): void {
    this.held.add(id);
  }

  release(id: string): void {
    if (this.held.delete(id)) this.renderAll();
  }

  settlingMs(): number {
    return Math.max(0, ...[...this.cache.values()].map((token) => token.settlingMs));
  }

  moving(): boolean {
    for (const token of this.cache.values()) if (token.moving) return true;
    return false;
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
    if (!live) { this.layoutDragProp(); return; }
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

  /** The route a token's next move follows — see `Token.setRoute`. Unknown ids are ignored:
   * a token that does not exist yet has no move to route. */
  setRoute(id: string, cells: readonly string[]): void {
    this.cache.get(id)?.setRoute(cells);
  }

  /** A spell's touch on whatever stands on `cell`; an empty cell takes it silently. */
  reactAt(cell: string, reaction: TokenReaction): void {
    for (const model of this.models) {
      if (model.cell === cell) this.cache.get(model.id)?.react(reaction);
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
    if (!placeable) this.held.clear();
    for (const [id, token] of this.cache) {
      if (wanted.has(id) || this.held.has(id)) continue;
      this.container.removeChild(token);
      this.shadows.removeChild(token.shadow);
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
        this.shadows.addChild(token.shadow);
      }
      token.draw(model, this.grid!, this.size, this.theme);
    }
    this.layoutDragProp();
  }

  private dragPropOn(model: TokenModel): model is UnitTokenModel {
    return model.kind !== 'engine' && this.draggingId !== null && model.id !== this.draggingId && model.verdict !== null;
  }

  private layoutDragProp(): void {
    const model = this.models.find((m) => this.dragPropOn(m));
    const token = model && this.cache.get(model.id);
    if (!model || !token) {
      this.dragProp.visible = false;
      this.dragPropIcon = null;
      return;
    }
    this.dragProp.position.set(token.x, token.y);
    const icon = model.verdict!;
    if (icon === this.dragPropIcon) { this.dragProp.visible = true; return; }
    this.dragPropIcon = icon;
    this.dragProp.visible = false;
    PIXI.Assets.load<PIXI.Texture>(actionIconUrl(icon))
      .then((texture) => {
        if (this.dragPropIcon !== icon) return;
        this.dragProp.texture = texture;
        this.dragProp.scale.set((this.size * DRAG_PROP_RATIO) / Math.max(texture.width, texture.height, 1));
        this.dragProp.visible = true;
      })
      // proto: a missing verdict icon leaves the drag prop blank; no error UI.
      .catch(() => {});
  }

  /** Unhooks the ticker and drops every cached token before the generic `LayerManager`
   * teardown runs on `BoardContainer.destroy` — nothing left for it to double-free. */
  destroy(): void {
    this.ticker.remove(this.tick);
    this.setGeometry(null, 0, this.theme);
  }
}
