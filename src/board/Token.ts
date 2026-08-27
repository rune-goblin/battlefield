import * as PIXI from 'pixi.js';
import { MAX_WOUNDS, type Grid, type Point, type Role, type Side } from '../engine/index.js';
import { actionIconUrl, bannerTexture, engineArtUrl, troopArtUrl, type ActionIcon } from './art.js';
import type { BoardTheme } from './theme.js';

/** A ring is state, never chrome: the unit acting now, a free strike landing, or the piece a
 * placement stage has hold of. 'active' and 'selected' glow under the piece in its side's
 * colour — the flag's own; 'flash' is a stroke over the top, so a free strike still reads on
 * an already-lit piece. */
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
  /** The action prop riding on the piece: what is being aimed at it right now, or the shield
   * a guarding unit keeps until it acts again. */
  prop: ActionIcon | null;
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
/** How far the glow breathes either side of its footprint, as a fraction of it. */
const GLOW_SWELL = 0.06;
/** The flag's height, as a fraction of cell size. */
const FLAG_RATIO = 0.32;
/** The action prop's box, as a fraction of cell size. */
const PROP_RATIO = 0.3;
// The cloth's mass sits above the middle of the square template — it tapers to a point at the
// bottom — so the level rides a little high of the sprite's own centre.
const FLAG_TEXT_Y = -0.07;
const LIFT_SCALE = 1.08;
const GHOST_ALPHA = 0.26;
const PULSE_PERIOD_MS = 1400;
const FLASH_PERIOD_MS = 260;
const MOVE_TWEEN_MS = 200;
// A routed walk holds a steady pace per cell rather than stretching one tween over the whole
// distance, so a six-cell move reads as six steps; the cap keeps a long charge watchable.
const WALK_STEP_MS = 150;
const WALK_MAX_MS = 900;

interface Tween {
  points: Point[];
  /** Length of each leg, so a multi-leg walk holds one pace instead of speeding up on the
   * long legs and crawling on the short ones. */
  spans: number[];
  length: number;
  start: number;
  duration: number;
  walk: boolean;
}

function tweenOf(points: Point[], duration: number, walk: boolean): Tween {
  const spans: number[] = [];
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    const span = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    spans.push(span);
    length += span;
  }
  return { points, spans, length, start: performance.now(), duration, walk };
}

