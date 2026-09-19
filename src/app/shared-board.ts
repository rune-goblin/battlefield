import { createBoardView, type Brush, type HostedBoardView } from '../board/index.js';

interface SharedBoard { canvas: HTMLCanvasElement; view: HostedBoardView }

let shared: SharedBoard | null = null;
let held = false;

/**
 * The one canvas and PIXI application the stages pass between them. A stage that mounts takes
 * it into its own element and hands it back on the way out, so the GL context and every
 * uploaded texture outlive the stage switch.
 */
export function takeSharedBoard(container: HTMLElement, onBrush: (brush: Brush | null) => void): SharedBoard | null {
  // Null while another stage still holds it; the caller builds a board of its own.
  if (held) return null;
  held = true;
  if (shared) {
    container.prepend(shared.canvas);
    shared.view.attach(container, onBrush);
    return shared;
  }
  const canvas = document.createElement('canvas');
  container.prepend(canvas);
  shared = { canvas, view: createBoardView(canvas, container, { onBrush }) };
  return shared;
}

export function returnSharedBoard(): void {
  held = false;
  shared?.view.detach();
  shared?.canvas.remove();
}

/** The app is going away: a closed Foundry window must not keep a GL context. */
export function disposeSharedBoard(): void {
  shared?.view.destroy();
  shared?.canvas.remove();
  shared = null;
  held = false;
}
