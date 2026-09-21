import * as PIXI from 'pixi.js';
import { at, BRIDGE_AXES, gridOf, type Board } from '../../engine/index.js';

/** Wooden decks over the water surface, shared by plain, textured and illustrated maps. */
export function drawBridges(board: Board, size: number): PIXI.Container {
  const layer = new PIXI.Container();
  layer.name = 'Bridges';
  const grid = gridOf(board);
  for (const cell of grid.cells()) {
    if (at(board, cell).terrain !== 'bridge') continue;
    const centre = grid.center(cell, size);
    const neighbours = grid.neighbours(cell).map(n => {
      const point = grid.center(n, size);
      const angle = Math.atan2(point.y - centre.y, point.x - centre.x);
      const terrain = at(board, n).terrain;
      return { angle, score: terrain === 'bridge' ? 4 : terrain === 'water' ? 0 : 2 };
    });
    // Prefer an axis joining bridge segments or two banks; ties favour crossing the ranks.
    const axis = neighbours.map(n => ({ angle: n.angle, score: n.score +
      (neighbours.find(m => Math.cos(m.angle - n.angle) < -.99)?.score ?? 0) + Math.abs(Math.sin(n.angle)) * .1 }))
      .sort((a, b) => b.score - a.score)[0]?.angle ?? Math.PI / 2;
    const axes = BRIDGE_AXES[board.grid];
    const deck = new PIXI.Graphics();
    deck.position.set(centre.x, centre.y);
    deck.rotation = axis - Math.PI / 2 + ((at(board, cell).bridgeTurns ?? 0) * Math.PI) / axes;
    deck.lineStyle(size * .018, 0x34271e).beginFill(0xb78a53)
      .drawRect(-size * .15, -size * .48, size * .3, size * .96).endFill();
    deck.lineStyle(size * .008, 0x60472f, .8);
    for (let y = -.42; y < .48; y += .07) deck.moveTo(-size * .14, y * size).lineTo(size * .14, y * size);
    deck.lineStyle(size * .025, 0xe0c391);
    for (const x of [-.14, .14]) deck.moveTo(x * size, -size * .48).lineTo(x * size, size * .48);
    layer.addChild(deck);
  }
  return layer;
}
