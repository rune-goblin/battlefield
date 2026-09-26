import { MAX_WOUNDS, ROUTED_AT } from '../engine/index.js';

export const STATUS_TRACK = 0x686868;
export const STATUS_OUTLINE = 0x24211e;
const GREEN = 0x69b85a;
const YELLOW = 0xf2c744;
const ORANGE = 0xf28c28;
const RED = 0xe0453a;

export interface StatusBar {
  remaining: number;
  max: number;
  colour: number;
  label: string;
}

/** Stored losses remain compatible with saves; the interface shows Health and Morale remaining. */
export function statusBars(wounds: number, disorder: number, routed: boolean): { health: StatusBar; morale: StatusBar } {
  const damage = Math.max(0, Math.min(MAX_WOUNDS, wounds));
  const loss = Math.max(0, Math.min(ROUTED_AT, disorder));
  const health = MAX_WOUNDS - damage;
  const morale = ROUTED_AT - loss;
  return {
    health: {
      remaining: health, max: MAX_WOUNDS,
      colour: health === 0 ? STATUS_TRACK : damage >= 3 ? RED : damage >= 2 ? ORANGE : damage >= 1 ? YELLOW : GREEN,
      label: `Health ${health}/${MAX_WOUNDS}${health === 0 ? ' — destroyed' : ''}`,
    },
    morale: {
      remaining: morale, max: ROUTED_AT,
      colour: morale === 0 ? STATUS_TRACK : loss >= 2 ? RED : loss >= 1 ? ORANGE : GREEN,
      label: `Morale ${morale}/${ROUTED_AT}${routed ? ' — routed' : ''}`,
    },
  };
}