function along(points: Point[], spans: number[], distance: number): Point {
  let left = distance;
  for (let i = 0; i < spans.length; i += 1) {
    if (left > spans[i] && i < spans.length - 1) {
      left -= spans[i];
      continue;
    }
    const t = spans[i] > 0 ? Math.min(1, left / spans[i]) : 1;
    const a = points[i];
    const b = points[i + 1];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  return points[points.length - 1];
}

const easeInOut = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

const same = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;

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

  private propSprite: PIXI.Sprite | null = null;
  private propIcon: ActionIcon | null = null;
  private propGeneration = 0;

  private readonly routArrow = new PIXI.Graphics();
  private readonly ring = new PIXI.Graphics();
  private ringKind: TokenRing | null = null;
  private pulseStart = 0;

  // Wave 5: a battle move tweens from wherever the token is actually sitting (which may
  // itself be mid-tween from the previous move) to the new cell's centre. `lastCell` is null
  // until the first `place()`, so mounting never tweens in from the origin.
  private lastCell: string | null = null;
  private tween: Tween | null = null;
  private route: string[] | null = null;

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
      this.updateProp(model.prop, size);
    } else {
      this.decor.clear();
      this.badge?.destroy();
      this.badge = null;
      this.updateEngineChip(null, size);
      this.updateProp(null, size);
    }

    this.drawRoutArrow(routed, model.side, size, theme);
    this.drawRing(model.ring, model.side, size, theme);

    // Re-append: the art and the engine chip are attached lazily as their textures resolve,
    // which would otherwise draw them over the flag and the arrow/ring. addChild on an
    // existing child just moves it to the top, so this fixes the order regardless of load
    // order — flag under its own level, both under the arrow and ring.
    if (this.flag) this.addChild(this.flag);
    if (this.badge) this.addChild(this.badge);
    if (this.propSprite) this.addChild(this.propSprite);
    this.addChild(this.routArrow);
    if (model.ring === 'flash') this.addChild(this.ring);
    else this.addChildAt(this.ring, 0);
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

  /** The route this piece's next move follows, its own cell first. Spent by that move — see
   * `takeRoute`. */
  setRoute(cells: readonly string[]): void {
    this.route = cells.length > 1 ? [...cells] : null;
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
      const { points, spans, length, start, duration, walk } = this.tween;
      const t = Math.min(1, (performance.now() - start) / duration);
      const eased = walk ? easeInOut(t) : 1 - (1 - t) ** 3;
      const point = along(points, spans, eased * length);
      this.position.set(point.x, point.y);
      if (t >= 1) this.tween = null;
    }
    if (this.ringKind === 'flash') this.ring.alpha = this.flashAlpha();
    else if (this.ringKind) this.breathe();
  }

  private place(model: TokenModel, grid: Grid, size: number): void {
    const cell = grid.parse(model.cell);
    const target = grid.center(cell, size);
    const walk = this.takeRoute(model.cell, grid, size);
    if (walk) {
      this.tween = tweenOf(walk, Math.min(WALK_MAX_MS, WALK_STEP_MS * (walk.length - 1)), true);
    } else if (this.tween && same(this.tween.points[this.tween.points.length - 1], target)) {
      // A redraw that does not move the piece (a prop, a ring, the log) must not cut a tween
      // already running to this same cell short.
    } else if (this.lastCell !== null && this.lastCell !== model.cell) {
      this.tween = tweenOf([{ x: this.x, y: this.y }, target], MOVE_TWEEN_MS, false);
    } else {
      this.position.set(target.x, target.y);
      this.tween = null;
    }
    this.lastCell = model.cell;
  }

  /** The waypoints of the queued route, from where the piece actually stands to `cell`, or
   * null when no route explains this move. The route is spent either way: it describes one
   * move, and a second move must not replay it. A route is trimmed at `cell` rather than
   * required to end there, so a push that fails and stops at its fallback still walks the
   * part of the route it covered. */
  private takeRoute(cell: string, grid: Grid, size: number): Point[] | null {
    const route = this.route;
    // A redraw that does not move the piece leaves the route queued: it is spent by the move
    // it describes, not by whatever else happens to redraw first.
    if (!route || cell === this.lastCell) return null;
    this.route = null;
    if (route[0] !== this.lastCell) return null;
    const end = route.indexOf(cell);
    if (end < 1) return null;
    return [{ x: this.x, y: this.y }, ...route.slice(1, end + 1).map((k) => grid.center(grid.parse(k), size))];
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

  /** Bottom right, clear of the flag, the engine chip and the pip rows. */
  private updateProp(icon: ActionIcon | null, size: number): void {
    if (!icon) {
      if (this.propSprite) this.propSprite.visible = false;
      this.propIcon = null;
      return;
    }
    if (icon !== this.propIcon) {
      this.propIcon = icon;
      const generation = ++this.propGeneration;
      PIXI.Assets.load<PIXI.Texture>(actionIconUrl(icon))
        .then((texture) => {
          if (this.destroyed || generation !== this.propGeneration) return;
          if (!this.propSprite) {
            this.propSprite = new PIXI.Sprite(texture);
            this.propSprite.anchor.set(0.5);
            this.addChild(this.propSprite);
          } else {
            this.propSprite.texture = texture;
          }
          this.layoutProp(size);
        })
        .catch(() => {});
    }
    if (this.propSprite) {
      this.propSprite.visible = true;
      this.layoutProp(size);
    }
  }

  private layoutProp(size: number): void {
    if (!this.propSprite) return;
    const r = (size * TOKEN_FOOTPRINT_RATIO) / 2;
    const { width, height } = this.propSprite.texture;
    this.propSprite.scale.set((size * PROP_RATIO) / Math.max(width, height, 1));
    this.propSprite.position.set(r * 0.88, r * 0.62);
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

  private drawRing(kind: TokenRing | null, side: Side, size: number, theme: BoardTheme): void {
    this.ringKind = kind;
    this.ring.clear();
    this.ring.visible = !!kind;
    this.ring.scale.set(1);
    if (!kind) { this.pulseStart = 0; return; }
    this.pulseStart ||= performance.now();
    const r = (size * TOKEN_FOOTPRINT_RATIO) / 2 + size * RING_GAP;
    if (kind === 'flash') {
      this.ring.lineStyle(size * 0.07, theme.token.ringFlash, 1).drawCircle(0, 0, r);
      this.ring.alpha = this.flashAlpha();
      return;
    }
    const colour = side === 'attacker' ? theme.attacker : theme.defender;
    this.ring.beginFill(colour, 1).drawCircle(0, 0, r).endFill();
    this.breathe();
  }

  /** The glow swells and brightens together, so the piece in hand reads as breathing rather
   * than blinking. */
  private breathe(): void {
    const t = ((performance.now() - this.pulseStart) % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
    const phase = Math.sin(t * Math.PI * 2);
    this.ring.alpha = 0.5 + 0.25 * phase;
    this.ring.scale.set(1 + GLOW_SWELL * phase);
  }

  /** A fast, hard blink — distinct from the slow `active` breathing pulse — for a free
   * strike's instant. The caller (Battle.svelte) owns the duration and clears `ring` itself;
   * this just animates for as long as `ring` stays `'flash'`. */
  private flashAlpha(): number {
    const t = ((performance.now() - this.pulseStart) % FLASH_PERIOD_MS) / FLASH_PERIOD_MS;
    return 0.35 + 0.65 * Math.abs(Math.sin(t * Math.PI * 2));
  }
}
