import * as PIXI from 'pixi.js';
import { STATUSES, type Grid, type Point, type Status } from '../../engine/index.js';
import { assetUrl } from '../asset-base.js';
import type { StatusIcon } from '../art.js';
import { easeOutBack, easeOutCubic } from '../easing.js';
import { STATUS_INTRO } from '../token/geometry.js';
import type { BoardLayer, LayerContext } from './BoardLayer.js';

export type CombatTextTone = 'good' | 'bad' | 'warn';
/** A bar's icon follows its number; any other leads its word. A status icon hands the word to
 * the token's own slot, and a `dead` icon to the mark the piece leaves on the ground. */
export type CombatTextIcon = 'wounds' | 'morale' | 'routed' | 'dead' | Status;

export interface CombatTextPart {
  text: string;
  tone: CombatTextTone;
  icon?: CombatTextIcon;
  /** Drawn larger: the one word that settles the whole action. */
  loud?: boolean;
}

const BARS = ['wounds', 'morale'] as const;
const ICONS = [...BARS, 'routed', 'dead', ...STATUSES] as const satisfies readonly CombatTextIcon[];
const isBar = (icon: CombatTextIcon | undefined): boolean => BARS.some((bar) => bar === icon);
// A part that names a status is played by the token's own slot, and the word becomes its caption.
const conditionOf = (part: CombatTextPart): StatusIcon | null => STATUSES.find((status) => status === part.icon) ?? null;

export interface BoardCombatText {
  /** The piece the word rides; it follows a piece that is still walking. */
  token: string;
  /** Where the word stands when the board no longer holds that piece. */
  cell: string;
  /** Shown side by side: one word, or every bar a blow moved. */
  parts: CombatTextPart[];
}

export interface CombatTextLayerOptions {
  positionOf(token: string): Point | null;
  /** Words wait for the pieces to stop, so a charge reads its result where it ends. */
  moving(): boolean;
  /** A condition is shown by the token's own icon, large over the piece and then down into its
   * slot. The token holds the icon back until `announce`, which is false when the piece has
   * no such icon to play. */
  expect(token: string, icons: StatusIcon[]): void;
  announce(token: string, icons: StatusIcon[]): boolean;
  /** A death is played the same way by the mark it leaves on the ground. */
  expectFallen(token: string): void;
  announceFallen(token: string): boolean;
}

const FONT = 'Carter One';
const FILL: Record<CombatTextTone, [string, string]> = {
  good: ['#1ac300', '#3cff00'],
  bad: ['#c30000', '#ff0000'],
  warn: ['#f47a00', '#ffff00'],
};

// The text is drawn once at this size and scaled to the screen size wanted.
const DRAWN_PX = 64;
const SCREEN_PX = { min: 22, max: 44, perCell: 0.5 };
const LEAD_MS = 250;
// Words overlap in time: each outlives the arrival of the next two. A long run, a Blast across
// a line and every save it forces, closes up so the board is not held for ten seconds.
const STAGGER_MS = 1000;
const CROWDED_STAGGER_MS = 500;
const CROWDED = 4;
const LIFE_MS = 3500;
const POP_MS = 250;
// What a blow cost arrives under the word that caused it, slower to swell.
const EFFECT_POP_MS = 400;
const EFFECT_SCALE = 1;
const LOUD_SCALE = 1.25;
// A word that grows from a point, fully opaque, reads as a flash: it swells from this size and fades in.
const POP_FROM = 0.6;
const FADE_IN_MS = 120;
const FADE_MS = 500;
const FADE_TO = 0.6;
// The first word over a piece climbs this far and every later one settles as a line beneath it.
const RISE_CELLS = 0.35;
// Eased out and short, so a word is near its line before the next pops under it, crowded or not.
const RISE_MS = 1200;
const LIFT_MS = 80;
// The text box carries its descent and outline, so lines close up by this much.
const LINE = 0.5;

let fontLoad: Promise<void> | null = null;

function loadFont(): void {
  if (typeof FontFace === 'undefined') return;
  fontLoad ??= new FontFace(FONT, `url(${assetUrl('fonts/carter-one/carter-one.woff2')})`).load().then((face) => {
    document.fonts.add(face);
    // PIXI caches metrics per font string, and any measured before the face arrived are the fallback's.
    PIXI.TextMetrics.clearMetrics();
  }, () => { fontLoad = null; });
}

