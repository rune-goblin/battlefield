import type { DicePort } from '../../runtime/ports.js';

/** The authority's d20, drawn the way an ordinary Foundry check is: one die term read through
 * the platform's configured generator (`CONFIG.Dice.randomUniform()`), then discarded. */
export function foundryDice(): DicePort {
  return { d20: () => new foundry.dice.terms.Die({ faces: 20 }).randomFace() };
}
