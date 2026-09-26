import * as PIXI from 'pixi.js';
import { MAX_WOUNDS, type Grid, type Point, type Role, type Side } from '../engine/index.js';
import { ART_ANCHOR_Y, bannerTexture, engineArtUrl, troopArtUrl, type ActionIcon, type StatusIcon } from './art.js';
import { LIFTED_SHADOW, PIECE_LIGHT, SHADOW_CONTACT, castMatrix, silhouetteTexture } from './piece-shadow.js';
import type { BoardTheme } from './theme.js';
import { statusBars, STATUS_TRACK, STATUS_OUTLINE, type StatusBar } from './status-bars.js';
import type { TokenReaction } from './vfx/Effect.js';
import { EngineChip } from './token/EngineChip.js';
import { ART_DROP, FLAG_OFFSET, FLAG_RATIO, TOKEN_FOOTPRINT_RATIO } from './token/geometry.js';
import { MoveTween } from './token/MoveTween.js';
import { RingGlow } from './token/RingGlow.js';
import { StatusColumn } from './token/StatusColumn.js';

/** Selection uses the shared neutral outline. Active turns glow in the army's colour;
 * a free strike flashes over the piece. */
export type TokenRing = 'active' | 'selected' | 'flash';

/** Selection-stage emphasis, drawn as the piece's own scale: 'ready' breathes to say this
 * unit can still be picked to activate, 'spent' sits small and still because its turn has
 * gone. Both end the moment the activation locks. */
export type TokenPick = 'ready' | 'spent';

export type DragVerdict = Extract<ActionIcon, 'attack' | 'no'>;

export interface EngineLoading { total: number; completed: number; label: string }

export interface UnitTokenModel {
  kind: 'unit';
  id: string;
  side: Side;
  name: string;
  role: Role;
  level: number;
  cell: string;
  wounds: number;
  disorder: number;
  /** The engine's `isRouted` verdict. The piece greys, flies a colourless flag and carries a retreat arrow. */
  routed: boolean;
  /** The crewed engine card riding with this unit, if any — draws the chip. */
  engine: string | null;
  engineId?: string;
  loading?: EngineLoading;
  /** A drag's verdict on this piece, which the layer draws over its whole hex: the swords where
   * releasing attacks it, the cross where nothing can. The piece itself carries no aim icon. */
  verdict: DragVerdict | null;
  /** Everything the piece is under, top of the column last. A status that joins the list
   * announces itself over the piece before it takes its place. */
  statuses: readonly StatusIcon[];
  ring: TokenRing | null;
  pick: TokenPick | null;
}

/** An abandoned or captured siege engine, standing alone on its square. No unit fields. */
export interface EngineTokenModel {
  kind: 'engine';
  id: string;
  /** Null for an engine that is nobody's. */
  side: Side | null;
  name: string;
  cell: string;
  ring: TokenRing | null;
  loading?: EngineLoading;
}

export type TokenModel = UnitTokenModel | EngineTokenModel;

// The cloth's mass sits above the middle of the square template — it tapers to a point at the
// bottom — so the level rides a little high of the sprite's own centre.
const FLAG_TEXT_Y = -0.07;
const LIFT_SCALE = 1.08;
const GHOST_ALPHA = 0.26;
/** The selection breath: slower than the ring's glow, so the two read as separate signals. */
const PICK_PERIOD_MS = 1800;
const PICK_SWELL = 0.07;
const SPENT_SCALE = 0.8;

// A shared filter instance: desaturate() only ever sets the same fixed matrix, so every
// dead or routed miniature can point at the one instance instead of allocating its own. It is
// built on first use: a filter needs a `document`, and tests load the board barrel under node.
let desaturate: PIXI.ColorMatrixFilter | null = null;

function desaturateFilter(): PIXI.ColorMatrixFilter {
  if (!desaturate) {
    desaturate = new PIXI.ColorMatrixFilter();
    desaturate.desaturate();
  }
  return desaturate;
}

function badgeStyle(size: number, theme: BoardTheme): Partial<PIXI.ITextStyle> {
  return {
    fontFamily: 'Signika, sans-serif',
    fontSize: Math.max(8, Math.min(13, size * 0.19)),
    fill: theme.token.bannerText,
    fontWeight: 'bold',
  };
}

