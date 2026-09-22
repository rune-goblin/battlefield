import type { BattleSetupDraft } from '../runtime/session.js';

/** Own the UI's copy while preserving unchanged branches of immutable session records. */
export function createSetupCopy() {
  let source: BattleSetupDraft | undefined;
  let copy: BattleSetupDraft;
  return (next: BattleSetupDraft): BattleSetupDraft => {
    if (next === source) return copy;
    copy = {
      spec: next.spec === source?.spec ? copy.spec : structuredClone(next.spec),
      board: source && next.board === source.board ? copy.board : structuredClone(next.board),
      units: next.units === source?.units ? copy.units : structuredClone(next.units),
      emplacements: next.emplacements === source?.emplacements ? copy.emplacements : structuredClone(next.emplacements),
      roundsPerDay: next.roundsPerDay,
    };
    source = next;
    return copy;
  };
}
