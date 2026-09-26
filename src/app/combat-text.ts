import type { CombatTextPart } from '../board/index.js';

/** One line over one piece: a word, or every bar a blow moved, side by side. `cell` places the
 * line when the board no longer holds the piece. */
export interface CombatTextLine { unit: string; cell: string; parts: CombatTextPart[] }

export type CombatTextDisplay = (line: CombatTextLine) => void;

/**
 * The words that float over the pieces. Anything may queue a line; the one attached display
 * plays every line in the order queued. Lines queued with no display attached wait for the
 * next one.
 */
export interface CombatTextQueue {
  queue(...lines: CombatTextLine[]): void;
  /** Replaces any display attached before. The returned function detaches this one alone. */
  attach(display: CombatTextDisplay): () => void;
  /** Drops the lines still waiting for a display. */
  clear(): void;
}

export function createCombatTextQueue(): CombatTextQueue {
  let display: CombatTextDisplay | null = null;
  let waiting: CombatTextLine[] = [];
  const flush = () => {
    const lines = waiting;
    waiting = [];
    for (const line of lines) display?.(line);
  };
  return {
    queue(...lines) {
      waiting.push(...lines);
      if (display) flush();
    },
    attach(next) {
      display = next;
      flush();
      return () => { if (display === next) display = null; };
    },
    clear() {
      waiting = [];
    },
  };
}