/**
 * One battlefield piece (a unit or a standalone engine): the miniature sprite, a shadow that
 * stands it on the ground, and the small markers around it. `draw` is called on every
 * `TokenLayer.setTokens`/geometry pass and redraws everything from the model — cheap at board
 * scale (at most 64 pieces) and far simpler than diffing which of a dozen small parts
 * actually changed. Art loads through `PIXI.Assets`; until it resolves the piece is its
 * shadow and its flag.
 *
 * The shadow is a sibling, not a child: `TokenLayer` hangs `shadow` in one group under every
 * piece, so a shadow falling across the next hex lies under that hex's piece too, and the
 * group's one alpha keeps crossing shadows from darkening twice. The token drags it along
 * each tick.
 */
export class Token extends PIXI.Container {
  readonly id: string;
  private model: TokenModel | null = null;
  private dragging = false;

  /** The contact ellipse and the cast silhouette, positioned by `tick` to follow the piece. */
  readonly shadow = new PIXI.Container();
  private readonly contact = new PIXI.Graphics();
  private readonly cast = new PIXI.Container();
  private silhouette: PIXI.Sprite | null = null;
  private readonly decor = new PIXI.Graphics(); // the health and morale bars
  private art: PIXI.Sprite | null = null;
  private artPath: string | null = null;
  private artGeneration = 0;

  private flag: PIXI.Sprite | null = null;
  private flagColour: number | null = null;
  private badge: PIXI.Text | null = null;

  private readonly chip = new EngineChip();
  private readonly loadingPips = new PIXI.Graphics();
  private loadingLabel: PIXI.Text | null = null;
  private loadingKey = '';

  private readonly statusColumn = new StatusColumn();
  private readonly routArrow = new PIXI.Graphics();
  private readonly ring = new RingGlow();

  private pick: TokenPick | null = null;
  private pickStart = 0;
  private pickScale = 1;
  private reactScale = { x: 1, y: 1 };

  private size = 0;
  private desaturated = false;
  private reaction: { spec: TokenReaction; start: number } | null = null;
  private flashFilter: PIXI.ColorMatrixFilter | null = null;

  private readonly motion = new MoveTween();

  get moving(): boolean { return this.motion.moving; }

  get settlingMs(): number { return this.statusColumn.settlingMs; }

