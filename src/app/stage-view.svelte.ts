import { onDestroy, type ComponentProps, type Snippet } from 'svelte';
import type PixiBoard from './PixiBoard.svelte';

/** What a stage hands `App.svelte`, which owns the one shell and the one board. Every member
 * is read through a getter, so the shell and the board follow the stage's own state. */
export interface StageView {
  readonly board: ComponentProps<typeof PixiBoard>;
  /** The pointer over the map is a crosshair: an action is armed and waits for its target. */
  readonly aiming?: boolean;
  readonly leftTitle?: string;
  readonly rightTitle?: string;
  readonly leftWidth?: number;
  readonly rightWidth?: number;
  readonly top?: Snippet;
  readonly bottom?: Snippet;
  readonly left?: Snippet;
  readonly right?: Snippet;
  readonly rail?: Snippet;
  readonly pin?: Snippet;
  readonly float?: Snippet;
  readonly modal?: Snippet;
}

// Raw: a view is getters over the stage's own state, and a proxy around it would add nothing.
let view = $state.raw<StageView | null>(null);
let board = $state.raw<PixiBoard | undefined>(undefined);

export const stage = {
  get view() { return view; },
  /** The mounted board, for a stage's imperative calls: `popup`, `burst`, `frame`. */
  get board() { return board; },
  set board(next: PixiBoard | undefined) { board = next; },
};

/** Called once from a stage's script. The stage renders nothing of its own: its snippets and
 * board props show through the shell for as long as it is mounted. */
// Svelte runs a teardown against the state as it stood before the change that caused it, so
// the outgoing stage would read itself as current there. This copy is plain and says who
// presented last.
let latest: StageView | null = null;

export function presentStage(next: StageView): void {
  latest = next;
  view = next;
  onDestroy(() => {
    if (latest !== next) return;
    latest = null;
    view = null;
  });
}