function styleFor(tone: CombatTextTone): PIXI.TextStyle {
  return new PIXI.TextStyle({
    fontFamily: `"${FONT}", Signika, sans-serif`,
    fontSize: DRAWN_PX,
    fill: FILL[tone],
    fillGradientType: PIXI.TEXT_GRADIENT.LINEAR_VERTICAL,
    fillGradientStops: [0.25, 0.85],
    stroke: '#000000',
    strokeThickness: 8,
    lineJoin: 'round',
    dropShadow: true,
    dropShadowColor: '#000000',
    dropShadowAlpha: 0.45,
    dropShadowBlur: 6,
    dropShadowDistance: 3,
    padding: 16,
  });
}

const ICON_PX = DRAWN_PX * 0.8;
// The Health heart and Morale banner carry the meaning of a bare number, so they outsize it.
const BAR_ICON_PX = DRAWN_PX * 1.3;
const ICON_GAP = DRAWN_PX * 0.12;

const icons = new Map<CombatTextIcon, PIXI.Texture>();
let iconLoad: Promise<void> | null = null;

// One fetch for the lifetime of the page. A line that lands mid-load shows its words alone.
function loadIcons(): void {
  iconLoad ??= Promise.all(ICONS.map(async (name) => {
    icons.set(name, await PIXI.Assets.load<PIXI.Texture>(assetUrl(`art/condition-icons/${name}.webp`)));
  })).then(() => undefined, () => { iconLoad = null; });
}

// Stands on the baseline: the text box ends below it by its descent and its outline.
function iconFor(icon: CombatTextIcon, x: number): PIXI.Sprite | null {
  const texture = icons.get(icon);
  if (!texture) return null;
  const sprite = new PIXI.Sprite(texture);
  const bar = isBar(icon);
  sprite.anchor.set(0, bar ? 0.5 : 1);
  sprite.scale.set((bar ? BAR_ICON_PX : ICON_PX) / Math.max(texture.width, texture.height));
  // A bar icon centres on the glyphs, which sit above the baseline by their own height.
  sprite.position.set(x, bar ? -DRAWN_PX * 0.62 : -DRAWN_PX * 0.26);
  return sprite;
}

const PART_GAP = DRAWN_PX * 0.45;

function build(line: BoardCombatText, bare = false): PIXI.Container {
  const body = new PIXI.Container();
  let x = 0;
  for (const part of line.parts) {
    if (x) x += PART_GAP;
    const leads = !bare && part.icon && !isBar(part.icon) ? iconFor(part.icon, x) : null;
    if (leads) { body.addChild(leads); x += leads.width + ICON_GAP; }
    const text = new PIXI.Text(part.text, styleFor(part.tone));
    text.resolution = 2;
    text.anchor.set(0, 1);
    text.x = x;
    body.addChild(text);
    x += text.width;
    const follows = isBar(part.icon) ? iconFor(part.icon!, x + ICON_GAP) : null;
    if (follows) { body.addChild(follows); x += ICON_GAP + follows.width; }
  }
  body.pivot.x = x / 2;
  return body;
}

const isEffect = (line: BoardCombatText): boolean => line.parts.every((part) => isBar(part.icon));
const conditionsOf = (line: BoardCombatText): StatusIcon[] | null => {
  const icons = line.parts.map(conditionOf);
  return icons.every((icon): icon is StatusIcon => icon !== null) ? icons : null;
};
const isDeath = (line: BoardCombatText): boolean => line.parts.length === 1 && line.parts[0].icon === 'dead';
const CAPTION_SCALE = 0.7;

interface Live {
  line: BoardCombatText;
  text: PIXI.Container | null;
  /** Negative while the word waits its turn. */
  elapsed: number;
  scale: number;
  /** World units above the base where the word settles: its line in the stack over the piece. */
  lift: number;
  lifted: number;
  /** Set when the token plays the icon: the word stands under the piece for this long and
   * fades as the last icon settles. */
  caption: number | null;
}

/** The word a roll came to, popped over the piece it landed on, then lifted and faded. The words
 * of a commit take turns in the order they happened, whichever pieces they land on. */
export class CombatTextLayer implements BoardLayer {
  private readonly container: PIXI.Container;
  private readonly viewport: PIXI.Container;
  private readonly ticker: PIXI.Ticker;
  private readonly opts: CombatTextLayerOptions;
  private grid: Grid | null = null;
  private size = 0;
  private live: Live[] = [];

  private readonly tick = (): void => {
    if (!this.live.length) return;
    const dt = this.ticker.deltaMS;
    const held = this.opts.moving();
    for (const entry of [...this.live]) {
      if (!entry.text && held) continue;
      entry.elapsed += dt;
      if (entry.elapsed < 0) continue;
      if (entry.elapsed >= (entry.caption ?? LIFE_MS)) { this.remove(entry); continue; }
      this.draw(entry);
    }
  };

