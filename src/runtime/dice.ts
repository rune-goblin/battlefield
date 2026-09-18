import type { DicePort } from './ports.js';

export interface DiceRecorder extends DicePort {
  /** The faces drawn since the last call, in the order they fell. */
  take(): number[];
}

/** Wraps the authority's dice so a commit carries the faces its transition drew. The chat
 * adapter of Wave 4.3 rebuilds each roll from them, so the cards show the dice the rules used
 * rather than a second draw. */
export function recordDice(source: DicePort): DiceRecorder {
  let faces: number[] = [];
  return {
    d20() {
      const face = source.d20();
      faces.push(face);
      return face;
    },
    take() {
      const drawn = faces;
      faces = [];
      return drawn;
    },
  };
}
