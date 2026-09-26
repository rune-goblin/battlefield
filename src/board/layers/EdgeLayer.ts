import * as PIXI from 'pixi.js';
import { wallsFor, at, barrierBetween, gridOf, parse, seededRandom, type Board, type Point, type Random, type Wall } from '../../engine/index.js';
import type { BoardTheme } from '../theme.js';
import { mix, shade } from './color.js';
import { GATE_HALF_OPENING, gateHandles, gateLeaves } from '../gate-geometry.js';

// The wall is a map symbol, not a picture of masonry: a thin spine along the edge with square
// merlons straddling it. Its width never changes — a wall is a wall from any side of any hex —
// so damage is drawn as merlons knocked off the run rather than as a thinner band.
const MERLON = 0.055;      // battlement block, as a fraction of the cell pitch
const SPINE = 0.018;       // the wall between two blocks, likewise
const STROKE = 0.0037;     // the line every edge is drawn with, as a fraction of the cell pitch
const LEAN = 0.9;          // how far a battered block may turn, in radians either way
// How far a knocked-about block's corners are pulled off true, as a fraction of its size, and
// how much of its size it may have lost. A block is cut stone until something hits it.
const CHIP = { battered: 0.13, broken: 0.19 };
const WEAR = { battered: [0.85, 0.2], broken: [0.7, 0.45] } as const;
// Three states and no grades between them: a wall is whole, battered, or down. An intact run is
// two corner blocks on its vertices with four more spaced between; battered loses one of the
// four and shakes the rest; broken loses the spine and the corners with it.
const INTERIOR = 4;
const BATTERED_LOSS = 1;
const BREACH_BLOCKS = 3;
// The shadow a wall sits in, as fractions of the cell pitch: the silhouette grown by `spread`
// on every side, then blurred, so it darkens the ground evenly all round the bar. It takes no
// direction — the light is in the terrain's own shadows, and a wall reads as a wall from any
// side. One filter for every wall on the board: a filter per bar would be a render pass per bar.
// Both numbers are small against the spine (0.018): grown and blurred by more than that, the
// spine's own shadow swells past the blocks and the run reads as one solid bar again.
// The weight is the palette's — see `EdgePalette.shadowAlpha`.
const SHADOW = { spread: 0.007, blur: 0.011 };
let shadowBlur: PIXI.BlurFilter | null = null;
function wallBlur(strength: number): PIXI.BlurFilter {
  shadowBlur ??= new PIXI.BlurFilter(strength);
  shadowBlur.blur = strength;
  return shadowBlur;
}
const merlonSize = (size: number) => Math.max(2, size * MERLON);
const spineWidth = (size: number) => Math.max(1, size * SPINE);
const jointWidth = (size: number) => Math.max(0.6, size * STROKE);
/** A block of the wall, in the bar's own local space. A block that has been knocked about
 * carries an angle and a `chip` — two offsets per corner, in fractions of its size, so a
 * damaged block is a broken quad rather than a tilted square. */
interface Block { cx: number; cy: number; size: number; angle: number; chip: number[] }
interface Box { x: number; y: number; w: number; h: number }
/** The spine is null once the wall is down: a breach is loose blocks with nothing joining them. */
interface WallShapes { spine: Box | null; blocks: Block[] }
interface Stub { bar: number; dir: Point; half: number }

function blockPoly({ cx, cy, size, angle, chip }: Block): number[] {
  const h = size / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const points: number[] = [];
  [[-h, -h], [h, -h], [h, h], [-h, h]].forEach(([dx, dy], i) => {
    const x = dx + (chip[i * 2] ?? 0) * size;
    const y = dy + (chip[i * 2 + 1] ?? 0) * size;
    points.push(cx + x * cos - y * sin, cy + x * sin + y * cos);
  });
  return points;
}

// Which way is inward for each corner of `blockPoly`, in its order.
const INWARD = [[1, 1], [-1, 1], [-1, -1], [1, -1]];

/** Eight offsets, one per corner coordinate, every one pulled toward the block's middle: a
 * struck block loses corners, it does not grow them. */
function chipped(rnd: Random, amount: number): number[] {
  return INWARD.flatMap(([sx, sy]) => [rnd() * amount * sx, rnd() * amount * sy]);
}

const vertexKey = (p: Point) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

