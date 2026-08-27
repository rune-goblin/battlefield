import * as PIXI from 'pixi.js';
import { MAX_WOUNDS, type Grid, type Point, type Role, type Side } from '../engine/index.js';
import { bannerTexture, engineArtUrl, troopArtUrl } from './art.js';
import type { BoardTheme } from './theme.js';

/** A ring is state, never chrome: the unit acting now, a free strike landing, or the piece a
 * placement stage has hold of. Whose piece it is comes off the flag instead. */
export type TokenRing = 'active' | 'selected' | 'flash';

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
  /** Disorder a unit absorbs before it routs; varies per unit (Quality), so the rout
   * threshold and the disorder-pip count both read off it rather than a fixed constant. */
  quality: number;
  /** The crewed engine card riding with this unit, if any — draws the chip. */
  engine: string | null;
  ring: TokenRing | null;
}

/** An abandoned or captured siege engine, standing alone on its square. No unit fields. */
export interface EngineTokenModel {
  kind: 'engine';
  id: string;
  side: Side;
  name: string;
  cell: string;
  ring: TokenRing | null;
}

export type TokenModel = UnitTokenModel | EngineTokenModel;

/** The piece's footprint, as a fraction of cell size: how wide the miniature draws, where the
 * markers hang off it, and TokenLayer's hit-test radius. */
export const TOKEN_FOOTPRINT_RATIO = 0.82;

// proto: pf2e-trooper's *_strategy.webp renders put the miniature's own base ellipse about
// four-fifths of the way down a square image (checked by eye against half a dozen troop and
// engine samples). There is no per-image crop data to anchor exactly, so one tuned constant
// stands in for the whole set rather than measuring each image.
const ART_ANCHOR_Y = 0.8;
// The ring traces the piece's footprint — which is also its hit area — now that there is no
// disc for it to sit outside of. Any wider and it cuts through the flag's level.
const RING_GAP = 0.01;
/** The flag's height, as a fraction of cell size. */
const FLAG_RATIO = 0.32;
// The cloth's mass sits above the middle of the square template — it tapers to a point at the
// bottom — so the level rides a little high of the sprite's own centre.
const FLAG_TEXT_Y = -0.07;
const LIFT_SCALE = 1.08;
const GHOST_ALPHA = 0.26;
const PULSE_PERIOD_MS = 1400;
const FLASH_PERIOD_MS = 260;
const MOVE_TWEEN_MS = 200;

// A shared filter instance: desaturate() only ever sets the same fixed matrix, so every
// broken token can point at the one instance instead of allocating its own.
const DESATURATE = new PIXI.ColorMatrixFilter();
DESATURATE.desaturate();

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
 */
export class Token extends PIXI.Container {
  readonly id: string;
  private model: TokenModel | null = null;
  private dragging = false;

  private readonly shadow = new PIXI.Graphics();
  private readonly decor = new PIXI.Graphics(); // wound/disorder pips, chip frame
  private art: PIXI.Sprite | null = null;
  private artPath: string | null = null;
  private artGeneration = 0;

  private flag: PIXI.Sprite | null = null;
  private flagColour: number | null = null;
  private badge: PIXI.Text | null = null;

  private engineChip: PIXI.Sprite | null = null;
  private chipPath: string | null = null;
  private chipGeneration = 0;

  private readonly routArrow = new PIXI.Graphics();
  private readonly ring = new PIXI.Graphics();
  private ringKind: TokenRing | null = null;
  private pulseStart = 0;

  // Wave 5: a battle move tweens from wherever the token is actually sitting (which may
  // itself be mid-tween from the previous move) to the new cell's centre. `lastCell` is null
  // until the first `place()`, so mounting never tweens in from the origin.
  private lastCell: string | null = null;
  private tween: { from: Point; to: Point; start: number } | null = null;

