import * as PIXI from 'pixi.js';
import { MAX_WOUNDS, type Grid, type Point, type Role, type Side } from '../engine/index.js';
import { ART_ANCHOR_Y, actionIconUrl, bannerTexture, engineArtUrl, troopArtUrl, type ActionIcon } from './art.js';
import { LIFTED_SHADOW, PIECE_LIGHT, SHADOW_CONTACT, castMatrix, silhouetteTexture } from './piece-shadow.js';
import type { BoardTheme } from './theme.js';
import type { TokenReaction } from './vfx/Effect.js';

/** A ring is state, never chrome: the unit acting now, a free strike landing, or the piece a
 * placement stage has hold of. 'active' and 'selected' glow under the piece in its side's
 * colour — the flag's own; 'flash' is a stroke over the top, so a free strike still reads on
 * an already-lit piece. */
export type TokenRing = 'active' | 'selected' | 'flash';

/** Selection-stage emphasis, drawn as the piece's own scale: 'ready' breathes to say this
 * unit can still be picked to activate, 'spent' sits small and still because its turn has
 * gone. Both end the moment the activation locks. */
export type TokenPick = 'ready' | 'spent';

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
  pick: TokenPick | null;
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

/** The piece's footprint, as a fraction of cell size: how wide the miniature draws and where
 * the markers hang off it. Clicks are answered by the hex, not the footprint — see `hit.ts`. */
export const TOKEN_FOOTPRINT_RATIO = 0.82;

// A pointy-top hex is only ~0.577 of a pitch tall above its centre, and a piece drawn to the
// full footprint width overshoots that; dropping the miniature (and the ground it stands on)
// keeps its head inside its own cell.
const ART_DROP = 0.1;
// The ring traces the piece's footprint — which is also its hit area — now that there is no
// disc for it to sit outside of. Any wider and it cuts through the flag's level.
const RING_GAP = 0.01;
/** How far the glow breathes either side of its footprint, as a fraction of it. */
const GLOW_SWELL = 0.06;
/** The flag's height, as a fraction of cell size. */
const FLAG_RATIO = 0.32;
/** The action prop's box, as a fraction of cell size. The shot's bullseye is the exception in
 * both size and place: it rides the middle of the cell at better than half a hex, because it
 * is what the arc's head is aimed at rather than a badge hung off the piece. */
const PROP_RATIO = 0.3;
const SHOT_PROP_RATIO = 0.9;
// The cloth's mass sits above the middle of the square template — it tapers to a point at the
// bottom — so the level rides a little high of the sprite's own centre.
const FLAG_TEXT_Y = -0.07;
const LIFT_SCALE = 1.08;
const GHOST_ALPHA = 0.26;
const PULSE_PERIOD_MS = 1400;
/** The selection breath: slower than the ring's glow, so the two read as separate signals. */
const PICK_PERIOD_MS = 1800;
const PICK_SWELL = 0.07;
const SPENT_SCALE = 0.8;
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

  private pick: TokenPick | null = null;
  private pickStart = 0;
  private pickScale = 1;
  private reactScale = { x: 1, y: 1 };

  private size = 0;
  private broken = false;
  private reaction: { spec: TokenReaction; start: number } | null = null;
  private flashFilter: PIXI.ColorMatrixFilter | null = null;

  // Wave 5: a battle move tweens from wherever the token is actually sitting (which may
  // itself be mid-tween from the previous move) to the new cell's centre. `lastCell` is null
  // until the first `place()`, so mounting never tweens in from the origin.
  private lastCell: string | null = null;
  private tween: Tween | null = null;
  private route: string[] | null = null;

  constructor(id: string) {
    super();
    this.id = id;
    this.addChild(this.decor, this.routArrow, this.ring);
    this.cast.transform.setFromMatrix(castMatrix(PIECE_LIGHT));
    this.shadow.addChild(this.contact, this.cast);
    this.routArrow.visible = false;
    this.ring.visible = false;
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
    const disorder = model.kind === 'unit' ? model.disorder : 0;
    const broken = model.kind === 'unit' && wounds >= MAX_WOUNDS - 1;
    const shaken = model.kind === 'unit' && disorder >= model.quality;
    const routed = model.kind === 'unit' && disorder > model.quality;

    this.drawContact(size);
    this.updateArt(model, size);
    this.size = size;
    this.broken = broken;
    this.applyFilters();
    this.updateFlag(model.side, size, theme, shaken);

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

    this.setPick(model.kind === 'unit' ? model.pick : null);
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
    this.applyScale();
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
    if (this.broken) list.push(DESATURATE);
    if (this.reaction?.spec.flash && this.flashFilter) list.push(this.flashFilter);
    this.filters = list.length ? list : null;
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
        .catch(() => {});
    }
    this.layoutArt(size);
  }

  // The silhouette is baked narrower than the art, so each is scaled to the footprint from
  // its own width; both hinge on the anchor row, dropped together.
  private layoutArt(size: number): void {
    const target = size * TOKEN_FOOTPRINT_RATIO;
    if (this.art) {
      this.art.scale.set(target / Math.max(this.art.texture.width, 1));
      this.art.position.set(0, size * ART_DROP);
    }
    if (this.silhouette) this.silhouette.scale.set(target / Math.max(this.silhouette.texture.width, 1));
    this.cast.position.set(0, size * ART_DROP);
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
   * the coloured disc is gone. A shaken unit flies a colourless one, and the arrow that comes
   * with the rout is what separates the two bands on the board. */
  private updateFlag(side: Side, size: number, theme: BoardTheme, shaken: boolean): void {
    const colour = shaken ? theme.token.routed : side === 'attacker' ? theme.attacker : theme.defender;
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

  /** Bottom right, clear of the flag, the engine chip and the pip rows — except the shot's
   * bullseye, which the arc's head has to be able to point at. */
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
    const shot = this.propIcon === 'shoot';
    this.propSprite.scale.set((size * (shot ? SHOT_PROP_RATIO : PROP_RATIO)) / Math.max(width, height, 1));
    if (shot) this.propSprite.position.set(0, 0);
    else this.propSprite.position.set(r * 0.88, r * 0.62);
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