/** How far past the shared vertex a bar must run for its spine to land on its neighbour's — the
 * mitre of a stroke join, with `dir` pointing away from the vertex along each bar. The merlon
 * standing on the vertex covers the joint; the mitre is only there so the spine is unbroken. */
function mitre(mine: Stub, other: Stub): number {
  const width = Math.min(mine.half, other.half);
  const dot = Math.max(-1, Math.min(1, mine.dir.x * other.dir.x + mine.dir.y * other.dir.y));
  const t = Math.tan(Math.acos(dot) / 2);
  // Two bars leaving the vertex the same way have no mitre point; the clamp is what a stroke
  // join's mitre limit is, and stops a sharp turn growing a spike.
  return t < 1e-3 ? width * 2.5 : Math.min(width / t, width * 2.5);
}

function perpendicular(a: Point, b: Point): { px: number; py: number; len: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { px: -dy / len, py: dx / len, len };
}

/** What the illustrated map lends its edges: the pencil the rest of the map is drawn with, and
 * the paper it is drawn on. Absent on the textured map, which takes its edges from the theme. */
export interface InkEdges { pencil: number; paper: number }

/** `lineWeight` and `shadowAlpha` are the only things the two maps draw a wall differently by:
 * the same symbol in the same states, pressed harder onto a textured ground than onto paper. */
interface EdgePalette {
  stone: number; joint: number; rubble: number; rock: number;
  shadow: number; shadowAlpha: number; lineWeight: number; outline: number | null;
}

/** The textured map builds its stone out of the theme's ink, which is near-black. On paper that
 * reads as a bar of tar laid over a pencil drawing, so the illustrated map mixes its stone and
 * rubble out of the page instead and takes an outline for the rock. */
function edgePalette(theme: BoardTheme, ink: InkEdges | null): EdgePalette {
  if (!ink) {
    return {
      stone: mix(theme.rule, theme.ink, 0.38),
      joint: shade(theme.ink, 0.42),
      rubble: shade(mix(theme.rule, theme.ink, 0.38), 0.82),
      rock: shade(theme.ink, 0.55),
      // Dark in either theme: the light theme's ink is near-black already, and the dark theme's
      // is near-white, so a shadow has to be taken down rather than used as it stands.
      shadow: shade(theme.ink, 0.2),
      // Terrain art is busy where paper is quiet, so the line and the shadow both press harder
      // to hold the wall against it.
      shadowAlpha: 0.22,
      lineWeight: 1.6,
      outline: null,
    };
  }
  // The cliff's outline is the wall's own joint, so a cliff and a wall meeting at a vertex are
  // drawn in the same ink rather than the rock reading as the heavier of the two.
  const joint = mix(ink.paper, ink.pencil, 0.46);
  return {
    stone: mix(ink.paper, ink.pencil, 0.24),
    joint,
    rubble: mix(ink.paper, ink.pencil, 0.3),
    rock: mix(ink.paper, ink.pencil, 0.26),
    shadow: ink.pencil,
    shadowAlpha: 0.1,
    lineWeight: 1,
    outline: joint,
  };
}

const stroke = (g: PIXI.Graphics, colours: EdgePalette, colour: number, size: number) =>
  g.lineStyle({ width: jointWidth(size) * colours.lineWeight, color: colour, alignment: 0.5, join: PIXI.LINE_JOIN.ROUND });

/** A stable number per wall, so the blocks a battered run has lost — and the lean of the ones
 * left standing — survive a redraw, a resize and a change of map style. */
