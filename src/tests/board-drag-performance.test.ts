import { describe, expect, it, vi } from 'vitest';
import { Interaction, type BoardEvent, type InteractionOptions } from '../board/Interaction.js';
import { gridOf, type Point } from '../engine/index.js';
import { openBoard } from './helpers.js';

function harness(cell = 'c3', mode: 'place' | 'battle' = 'place') {
  const handlers = new Map<string, (event: PointerEvent) => void>();
  const canvas = {
    style: {},
    addEventListener: (name: string, handler: (event: PointerEvent) => void) => handlers.set(name, handler),
    removeEventListener: (name: string) => handlers.delete(name),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    focus() {}, setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {},
  } as unknown as HTMLCanvasElement;
  const grid = gridOf(openBoard('square'));
  const events: BoardEvent[] = [];
  const onDrag = vi.fn();
  const interaction = new Interaction({
    canvas, viewport: {} as InteractionOptions['viewport'], toLocal: (point) => point,
    geometry: () => ({ grid, size: 100 }), content: () => null,
    tokens: () => [{ id: 'unit', cell }], region: () => [], emit: (event) => events.push(event),
    onHover() {}, onPreview() {}, onBrush() {}, onClear() {}, onDrag,
  });
  interaction.setMode(mode);
  interaction.setDraggable('unit');
  const pointer = (type: string, point: Point) => handlers.get(type)!({
    clientX: point.x, clientY: point.y, button: 0, pointerId: 1, preventDefault() {},
  } as PointerEvent);
  const center = (key: string) => grid.center(grid.parse(key), 100);
  return { pointer, center, events, onDrag, interaction };
}

describe('drag preview work', () => {
  it('moves the piece on all pointer events but requests one preview per cell', () => {
    const h = harness();
    const start = h.center('c3');
    h.pointer('pointerdown', start);
    for (let i = 0; i < 100; i++) h.pointer('pointermove', { x: start.x + 10 + i / 10, y: start.y });
    expect(h.onDrag).toHaveBeenCalledTimes(100);
    expect(h.events.filter(event => event.type === 'drag')).toHaveLength(1);
    h.pointer('pointermove', h.center('d3'));
    expect(h.events.filter(event => event.type === 'drag')).toHaveLength(2);
    // Pointer-up must use its own coordinates, even without a preceding pointer-move.
    h.pointer('pointerup', h.center('e3'));
    expect(h.events.filter(event => event.type === 'drop')).toEqual([{ type: 'drop', id: 'unit', cell: 'e3', exit: false }]);
    expect(h.events.at(-1)).toEqual({ type: 'drag', id: 'unit', cell: null, end: true });
    h.interaction.destroy();
  });

  it('distinguishes a boundary cell from fleeing through its edge and clears off-board previews', () => {
    const h = harness('e9', 'battle');
    const start = h.center('e9');
    h.pointer('pointerdown', start);
    h.pointer('pointermove', { x: start.x, y: start.y - 10 });
    h.pointer('pointermove', { x: start.x, y: -10 });
    h.pointer('pointermove', { x: start.x, y: -200 });
    expect(h.events.filter(event => event.type === 'drag')).toEqual([
      { type: 'drag', id: 'unit', cell: 'e9', exit: false },
      { type: 'drag', id: 'unit', cell: 'e9', exit: true },
      { type: 'drag', id: 'unit', cell: null, exit: false },
    ]);
    h.pointer('pointercancel', start);
    h.pointer('pointerdown', start);
    h.pointer('pointermove', { x: start.x + 10, y: start.y });
    expect(h.events.at(-1)).toMatchObject({ cell: 'e9' });
    expect(h.events.filter(event => event.type === 'drag')).toHaveLength(5);
    h.interaction.destroy();
  });
});
