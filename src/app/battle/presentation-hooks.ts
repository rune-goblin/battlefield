import type { TargetArrow } from '../../board/index.js';
import type { PresentationSink } from '../presentation.js';
import type { TargetMarker } from '../targeting.js';
import type { BattleBoard } from './battle-controller.svelte.js';

const AFTERGLOW_MS = 800;
const SETTLE_POLL_MS = 100;

export interface PresentationHooks {
  sink: PresentationSink;
  dispose(): void;
}

// The board plays the commit, not the command: every flash, burst, arrow and mark comes from
// the events the record carries, so a client that issued nothing shows the same execution.
export function presentationHooks(
  board: () => BattleBoard | undefined,
  flash: (unit: string) => void,
  show: (markers: TargetMarker[], arrows: TargetArrow[]) => void,
): PresentationHooks {
  let afterglow: ReturnType<typeof setTimeout> | null = null;
  return {
    sink: {
      route: (unit, cells) => board()?.setRoute(unit, cells),
      flash,
      burst: (cell, tree, from) => board()?.burst(cell, tree, from),
      combatText: ({ unit, ...line }) => board()?.combatText({ token: unit, ...line }),
      resolved: (markers, arrows) => {
        show(markers, arrows);
        if (afterglow) clearTimeout(afterglow);
        afterglow = setTimeout(() => { show([], []); afterglow = null; }, AFTERGLOW_MS);
      },
    },
    dispose: () => { if (afterglow) clearTimeout(afterglow); },
  };
}

/** Runs `then` once the board has at most `overlapMs` of its current show left to play. */
export function afterBoardSettles(board: () => BattleBoard | undefined, overlapMs: number, then: () => void): () => void {
  const timer = setInterval(() => {
    if ((board()?.remainingMs() ?? 0) > overlapMs) return;
    clearInterval(timer);
    then();
  }, SETTLE_POLL_MS);
  return () => clearInterval(timer);
}