function seedOf(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The wall's shapes in its own local space, the bar's centre at the origin. `span` is the edge
 * itself and `len` the bar with its mitres, so the blocks are laid along the edge and the two
 * corner blocks sit on its vertices while the spine runs on through the corner.
 *
 * A battered run drops one interior block and respaces the rest, so the loss reads as a thinner
 * garrison of blocks rather than as a gap where one used to be. The blocks standing on the two
 * vertices are not here: a vertex is shared, so its tower is drawn once for the vertex rather
 * than once by each wall that reaches it — see `cornerBlock`. */
function battlement(len: number, span: number, shift: number, size: number, wall: Wall, rnd: Random): WallShapes {
  const block = merlonSize(size);
  const battered = wall.boxes > 0 && wall.remaining < wall.boxes;
  const interior = INTERIOR - (battered ? BATTERED_LOSS : 0);
  const blocks: Block[] = [];
  const [floor, spread] = WEAR.battered;
  for (let i = 1; i <= interior; i++) {
    blocks.push({
      cx: shift - span / 2 + (i / (interior + 1)) * span,
      cy: 0,
      size: battered ? block * (floor + rnd() * spread) : block,
      angle: battered ? (rnd() - 0.5) * LEAN : 0,
      chip: battered ? chipped(rnd, CHIP.battered) : [],
    });
  }
  const spine = spineWidth(size);
  return { spine: { x: -len / 2, y: -spine / 2, w: len, h: spine }, blocks };
}

/** The tower on a vertex: the bisector of the walls leaving it, so a corner sits even between
 * its two rather than square to one of them, and the two bottom edges of a hex meeting at the
 * bottom vertex leave their tower upright. */
function cornerAngle(stubs: Stub[]): number {
  let x = 0;
  let y = 0;
  for (const stub of stubs) { x += stub.dir.x; y += stub.dir.y; }
  // Two walls running straight through, or three at even angles, cancel: the tower then takes
  // the line of one of them.
  if (Math.hypot(x, y) < 1e-6) return Math.atan2(stubs[0].dir.y, stubs[0].dir.x);
  return Math.atan2(y, x);
}

/** Cut stone, whatever has happened to the runs it ends: a tower is what finishes a wall, and
 * one knocked about would read as a wall cut off rather than as a wall damaged. */
function cornerBlock(at: Point, stubs: Stub[], size: number): WallShapes {
  return { spine: null, blocks: [{ cx: at.x, cy: at.y, size: merlonSize(size), angle: cornerAngle(stubs), chip: [] }] };
}

/** A breach is three of the wall's blocks lying where they fell, within a block's height of the
 * line the wall stood on. No spine, and no corner blocks — with the run gone they would be
 * orphaned, standing on a vertex with nothing to stand at the end of. */
function breach(len: number, size: number, rnd: Random): WallShapes {
  const block = merlonSize(size);
  const blocks: Block[] = [];
  const [floor, spread] = WEAR.broken;
  for (let i = 0; i < BREACH_BLOCKS; i++) {
    blocks.push({
      cx: ((i + 0.5) / BREACH_BLOCKS - 0.5) * len + (rnd() - 0.5) * block,
      cy: (rnd() * 2 - 1) * block,
      size: block * (floor + rnd() * spread),
      angle: rnd() * Math.PI,
      chip: chipped(rnd, CHIP.broken),
    });
  }
  return { spine: null, blocks };
}

/** The spine first, then every block over it: each block is opaque, so the spine's own line
 * stops where a block stands on it and the run reads as one drawn object. */
function drawWall(g: PIXI.Graphics, shapes: WallShapes, colours: EdgePalette, size: number, breached: boolean): void {
  stroke(g, colours, colours.joint, size);
  const fill = breached ? colours.rubble : colours.stone;
  if (shapes.spine) {
    const { x, y, w, h } = shapes.spine;
    g.beginFill(colours.stone, 1).drawRect(x, y, w, h).endFill();
  }
  for (const block of shapes.blocks) g.beginFill(fill, 1).drawPolygon(blockPoly(block)).endFill();
  g.lineStyle(0);
}

/** The bar's silhouette, grown by `spread` on every side, for the layer's one blurred pass.
 * The stroke rides the outline, so half of its width is what reaches past the shape. */
function drawSilhouette(g: PIXI.Graphics, shapes: WallShapes, colour: number, spread: number): void {
  g.lineStyle({ width: spread * 2, color: colour, alignment: 0.5, join: PIXI.LINE_JOIN.ROUND });
  g.beginFill(colour, 1);
  if (shapes.spine) g.drawRect(shapes.spine.x, shapes.spine.y, shapes.spine.w, shapes.spine.h);
  for (const block of shapes.blocks) g.drawPolygon(blockPoly(block));
  g.endFill();
  g.lineStyle(0);
}

/** A wall's own Graphics, laid out along its edge in local space and rotated onto the board,
 * and the shadow under it — the same shapes and the same place, grown and left to the layer's blur. */
function wallGraphics(a: Point, b: Point, size: number, wall: Wall, key: string, colours: EdgePalette, ends: [number, number]): { bar: PIXI.Graphics; shadow: PIXI.Graphics } {
  const span = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / span;
  const uy = (b.y - a.y) / span;
  const p = { x: a.x - ux * ends[0], y: a.y - uy * ends[0] };
  const q = { x: b.x + ux * ends[1], y: b.y + uy * ends[1] };
  const len = span + ends[0] + ends[1];
  // Where the edge's own centre falls in the mitred bar, which is what the merlons are laid from.
  const shift = (ends[0] - ends[1]) / 2;

  const bar = new PIXI.Graphics();
  const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  const rotation = Math.atan2(q.y - p.y, q.x - p.x);
  bar.position.set(mid.x, mid.y);
  bar.rotation = rotation;
  const breached = wall.remaining <= 0;
  const rnd = seededRandom(seedOf(key));
  const shapes = breached ? breach(len, size, rnd) : battlement(len, span, shift, size, wall, rnd);
  if (wall.gate && !breached) {
    shapes.spine = null;
    shapes.blocks = shapes.blocks.filter(block => Math.abs(block.cx - shift) > span * GATE_HALF_OPENING);
  }
  drawWall(bar, shapes, colours, size, breached);
  if (wall.gate && !breached) {
    const gap = span * GATE_HALF_OPENING;
    bar.lineStyle({ width: spineWidth(size) * 2, color: colours.stone });
    bar.moveTo(-len / 2, 0).lineTo(shift - gap, 0);
    bar.moveTo(shift + gap, 0).lineTo(len / 2, 0);
    bar.lineStyle(0);
  }

  const shadow = new PIXI.Graphics();
  shadow.position.set(mid.x, mid.y);
  shadow.rotation = rotation;
  drawSilhouette(shadow, shapes, colours.shadow, SHADOW.spread * size);
  return { bar, shadow };
}

/** Plan-view timber doors. Their shape carries the state; the hinges identify the opening. */
function drawGate(g: PIXI.Graphics, a: Point, b: Point, interior: Point, open: boolean, size: number, colours: EdgePalette): void {
  const leaves = gateLeaves(a, b, interior, open);
  const width = spineWidth(size) * 2.6;
  const wood = 0xb48b4c;
  const radius = Math.max(1.8, size * .023);
  const handleOffset = width / 2 + radius;
  const handles = gateHandles(a, b, interior, open, handleOffset);
  for (const [index, { hinge, tip }] of leaves.entries()) {
    g.lineStyle({ width: width + jointWidth(size) * 2, color: colours.joint, cap: PIXI.LINE_CAP.SQUARE });
    g.moveTo(hinge.x, hinge.y).lineTo(tip.x, tip.y);
    g.lineStyle({ width, color: wood, cap: PIXI.LINE_CAP.BUTT });
    g.moveTo(hinge.x, hinge.y).lineTo(tip.x, tip.y);
    // The iron reinforcement follows the outer face, opposite the handle, through the swing.
    const { anchor, center } = handles[index];
    const offset = width * .45 / handleOffset;
    const ox = (anchor.x - center.x) * offset;
    const oy = (anchor.y - center.y) * offset;
    g.lineStyle({ width: Math.max(1.5, width * .5), color: 0x241d16, cap: PIXI.LINE_CAP.BUTT });
    g.moveTo(hinge.x + ox, hinge.y + oy).lineTo(tip.x + ox, tip.y + oy);
  }
  // A small seam marks the two leaves without opening a hole in the closed barrier.
  if (!open) {
    const dx = b.x - a.x, dy = b.y - a.y, span = Math.hypot(dx, dy) || 1;
    const mid = leaves[0].tip;
    g.lineStyle({ width: jointWidth(size), color: colours.joint });
    g.moveTo(mid.x - dy / span * width / 2, mid.y + dx / span * width / 2)
      .lineTo(mid.x + dy / span * width / 2, mid.y - dx / span * width / 2);
  }
  for (const { hinge } of leaves) {
    g.lineStyle({ width: jointWidth(size), color: colours.joint });
    g.beginFill(wood).drawCircle(hinge.x, hinge.y, width * .65).endFill();
  }
  for (const { anchor, center } of handles) {
    // Brass ring pulls sit beyond the timber on its inner face, with a short mounting stem.
    g.lineStyle({ width: jointWidth(size) * 3, color: colours.joint });
    g.moveTo(anchor.x, anchor.y).lineTo(center.x, center.y);
    g.drawCircle(center.x, center.y, radius);
    g.lineStyle({ width: jointWidth(size) * 1.5, color: 0xe8ce91 });
    g.moveTo(anchor.x, anchor.y).lineTo(center.x, center.y);
    g.drawCircle(center.x, center.y, radius);
  }
  g.lineStyle(0);
}

/** A row of solid trapezoid teeth biting from the edge into `lowerCenter`'s side — a rock
 * outcrop rather than a stroked zigzag line, and alternating tall/short so it reads as broken
 * rock rather than a uniform castle parapet. */
function drawCliff(g: PIXI.Graphics, a: Point, b: Point, lowerCenter: Point, colours: EdgePalette, size: number): void {
  let { px, py, len } = perpendicular(a, b);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  if ((lowerCenter.x - mx) * px + (lowerCenter.y - my) * py < 0) { px = -px; py = -py; }
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const teeth = Math.max(2, Math.round(len / 9));
  const toothLen = len / teeth;
  const tallDepth = Math.min(9, len / 3.5);
  const shortDepth = tallDepth * 0.45;
  const taper = toothLen * 0.22; // narrows the tip so the base (on the edge) reads wider than the point

  // Every tooth carries its own outline, so the run of them reads as drawn rock and the line
  // along the edge is the cliff top. Teeth are drawn one polygon at a time, so the stroke has
  // to be set before the fill rather than around the whole row.
  if (colours.outline !== null) stroke(g, colours, colours.outline, size);
  g.beginFill(colours.rock, colours.outline === null ? 0.9 : 1);
  for (let i = 0; i < teeth; i++) {
    const x0 = a.x + (b.x - a.x) * (i / teeth);
    const y0 = a.y + (b.y - a.y) * (i / teeth);
    const x1 = a.x + (b.x - a.x) * ((i + 1) / teeth);
    const y1 = a.y + (b.y - a.y) * ((i + 1) / teeth);
    const depth = i % 2 === 0 ? tallDepth : shortDepth;
    const tipLx = x0 + ux * taper + px * depth;
    const tipLy = y0 + uy * taper + py * depth;
    const tipRx = x1 - ux * taper + px * depth;
    const tipRy = y1 - uy * taper + py * depth;
    g.drawPolygon([x0, y0, x1, y1, tipRx, tipRy, tipLx, tipLy]);
  }
  g.endFill();
  g.lineStyle(0);
}

/** Walls (standing and breached) and cliffs, drawn along `grid.edgeSegment`. */
export class EdgeLayer {
  private readonly container: PIXI.Container;

  constructor(container: PIXI.Container) {
    this.container = container;
  }

  /** `ink` is set when the illustrated map is the one on: its walls and cliffs are drawn out of
   * the same pencil and page as the rest of it, rather than out of the theme's near-black ink. */
  draw(board: Board, size: number, theme: BoardTheme, ink: InkEdges | null = null): void {
    this.clear();
    const colours = edgePalette(theme, ink);
    const grid = gridOf(board);
    const g = new PIXI.Graphics();
    g.name = 'Edges';
    const shadows = new PIXI.Container();
    shadows.name = 'Wall_shadows';
    shadows.alpha = colours.shadowAlpha;
    shadows.filters = [wallBlur(size * SHADOW.blur)];
    this.container.addChild(g, shadows);
    for (const field of board.siegeFields ?? []) for (const cell of field.cells) {
      const sq = parse(cell);
      if (!grid.inBounds(sq)) continue;
      const c = grid.center(sq, size);
      g.lineStyle(1, field.kind === 'web' ? 0xc5d7dd : 0x946d3c, 0.8);
      g.beginFill(field.kind === 'web' ? 0xc5d7dd : 0x946d3c, 0.13).drawPolygon(grid.vertices(sq, size).flatMap(p => [p.x, p.y])).endFill();
      for (const vertex of grid.vertices(sq, size)) g.moveTo(c.x, c.y).lineTo(vertex.x, vertex.y);
      const label = new PIXI.Text(`${field.kind === 'web' ? 'Web' : 'Debris'} · R${field.expires}`, { fontFamily: 'sans-serif', fontSize: Math.max(9, size * 0.10), fill: theme.ink });
      label.anchor.set(0.5); label.position.set(c.x, c.y + size * 0.3);
      this.container.addChild(label);
    }
    g.lineStyle(0);

    const seen = new Set<string>();
    const bars: { key: string; wall: Wall; p: Point; q: Point }[] = [];
    for (const [key, wall] of Object.entries(board.walls)) {
      seen.add(key);
      const [aKey, bKey] = key.split('|');
      const a = grid.parse(aKey);
      const b = grid.parse(bKey);
      if (!grid.inBounds(a) || !grid.inBounds(b)) continue;
      const [p, q] = grid.edgeSegment(a, b, size);
      bars.push({ key, wall, p, q });
    }

    // A breached edge is rubble, not a wall: it carries no stub, so a standing neighbour stops
    // at the vertex rather than running its spine on into a gap.
    const stubs = new Map<string, { at: Point; list: Stub[] }>();
    const stub = (p: Point, s: Stub) => {
      const vertex = stubs.get(vertexKey(p));
      if (vertex) vertex.list.push(s); else stubs.set(vertexKey(p), { at: p, list: [s] });
    };
    bars.forEach((bar, i) => {
      if (bar.wall.remaining <= 0) return;
      const half = spineWidth(size) / 2;
      const len = Math.hypot(bar.q.x - bar.p.x, bar.q.y - bar.p.y) || 1;
      const dir = { x: (bar.q.x - bar.p.x) / len, y: (bar.q.y - bar.p.y) / len };
      stub(bar.p, { bar: i, dir, half });
      stub(bar.q, { bar: i, dir: { x: -dir.x, y: -dir.y }, half });
    });

    const endAt = (p: Point, self: number): number => {
      const list = stubs.get(vertexKey(p))?.list ?? [];
      const mine = list.find((s) => s.bar === self);
      if (!mine) return 0;
      let run = Infinity;
      for (const other of list) if (other.bar !== self) run = Math.min(run, mitre(mine, other));
      return Number.isFinite(run) ? run : 0;
    };

    bars.forEach((entry, i) => {
      const ends: [number, number] = [endAt(entry.p, i), endAt(entry.q, i)];
      const { bar, shadow } = wallGraphics(entry.p, entry.q, size, entry.wall, entry.key, colours, ends);
      bar.name = `Wall_${entry.key}`;
      shadows.addChild(shadow);
      this.container.addChild(bar);
      if (entry.wall.gate && entry.wall.remaining > 0) {
        const interior = grid.center(parse(wallsFor(board).insideOf(entry.key)!), size);
        const doors = new PIXI.Graphics();
        doors.name = `Gate_${entry.key}`;
        drawGate(doors, entry.p, entry.q, interior, entry.wall.gate.open, size, colours);
        this.container.addChild(doors);
      }
    });

    // One tower per vertex rather than one per wall reaching it: two walls at a corner used to
    // stand a block each, offset by their own rotations, and the pair read as a smear. Drawn
    // after every bar, so a tower closes the spines that run into it.
    const towers = new PIXI.Graphics();
    towers.name = 'Wall_towers';
    const towerShadows = new PIXI.Graphics();
    for (const { at: vertex, list } of stubs.values()) {
      const shapes = cornerBlock(vertex, list, size);
      drawWall(towers, shapes, colours, size, false);
      drawSilhouette(towerShadows, shapes, colours.shadow, SHADOW.spread * size);
    }
    shadows.addChild(towerShadows);
    this.container.addChild(towers);

    // Cliffs: any edge not already carrying a wall bar, where elevation drops by 2+.
    for (const sq of grid.cells()) {
      for (const n of grid.neighbours(sq)) {
        const key = grid.edgeKey(sq, n);
        if (seen.has(key)) continue;
        seen.add(key);
        if (barrierBetween(board, sq, n)?.kind !== 'cliff') continue;
        const lower = at(board, sq).elevation < at(board, n).elevation ? sq : n;
        const [p, q] = grid.edgeSegment(sq, n, size);
        drawCliff(g, p, q, grid.center(lower, size), colours, size);
      }
    }
  }

  clear(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  destroy(): void { this.clear(); }
}