  constructor(container: PIXI.Container, viewport: PIXI.Container, ticker: PIXI.Ticker, opts: CombatTextLayerOptions) {
    this.container = container;
    this.viewport = viewport;
    this.ticker = ticker;
    this.opts = opts;
    this.ticker.add(this.tick);
    loadFont();
    loadIcons();
  }

  setGeometry(context: LayerContext | null): void {
    this.grid = context?.grid ?? null;
    this.size = context?.size ?? 0;
    if (!context) this.clear();
  }

  /** How long until the last word is gone, counting the ones still waiting their turn. */
  remainingMs(): number {
    return Math.max(0, ...this.live.map((entry) => (entry.caption ?? LIFE_MS) - entry.elapsed));
  }

  show(line: BoardCombatText): void {
    if (!this.grid || !this.size) return;
    const waiting = this.live.filter((entry) => !entry.text);
    const latest = Math.min(...this.live.map((entry) => entry.elapsed));
    const stagger = waiting.length >= CROWDED ? CROWDED_STAGGER_MS : STAGGER_MS;
    this.live.push({ line, text: null, elapsed: Math.min(-LEAD_MS, latest - stagger), scale: 1, lift: 0, lifted: 0, caption: null });
    const conditions = conditionsOf(line);
    if (conditions) this.opts.expect(line.token, conditions);
    if (isDeath(line)) this.opts.expectFallen(line.token);
  }

  private draw(entry: Live): void {
    if (!entry.text) {
      const conditions = conditionsOf(entry.line);
      if (conditions && this.opts.announce(entry.line.token, conditions)) {
        const { fadeMs, holdMs, settleMs } = STATUS_INTRO;
        entry.caption = conditions.length * (fadeMs + holdMs) + settleMs;
      }
      if (isDeath(entry.line) && this.opts.announceFallen(entry.line.token)) {
        entry.caption = STATUS_INTRO.fadeMs + STATUS_INTRO.holdMs + STATUS_INTRO.settleMs;
      }
      entry.text = build(entry.line, entry.caption !== null);
      const zoom = this.viewport.scale.x || 1;
      const screenPx = Math.min(SCREEN_PX.max, Math.max(SCREEN_PX.min, this.size * zoom * SCREEN_PX.perCell));
      const emphasis = entry.caption !== null ? CAPTION_SCALE : isEffect(entry.line) ? EFFECT_SCALE : entry.line.parts.some((part) => part.loud) ? LOUD_SCALE : 1;
      entry.scale = emphasis * screenPx / (DRAWN_PX * zoom);
      this.container.addChild(entry.text);
      if (entry.caption === null) {
        const stack = this.live.filter((older) => older !== entry && older.text && older.caption === null && older.line.token === entry.line.token);
        const line = stack.length ? Math.min(...stack.map((older) => older.lift)) - entry.text.height * entry.scale * LINE : this.size * RISE_CELLS;
        // A stack too deep for the gap climbs as a whole, so no line drops onto the piece.
        if (line < 0) for (const older of stack) older.lift -= line;
        entry.lift = entry.lifted = Math.max(0, line);
      }
    }
    const t = entry.elapsed;
    entry.lifted += (entry.lift - entry.lifted) * Math.min(1, this.ticker.deltaMS / LIFT_MS);
    const at = this.opts.positionOf(entry.line.token) ?? this.grid!.center(this.grid!.parse(entry.line.cell), this.size);
    if (entry.caption !== null) {
      const { fadeMs, settleMs } = STATUS_INTRO;
      entry.text.position.set(at.x, at.y + this.size * 0.5 + entry.text.height * entry.scale);
      entry.text.scale.set(entry.scale);
      entry.text.alpha = Math.min(1, t / fadeMs, Math.max(0, (entry.caption - t) / settleMs));
      return;
    }
    const rise = entry.lifted * easeOutCubic(Math.min(1, t / RISE_MS));
    const fade = Math.max(0, (t - (LIFE_MS - FADE_MS)) / FADE_MS);
    const pop = isEffect(entry.line) ? EFFECT_POP_MS : POP_MS;
    entry.text.position.set(at.x, at.y - this.size * 0.3 - rise);
    const swell = t < pop ? POP_FROM + (1 - POP_FROM) * easeOutBack(t / pop) : 1 - (1 - FADE_TO) * fade ** 2;
    entry.text.scale.set(entry.scale * swell);
    entry.text.alpha = fade ? 1 - fade : Math.min(1, t / FADE_IN_MS);
  }

  private remove(entry: Live): void {
    entry.text?.destroy({ children: true });
    this.live.splice(this.live.indexOf(entry), 1);
  }

  clear(): void {
    for (const entry of [...this.live]) this.remove(entry);
  }

  destroy(): void {
    this.ticker.remove(this.tick);
    this.clear();
  }
}
