import { preloadBoardArt, preloadPieceArt } from '../board/preload.js';
import { game, onRecord } from './game.svelte.js';

function warm(): void {
  // A client with no battle on the table fetches nothing.
  if (!game.setup.board && !game.battle) return;
  preloadBoardArt();
  const battle = game.battle;
  preloadPieceArt(
    [...game.setup.units.map((unit) => unit.card), ...(battle?.units ?? [])],
    [
      ...game.setup.emplacements.map((engine) => engine.name),
      ...game.setup.units.flatMap((unit) => unit.engines.map((engine) => engine.name)),
      ...(battle?.engines ?? []).map((engine) => engine.name),
      ...(battle?.units ?? []).flatMap((unit) => unit.engines.map((engine) => engine.name)),
    ],
  );
}

let started = false;

/** Fetch and decode the art of every record as it arrives, ahead of the stage that shows it. */
export function followArt(): void {
  if (started) return;
  started = true;
  onRecord(warm);
  warm();
}
