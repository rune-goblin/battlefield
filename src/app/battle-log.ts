import type { BattleState, LogEntry, Side } from '../engine/index.js';

export interface TurnBlock {
  kind: 'turn';
  id: string;
  unit: string;
  name: string;
  side?: Side;
  round: number;
  entries: LogEntry[];
  ended: boolean;
}
export type LogBlock = TurnBlock | { kind: 'events'; id: string; entries: LogEntry[] };

/** Boundaries belong to the actor; individual events may name a reacting enemy or ally. */
export function battleLogBlocks(state: BattleState): LogBlock[] {
  const blocks: LogBlock[] = [];
  let turn: TurnBlock | null = null;
  const makeTurn = (unit: string, round: number, id: string): TurnBlock => {
    const army = state.units.find((u) => u.id === unit);
    return { kind: 'turn', id, unit, name: army?.name ?? unit, side: army?.side, round, entries: [], ended: false };
  };
  for (const [index, entry] of state.log.entries()) {
    if (entry.turn === 'start' && entry.unit) {
      turn = makeTurn(entry.unit, entry.round, `turn:${index}`);
      blocks.push(turn);
    } else if (entry.turn === 'end') {
      if (turn) turn.ended = true;
      turn = null;
    } else if (turn) {
      turn.entries.push(entry);
    } else {
      // Older saves have no turn boundaries. Preserve their events without inventing actors.
      const last = blocks.at(-1);
      if (last?.kind === 'events') last.entries.push(entry);
      else blocks.push({ kind: 'events', id: `events:${index}`, entries: [entry] });
    }
  }
  if (state.phase === 'battle' && state.active && (!turn || turn.unit !== state.active)) {
    blocks.push(makeTurn(state.active, state.round, `selected:${state.active}`));
  }
  return blocks;
}