  constructor(id: string) {
    super();
    this.id = id;
    this.addChild(this.shadow, this.decor, this.routArrow, this.ring);
    this.routArrow.visible = false;
    this.ring.visible = false;
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  // Named `draw`, not `render` — PIXI.DisplayObject already owns `render(renderer)` as part
  // of its own draw call, and overriding it silently breaks rendering.
  draw(model: TokenModel, grid: Grid, size: number, theme: BoardTheme): void {
    this.model = model;
    if (!this.dragging) this.place(model, grid, size);

    const wounds = model.kind === 'unit' ? model.wounds : 0;
    const disorder = model.kind === 'unit' ? model.disorder : 0;
    const broken = model.kind === 'unit' && wounds >= MAX_WOUNDS - 1;
    const routed = model.kind === 'unit' && disorder >= model.quality;

    this.drawShadow(size, theme);
    this.updateArt(model, size);
    this.filters = broken ? [DESATURATE] : null;
    this.updateFlag(model.side, size, theme, routed);

    if (model.kind === 'unit') {
      this.drawDecor(model, size, theme);
      this.drawBadge(model.level, size, theme);
      this.updateEngineChip(model.engine, size);
    } else {
      this.decor.clear();
      this.badge?.destroy();
      this.badge = null;
      this.updateEngineChip(null, size);
    }

    this.drawRoutArrow(routed, model.side, size, theme);
    this.drawRing(model.ring, size, theme);

    // Re-append: the art and the engine chip are attached lazily as their textures resolve,
    // which would otherwise draw them over the flag and the arrow/ring. addChild on an
    // existing child just moves it to the top, so this fixes the order regardless of load
    // order — flag under its own level, both under the arrow and ring.
    if (this.flag) this.addChild(this.flag);
    if (this.badge) this.addChild(this.badge);
    this.addChild(this.routArrow);
    this.addChild(this.ring);
  }

  /** A still of the miniature where it currently stands, for the layer to leave behind while
   * this piece is dragged. A sibling, not a child: the container itself follows the pointer.
   * Null until the art resolves, which is also the only case with nothing to copy. */
  ghost(): PIXI.Sprite | null {
    if (!this.art) return null;
    const ghost = new PIXI.Sprite(this.art.texture);
    ghost.anchor.copyFrom(this.art.anchor);
    ghost.scale.copyFrom(this.art.scale);
    ghost.position.set(this.x, this.y);
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

  /** Snaps straight back to this token's last-drawn cell — its old one, since a rejected
   * drop never mutates the caller's state and so never triggers a fresh `draw()` to move it
   * to a new one. A valid drop still lands here first and then jumps again once the
   * caller's reactive update calls `draw()`; that second jump is one flush away and reads as
   * a single snap in practice. No separate tween either way. */
  endDrag(grid: Grid, size: number): void {
    this.dragging = false;
    this.scale.set(1);
    this.alpha = 1;
    this.zIndex = 0;
    if (this.model) this.place(this.model, grid, size);
  }

  /** Advances the move tween and the ring's pulse/flash animation. Called every tick; a
   * cheap no-op unless this token has one or the other running. */
  tick(): void {
    if (this.tween) {
      const t = Math.min(1, (performance.now() - this.tween.start) / MOVE_TWEEN_MS);
      const eased = 1 - (1 - t) ** 3; // ease-out cubic
      const { from, to } = this.tween;
      this.position.set(from.x + (to.x - from.x) * eased, from.y + (to.y - from.y) * eased);
      if (t >= 1) this.tween = null;
    }
    if (this.ringKind === 'active') this.ring.alpha = this.pulseAlpha();
    else if (this.ringKind === 'flash') this.ring.alpha = this.flashAlpha();
  }

  private place(model: TokenModel, grid: Grid, size: number): void {
    const cell = grid.parse(model.cell);
    const target = grid.center(cell, size);
    if (this.lastCell !== null && this.lastCell !== model.cell) {
      this.tween = { from: { x: this.x, y: this.y }, to: target, start: performance.now() };
    } else {
      this.position.set(target.x, target.y);
      this.tween = null;
    }
    this.lastCell = model.cell;
  }

  // The miniature's own base ellipse lands at y ≈ 0 (see ART_ANCHOR_Y), so the shadow sits
  // there: enough to stand the piece on the ground now that no disc does it.
  private drawShadow(size: number, theme: BoardTheme): void {
    this.shadow.clear().beginFill(theme.ink, 0.22).drawEllipse(0, size * 0.02, size * 0.27, size * 0.08).endFill();
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
            this.addChildAt(this.art, 1);
          } else {
            this.art.texture = texture;
          }
          this.layoutArt(size);
        })
        // proto: a missing texture leaves the coloured base disc as the placeholder; no error UI.
        .catch(() => {});
    }
    this.layoutArt(size);
  }

  private layoutArt(size: number): void {
    if (!this.art) return;
    const target = size * TOKEN_FOOTPRINT_RATIO;
    this.art.scale.set(target / Math.max(this.art.texture.width, 1));
  }

  private drawDecor(model: UnitTokenModel, size: number, theme: BoardTheme): void {
    const r = (size * TOKEN_FOOTPRINT_RATIO) / 2;
    this.decor.clear();

    const pip = size * 0.11;
    const step = size * 0.145;
    const startX = -r * 0.85;
    const woundY = size * 0.28;
    for (let i = 0; i < MAX_WOUNDS; i++) {
      const filled = i < model.wounds;
      this.decor
        .lineStyle(1, theme.rule, 1)
        .beginFill(filled ? theme.token.pipFilled : theme.token.pipEmpty, 1)
        .drawRect(startX + i * step - pip / 2, woundY - pip / 2, pip, pip)
        .endFill();
    }

    const disorderY = woundY + size * 0.15;
    const pipR = size * 0.05;
    for (let i = 0; i < model.quality; i++) {
      const filled = i < model.disorder;
      this.decor
        .lineStyle(1, theme.rule, 1)
        .beginFill(filled ? theme.token.pipFilled : theme.token.pipEmpty, 1)
        .drawCircle(startX + i * step, disorderY, pipR)
        .endFill();
    }

    if (model.engine) {
      const cx = -r * 0.72;
      const cy = -r * 0.72;
      const cs = size * 0.3;
      this.decor
        .lineStyle(1, theme.rule, 1)
        .beginFill(theme.token.badgeFill, 1)
        .drawRoundedRect(cx - cs / 2, cy - cs / 2, cs, cs, size * 0.04)
        .endFill();
    }
  }

  /** The side's flag, top right — the only thing on the piece that says whose it is, now that
   * the coloured disc is gone. A routed unit flies a colourless one. */
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
    this.flag.position.set(r * 0.88, -r * 0.88);
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

  private updateEngineChip(engineName: string | null, size: number): void {
    const path = engineName ? engineArtUrl(engineName) : null;
    if (!path) {
      if (this.engineChip) this.engineChip.visible = false;
      this.chipPath = null;
      return;
    }
    if (path !== this.chipPath) {
      this.chipPath = path;
      const generation = ++this.chipGeneration;
      PIXI.Assets.load<PIXI.Texture>(path)
        .then((texture) => {
          if (this.destroyed || generation !== this.chipGeneration) return;
          if (!this.engineChip) {
            this.engineChip = new PIXI.Sprite(texture);
            this.engineChip.anchor.set(0.5);
            this.addChild(this.engineChip);
          } else {
            this.engineChip.texture = texture;
          }
          this.layoutChip(size);
        })
        .catch(() => {});
    }
    if (this.engineChip) {
      this.engineChip.visible = true;
      this.layoutChip(size);
    }
  }

  private layoutChip(size: number): void {
    if (!this.engineChip) return;
    const r = (size * TOKEN_FOOTPRINT_RATIO) / 2;
    this.engineChip.scale.set((size * 0.24) / Math.max(this.engineChip.texture.width, 1));
    this.engineChip.position.set(-r * 0.72, -r * 0.72);
  }

  private drawRoutArrow(routed: boolean, side: Side, size: number, theme: BoardTheme): void {
    this.routArrow.visible = routed;
    this.routArrow.clear();
    if (!routed) return;
    // Board-local y grows toward the attacker's home edge (rank 0), on both grids — see
    // grid.ts's SquareGrid/HexGrid `center`. A routed unit retreats toward its own edge.
    const dir = side === 'attacker' ? 1 : -1;
    const r = (size * TOKEN_FOOTPRINT_RATIO) / 2;
    const x = r + size * 0.16;
    const half = size * 0.2 * dir;
    const width = size * 0.07;
    this.routArrow.lineStyle(size * 0.045, theme.ink, 0.9).moveTo(x, -half).lineTo(x, half);
    this.routArrow
      .beginFill(theme.ink, 0.9)
      .moveTo(x, half + size * 0.09 * dir)
      .lineTo(x - width, half)
      .lineTo(x + width, half)
      .closePath()
      .endFill();
  }

  private drawRing(kind: TokenRing | null, size: number, theme: BoardTheme): void {
    this.ringKind = kind;
    this.ring.clear();
    this.ring.visible = !!kind;
    if (!kind) { this.pulseStart = 0; return; }
    const r = (size * TOKEN_FOOTPRINT_RATIO) / 2 + size * RING_GAP;
    const colour = kind === 'active' ? theme.token.ringActive
      : kind === 'flash' ? theme.token.ringFlash
      : theme.token.ringSelected;
    const width = kind === 'selected' ? size * 0.06 : kind === 'flash' ? size * 0.07 : size * 0.045;
    this.ring.lineStyle(width, colour, 1).drawCircle(0, 0, r);
    if (kind === 'selected') {
      this.pulseStart = 0;
      this.ring.alpha = 1;
    } else {
      this.pulseStart ||= performance.now();
      this.ring.alpha = kind === 'active' ? this.pulseAlpha() : this.flashAlpha();
    }
  }

  private pulseAlpha(): number {
    const t = ((performance.now() - this.pulseStart) % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
    return 0.55 + 0.35 * Math.sin(t * Math.PI * 2);
  }

  /** A fast, hard blink — distinct from the slow `active` breathing pulse — for a free
   * strike's instant. The caller (Battle.svelte) owns the duration and clears `ring` itself;
   * this just animates for as long as `ring` stays `'flash'`. */
  private flashAlpha(): number {
    const t = ((performance.now() - this.pulseStart) % FLASH_PERIOD_MS) / FLASH_PERIOD_MS;
    return 0.35 + 0.65 * Math.abs(Math.sin(t * Math.PI * 2));
  }
}