  constructor(id: string) {
    super();
    this.id = id;
    this.addChild(this.decor, this.chip.container, this.routArrow, this.ring.graphics);
    this.cast.transform.setFromMatrix(castMatrix(PIECE_LIGHT));
    this.shadow.addChild(this.contact, this.cast);
    this.routArrow.visible = false;
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  /** The cell this piece occupies on the board, which a drag or a move tween does not change
   * until the model does. Null before its first `draw`. */
  get cell(): string | null {
    return this.model?.cell ?? null;
  }

  // Named `draw`, not `render` — PIXI.DisplayObject already owns `render(renderer)` as part
  // of its own draw call, and overriding it silently breaks rendering.
  draw(model: TokenModel, grid: Grid, size: number, theme: BoardTheme): void {
    this.model = model;
    if (!this.dragging) this.place(model, grid, size);

    const wounds = model.kind === 'unit' ? model.wounds : 0;
    const routed = model.kind === 'unit' && model.routed;

    this.drawContact(size);
    this.updateArt(model, size);
    this.size = size;
    this.desaturated = wounds >= MAX_WOUNDS || routed;
    this.applyFilters();
    // Units use their army's colour. Engines hide the flag and share the neutral selection.
    const side = model.side ?? 'attacker';
    this.updateFlag(side, size, theme, routed);
    // An engine standing alone is nobody's: the unit that works it is what shows a side.
    if (this.flag) this.flag.visible = model.kind === 'unit';

    if (model.kind === 'unit') {
      this.drawDecor(model, size);
      this.drawBadge(model.level, size, theme);
      this.chip.update(model.engine, size, theme);
      this.statusColumn.update(model.statuses, size);
    } else {
      this.decor.clear();
      this.badge?.destroy();
      this.badge = null;
      this.chip.update(null, size, theme);
      this.statusColumn.update([], size);
    }

    this.setPick(model.kind === 'unit' ? model.pick : null);
    this.drawLoading(model, size, theme);
    this.drawRoutArrow(routed, side, size, theme);
    this.ring.draw(model.ring, side, size, theme);

    // Re-append in a fixed order: the flag and badge attach at the top when first drawn, and
    // addChild on an existing child just moves it there — flag under its own level, both under
    // the arrow and ring.
    if (this.flag) this.addChild(this.flag);
    if (this.badge) this.addChild(this.badge);
    this.addChild(this.statusColumn.container);
    this.addChild(this.loadingPips);
    if (this.loadingLabel) this.addChild(this.loadingLabel);
    this.addChild(this.routArrow);
    if (model.ring === 'flash') this.addChild(this.ring.graphics);
    else this.addChildAt(this.ring.graphics, 0);
  }

  /** The engine chip's hit box in the layer's coordinates, scaled with the piece's breath and recoil. */
  chipBounds(): { x: number; y: number; size: number } {
    const { x, y, side } = this.chip.bounds(this.size);
    return { x: this.x + x * this.scale.x, y: this.y + y * this.scale.y, size: side * Math.max(this.scale.x, this.scale.y) };
  }

  /** A still of the miniature where it currently stands, for the layer to leave behind while
   * this piece is dragged. A sibling, not a child: the container itself follows the pointer.
   * Null until the art resolves, which is also the only case with nothing to copy. */
  ghost(): PIXI.Sprite | null {
    if (!this.art) return null;
    const ghost = new PIXI.Sprite(this.art.texture);
    ghost.anchor.copyFrom(this.art.anchor);
    ghost.scale.copyFrom(this.art.scale);
    ghost.position.set(this.x + this.art.x, this.y + this.art.y);
    ghost.alpha = GHOST_ALPHA;
    return ghost;
  }

  /** `Interaction`'s board-internal token drag: lift and follow the pointer. */
  beginDrag(point: Point): void {
    this.dragging = true;
    this.position.set(point.x, point.y);
    this.scale.set(LIFT_SCALE);
    this.alpha = 0.92;
    this.zIndex = 1000;
  }

  dragTo(point: Point): void {
    this.position.set(point.x, point.y);
  }

  /** The route this piece's next move follows — see `MoveTween.setRoute`. */
  setRoute(cells: readonly string[]): void {
    this.motion.setRoute(cells);
  }

  /** Snaps straight back to this token's last-drawn cell — its old one, since a rejected
   * drop never mutates the caller's state and so never triggers a fresh `draw()` to move it
   * to a new one. A valid drop still lands here first and then jumps again once the
   * caller's reactive update calls `draw()`; that second jump is one flush away and reads as
   * a single snap in practice. No separate tween either way. */
  endDrag(grid: Grid, size: number): void {
    this.dragging = false;
    this.applyScale();
    this.alpha = 1;
    this.zIndex = 0;
    if (this.model) this.place(this.model, grid, size);
  }

  /** Advances the move tween and the ring's pulse/flash animation. Called every tick; a
   * cheap no-op unless this token has one or the other running. */
  tick(): void {
    const point = this.motion.step();
    if (point) this.position.set(point.x, point.y);
    this.statusColumn.tick();
    this.ring.tick();
    if (this.pick === 'ready') this.breathePick();
    if (this.reaction) this.animateReaction();
    this.followShadow();
  }

  /** A spell's touch: a short squash, pop, hop, jitter or brightening, then back to rest. A
   * piece in hand ignores it — the lift already owns its scale. */
  react(spec: TokenReaction): void {
    if (this.dragging) return;
    this.reaction = { spec, start: performance.now() };
    if (spec.flash) {
      this.flashFilter ??= new PIXI.ColorMatrixFilter();
      const r = ((spec.flash >> 16) & 0xff) / 255;
      const g = ((spec.flash >> 8) & 0xff) / 255;
      const b = (spec.flash & 0xff) / 255;
      this.flashFilter.matrix = [1, 0, 0, 0, r * 0.85, 0, 1, 0, 0, g * 0.85, 0, 0, 1, 0, b * 0.85, 0, 0, 0, 1, 0];
      this.flashFilter.alpha = 1;
    }
    this.applyFilters();
  }

  private animateReaction(): void {
    const { spec, start } = this.reaction!;
    const u = Math.min(1, (performance.now() - start) / spec.duration);
    if (u >= 1) {
      this.reaction = null;
      this.reactScale = { x: 1, y: 1 };
      this.applyScale();
      this.pivot.set(0, 0);
      this.applyFilters();
      return;
    }
    if (this.dragging) return;
    // A damped ring: one hard push, one overshoot back, settled by the end.
    const w = Math.exp(-3.5 * u) * Math.sin(u * Math.PI * 2.5);
    const bounce = Math.sin(u * Math.PI);
    let sx = 1;
    let sy = 1;
    if (spec.squash) { sx += spec.squash * w; sy -= spec.squash * w; }
    if (spec.pop) { sx += spec.pop * w; sy += spec.pop * w; }
    this.reactScale = { x: sx, y: sy };
    this.applyScale();
    this.pivot.set(
      spec.shake ? Math.sin(u * 42) * (1 - u) * spec.shake * this.size : 0,
      spec.hop ? bounce * spec.hop * this.size : 0,
    );
    if (this.flashFilter) this.flashFilter.alpha = (1 - u) ** 2;
  }

  private setPick(pick: TokenPick | null): void {
    if (pick === this.pick) return;
    this.pick = pick;
    this.pickStart = performance.now();
    if (pick === 'ready') this.breathePick();
    else {
      this.pickScale = pick === 'spent' ? SPENT_SCALE : 1;
      this.applyScale();
    }
  }

  private breathePick(): void {
    const t = ((performance.now() - this.pickStart) % PICK_PERIOD_MS) / PICK_PERIOD_MS;
    this.pickScale = 1 + PICK_SWELL * Math.sin(t * Math.PI * 2);
    this.applyScale();
  }

  /** The piece's two scales — the selection breath and a spell's recoil — multiplied into the
   * one container scale. A piece in hand keeps its lift instead. */
  private applyScale(): void {
    if (this.dragging) return;
    this.scale.set(this.reactScale.x * this.pickScale, this.reactScale.y * this.pickScale);
  }

  private applyFilters(): void {
    const list: PIXI.Filter[] = [];
    // Keep each bar's severity colour when the miniature loses its colour.
    if (this.art) this.art.filters = this.desaturated ? [desaturateFilter()] : null;
    if (this.reaction?.spec.flash && this.flashFilter) list.push(this.flashFilter);
    this.filters = list.length ? list : null;
  }

  private place(model: TokenModel, grid: Grid, size: number): void {
    const snap = this.motion.place({ x: this.x, y: this.y }, model.cell, grid, size);
    if (snap) this.position.set(snap.x, snap.y);
  }

  // The miniature's own base ellipse lands at its local y ≈ 0 (see ART_ANCHOR_Y), so the
  // contact shadow tracks the same drop the art takes. Black in both themes: the dark
  // theme's ink is light, and a shadow is not.
  private drawContact(size: number): void {
    const y = size * (ART_DROP + 0.02);
    this.contact.clear().beginFill(0x000000, SHADOW_CONTACT.alpha).drawEllipse(0, y, size * SHADOW_CONTACT.rx, size * SHADOW_CONTACT.ry).endFill();
  }

  // The shadow stays on the ground: it takes the piece's position and its breath, and none
  // of its hop or shake. A lifted piece leaves it behind along the light.
  private followShadow(): void {
    if (this.dragging) {
      const radians = (PIECE_LIGHT.azimuth * Math.PI) / 180;
      const lift = this.size * LIFTED_SHADOW.lift * PIECE_LIGHT.slope;
      this.shadow.position.set(this.x + Math.cos(radians) * lift, this.y + Math.sin(radians) * lift);
      this.shadow.scale.set(LIFTED_SHADOW.scale);
      this.shadow.alpha = LIFTED_SHADOW.alpha;
      return;
    }
    this.shadow.position.set(this.x, this.y);
    this.shadow.scale.copyFrom(this.scale);
    this.shadow.alpha = 1;
  }

  override destroy(options?: boolean | PIXI.IDestroyOptions): void {
    // The parts' texture loads check their own containers, which super leaves alive; going
    // first also keeps a `children: true` destroy from reaching them twice.
    this.statusColumn.destroy();
    this.chip.destroy();
    super.destroy(options);
    this.shadow.destroy({ children: true });
  }

  private updateArt(model: TokenModel, size: number): void {
    const path = model.kind === 'unit' ? troopArtUrl(model.name, model.role) : (engineArtUrl(model.name) ?? troopArtUrl(model.name, 'infantry'));
    if (path !== this.artPath) {
      this.artPath = path;
      const generation = ++this.artGeneration;
      PIXI.Assets.load<PIXI.Texture>(path)
        .then((texture) => {
          if (this.destroyed || generation !== this.artGeneration) return;
          if (!this.art) {
            this.art = new PIXI.Sprite(texture);
            this.art.anchor.set(0.5, ART_ANCHOR_Y);
            this.addChildAt(this.art, 0);
          } else {
            this.art.texture = texture;
          }
          this.layoutArt(size);
          this.applyFilters();
        })
        // proto: a missing texture leaves the contact shadow as the placeholder; no error UI.
        .catch(() => {});
      silhouetteTexture(path)
        .then((texture) => {
          if (this.destroyed || generation !== this.artGeneration) return;
          if (!this.silhouette) {
            this.silhouette = new PIXI.Sprite(texture);
            this.silhouette.anchor.set(0.5, ART_ANCHOR_Y);
            this.silhouette.tint = 0x000000;
            this.cast.addChild(this.silhouette);
          } else {
            this.silhouette.texture = texture;
          }
          this.layoutArt(size);
        })
        // proto: a missing silhouette leaves the cast shadow blank; no error UI.
        .catch(() => {});
    }
    this.layoutArt(size);
  }

  // The silhouette is baked narrower than the art, so each is scaled to the footprint from
  // its own width; both hinge on the anchor row, dropped together.
  private layoutArt(size: number): void {
    const target = size * (this.model?.kind === 'engine' ? 1 : TOKEN_FOOTPRINT_RATIO);
    if (this.art) {
      this.art.scale.set(target / Math.max(this.art.texture.width, 1));
      this.art.position.set(0, size * ART_DROP);
    }
    if (this.silhouette) this.silhouette.scale.set(target / Math.max(this.silhouette.texture.width, 1));
    this.cast.position.set(0, size * ART_DROP);
  }

  private drawDecor(model: UnitTokenModel, size: number): void {
    this.decor.clear();

    const bars = statusBars(model.wounds, model.disorder);
    const width = size * 0.60;
    const healthHeight = size * 0.08;
    const moraleHeight = size * 0.045;
    const y = size * 0.28;
    this.drawStatusBar(bars.health, -width / 2, y, width, healthHeight);
    this.drawStatusBar(bars.morale, -width / 2, y + healthHeight + size * 0.03, width, moraleHeight);
  }

  private drawLoading(model: TokenModel, size: number, theme: BoardTheme): void {
    const load = model.loading;
    const key = JSON.stringify([load, model.kind, size, theme.ink, theme.rule, theme.token.badgeFill]);
    if (key === this.loadingKey) return;
    this.loadingKey = key;
    this.loadingPips.clear();
    if (this.loadingLabel) this.loadingLabel.visible = false;
    if (!load) return;
    const y = size * (model.kind === 'unit' ? -0.53 : 0.43);
    if (load.completed < load.total) {
      const columns = Math.min(8, load.total), pitch = size * 0.095, pip = size * 0.065;
      const width = columns * pitch + size * 0.04;
      const height = Math.ceil(load.total / columns) * pitch + size * 0.04;
      this.loadingPips.lineStyle(1, theme.rule).beginFill(theme.token.badgeFill, .95)
        .drawRoundedRect(-width / 2, y - height / 2, width, height, size * .03).endFill();
      for (let i = 0; i < load.total; i++) {
        this.loadingPips.lineStyle(1, theme.rule).beginFill(i < load.completed ? 0xd4aa52 : 0x403b32)
          .drawRoundedRect((i % columns - columns / 2) * pitch + (pitch - pip) / 2,
            y - height / 2 + size * .02 + Math.floor(i / columns) * pitch + (pitch - pip) / 2,
            pip, pip, size * .01).endFill();
      }
      return;
    }
    if (!this.loadingLabel) {
      this.loadingLabel = new PIXI.Text();
      this.loadingLabel.anchor.set(.5);
    }
    this.loadingLabel.visible = true;
    this.loadingLabel.text = load.label.replace(' · ', '\n');
    this.loadingLabel.style = new PIXI.TextStyle({ fontFamily: 'Georgia', fontSize: size * .105, fill: theme.ink, align: 'center' });
    this.loadingLabel.position.set(0, y);
    const width = this.loadingLabel.width + size * .08, height = this.loadingLabel.height + size * .04;
    this.loadingPips.lineStyle(1, theme.rule).beginFill(theme.token.badgeFill, .95)
      .drawRoundedRect(-width / 2, y - height / 2, width, height, size * .03).endFill();
  }

  private drawStatusBar(bar: StatusBar, x: number, y: number, width: number, height: number): void {
    const innerWidth = width - 2;
    this.decor.lineStyle(0).beginFill(STATUS_TRACK).drawRect(x, y, width, height).endFill();
    if (bar.remaining > 0) {
      this.decor.beginFill(bar.colour)
        .drawRect(x + 1, y + 1, innerWidth * bar.remaining / bar.max, height - 2).endFill();
    }
    this.decor.lineStyle(1, STATUS_OUTLINE, 0.5);
    for (let i = 1; i < bar.max; i++) {
      const tick = x + 1 + innerWidth * i / bar.max;
      this.decor.moveTo(tick, y + 1).lineTo(tick, y + height - 1);
    }
    this.decor.lineStyle(1, STATUS_OUTLINE).drawRect(x, y, width, height);
  }

  /** The side's flag, top right — the only thing on the piece that says whose it is, now that
   * the coloured disc is gone. A routed unit flies a colourless one and carries a retreat arrow. */
  private updateFlag(side: Side, size: number, theme: BoardTheme, routed: boolean): void {
    const colour = routed ? theme.token.routed : side === 'attacker' ? theme.attacker : theme.defender;
    if (!this.flag) {
      this.flag = new PIXI.Sprite(bannerTexture(colour));
      this.flag.anchor.set(0.5);
      this.addChild(this.flag);
      this.flagColour = colour;
    } else if (colour !== this.flagColour) {
      this.flag.texture = bannerTexture(colour);
      this.flagColour = colour;
    }
    this.layoutFlag(size);
  }

  private layoutFlag(size: number): void {
    if (!this.flag) return;
    const { baseTexture, height } = this.flag.texture;
    // An SVG rasterizes a frame or two after `Texture.from` hands back the texture, and until
    // it does the frame is 1×1 — scaling off that would blow the flag up to a full screen.
    if (!baseTexture.valid) {
      baseTexture.once('loaded', () => { if (!this.destroyed) this.layoutFlag(size); });
      return;
    }
    const r = (size * TOKEN_FOOTPRINT_RATIO) / 2;
    this.flag.scale.set((size * FLAG_RATIO) / height);
    this.flag.position.set(r * FLAG_OFFSET, -r * FLAG_OFFSET);
    this.badge?.position.set(this.flag.x, this.flag.y + size * FLAG_RATIO * FLAG_TEXT_Y);
  }

  private drawBadge(level: number, size: number, theme: BoardTheme): void {
    if (!this.badge) {
      this.badge = new PIXI.Text(String(level), new PIXI.TextStyle(badgeStyle(size, theme)));
      this.badge.anchor.set(0.5);
      this.addChild(this.badge);
    } else {
      this.badge.text = String(level);
      this.badge.style = new PIXI.TextStyle(badgeStyle(size, theme));
    }
    this.layoutFlag(size);
  }

  /** The combat text queue will announce these, so they stay hidden until it does. */
  expectStatuses(icons: readonly StatusIcon[]): void {
    this.statusColumn.expect(icons);
  }

  /** Plays each status's arrival now, one after another. False when the piece holds none of them. */
  announceStatuses(icons: readonly StatusIcon[]): boolean {
    return this.statusColumn.announce(icons);
  }

  private drawRoutArrow(routed: boolean, side: Side, size: number, theme: BoardTheme): void {
    this.routArrow.visible = routed;
    this.routArrow.clear();
    if (!routed) return;
    // Board-local y grows toward the attacker's home edge (rank 1), on both grids — see
    // grid.ts's SquareGrid/HexGrid `center`. A routed unit retreats toward its own edge.
    const dir = side === 'attacker' ? 1 : -1;
    const r = (size * TOKEN_FOOTPRINT_RATIO) / 2;
    const x = r + size * 0.16;
    const half = size * 0.2 * dir;
    const width = size * 0.07;
    const shaft = size * 0.025;
    // An opposing outline keeps the retreat symbol visible over both pale and dark terrain.
    this.routArrow
      .lineStyle(Math.max(1, size * 0.022), theme.background, 1)
      .beginFill(theme.ink, 1)
      .moveTo(x, half + size * 0.09 * dir)
      .lineTo(x - width, half)
      .lineTo(x - shaft, half)
      .lineTo(x - shaft, -half)
      .lineTo(x + shaft, -half)
      .lineTo(x + shaft, half)
      .lineTo(x + width, half)
      .closePath()
      .endFill();
  }
}
