import { SIDES, type BattleState } from '../../engine/index.js';
import type { SideControl } from '../../runtime/control.js';

export type EndingPhase = 'playing' | 'waiting' | 'announcement' | 'report';

/** Shared seats celebrate the named winner. Draws and dusk keep a neutral backdrop. */
export function outcomeArt(outcome: string): 'victory' | 'defeat' | null {
  if (outcome === 'Defeat') return 'defeat';
  if (outcome === 'Victory' || outcome === 'Attackers win' || outcome === 'Defenders win') return 'victory';
  return null;
}

const RESULT_DELAY_MS = 2000;
const POLL_MS = 100;

/** Keep the final commit visible, leave a quiet beat, then announce its outcome.
 * Opening an existing result goes straight to its report. Undo cancels the sequence. */
export function createBattleEnding(remainingMs: () => number, publish: (phase: EndingPhase) => void) {
  let key: string | undefined;
  let ended = false;
  let phase: EndingPhase = 'playing';
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const cancel = () => { clearInterval(timer); timer = undefined; };
  const set = (next: EndingPhase) => { phase = next; publish(next); };

  return {
    update(nextKey: string, nextEnded: boolean) {
      if (closed || (key === nextKey && ended === nextEnded)) return;
      cancel();
      const opening = key !== nextKey;
      key = nextKey;
      ended = nextEnded;
      if (!ended) { set('playing'); return; }
      if (opening) { set('report'); return; }
      set('waiting');
      let quietSince: number | undefined;
      timer = setInterval(() => {
        if (remainingMs() > 0) { quietSince = undefined; return; }
        quietSince ??= Date.now();
        if (Date.now() - quietSince < RESULT_DELAY_MS) return;
        cancel();
        set('announcement');
      }, POLL_MS);
    },
    announcementFinished() {
      if (!closed && phase === 'announcement') set('report');
    },
    dispose() { closed = true; cancel(); },
  };
}

/** Non-GM seats establish the players' side, even while those players are offline.
 * Opposing players see their own result; a shared seat or spectator sees the winner. */
export function battleOutcome(
  battle: Pick<BattleState, 'winner' | 'endedBy'>,
  control: SideControl,
  gmId: string,
  viewerId: string,
): string {
  if (battle.winner === 'draw') return 'Draw';
  if (!battle.winner) return battle.endedBy === 'dusk' ? 'Day complete' : 'Battle complete';
  const playerSides = SIDES.filter(side => control.seats[side].some(id => id !== gmId));
  const viewerSides = SIDES.filter(side => control.seats[side].includes(viewerId));
  const perspective = playerSides.length === 1 ? playerSides[0] : viewerSides.length === 1 ? viewerSides[0] : null;
  if (perspective) return battle.winner === perspective ? 'Victory' : 'Defeat';
  return battle.winner === 'attacker' ? 'Attackers win' : 'Defenders win';
}
