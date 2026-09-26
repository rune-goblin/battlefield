import { abilityDescription, abilitySummary, canEmplace, CELL_FEET, deployRanks, deriveStats, ENGINES, derivation, engineNamed, gridOf, MAX_WOUNDS, movementRateLabel, movementRates, notation, type Side, type UnitCard } from '../engine/index.js';
import type { BoardEventOf, TokenModel } from '../board/index.js';
import { autoCell, canHaul, cellsFor, deployableCells, engineUnder, isAmbush, pieceOf } from '../services/ArmyPreparationService.js';
import type { CommandAccepted, PieceRef } from '../runtime/commands.js';
import { COMMAND_NOTICE } from './command-notices.js';
import { setupTokens, signed } from './presentation.js';
import type {
  addEmplacement, addUnit, autoPlacePiece, game, generateForce, placePiece, removeEmplacement, removeUnit,
  setEngineLoaded, setHauling, SetupEngine, SetupUnit, unplacePiece,
} from './game.svelte.js';
import type { gameMap } from './map-style.svelte.js';
import type { resetToExample } from './navigation.svelte.js';
import type { NotificationService } from './notifications.js';

export interface PlaceDeps {
  game: typeof game;
  gameMap: typeof gameMap;
  notifications: NotificationService;
  addUnit: typeof addUnit;
  addEmplacement: typeof addEmplacement;
  autoPlacePiece: typeof autoPlacePiece;
  generateForce: typeof generateForce;
  placePiece: typeof placePiece;
  removeEmplacement: typeof removeEmplacement;
  removeUnit: typeof removeUnit;
  setHauling: typeof setHauling;
  setEngineLoaded: typeof setEngineLoaded;
  unplacePiece: typeof unplacePiece;
  resetToExample: typeof resetToExample;
}

export interface PlaceProps {
  /** The army step's side. The siege step has none: an engine belongs to whoever stands on it. */
  readonly side: Side | undefined;
  readonly pieces: 'units' | 'engines';
}

// proto: a review note opens with instructions to the designer and closes with build notes;
// the first sentence between them is the ability's effect.
function reviewEffect(reason: string): string {
  const rest = reason.replace(/^No assignment in the shared catalogue\..*?grant no substitute benefit automatically\.\s*/, '');
  return rest.match(/^.*?[.;](?=\s|$)/)?.[0].replace(/;$/, '.') ?? rest;
}

// The card as it plays here: attacks and Move, then AC, Health and Perception, then the saves.
function statRows(card: UnitCard): { label: string; value: string; note: string }[] {
  const st = deriveStats(card);
  const from = Object.fromEntries(derivation(card).map((d) => [d.stat, d.from]));
  const rates = movementRates(card);
  return [
    { label: 'Melee', value: signed(st.strike), note: from.strike },
    { label: 'Shoot', value: st.volley === null ? '—' : `${signed(st.volley)} ${st.reach}`, note: from.volley },
    { label: 'Move', value: `${Math.max(rates.land, rates.fly, rates.swim) / CELL_FEET} hexes`, note: movementRateLabel(rates) },
    { label: 'AC', value: String(st.defence), note: from.defence },
    { label: 'Health', value: String(MAX_WOUNDS), note: 'Health at the start of the battle' },
    { label: 'Per', value: signed(st.perception), note: from.perception },
    { label: 'Fort', value: signed(st.fortitude), note: 'Fortitude save' },
    { label: 'Ref', value: signed(st.reflex), note: from.reflex },
    { label: 'Will', value: signed(st.will), note: from.will },
  ];
}

function sheet(card: UnitCard) {
  const rates = movementRates(card);
  return {
    movement: rates.fly || rates.swim ? movementRateLabel(rates) : null,
    abilities: (card.abilities ?? []).map((a) => ({ summary: abilitySummary(a), description: abilityDescription(a) })),
    review: (card.abilityReview ?? []).map((note) => ({ label: note.label, effect: reviewEffect(note.reason) })),
  };
}

const engineChoices = ENGINES.map((e) => ({
  name: e.name,
  label: `${e.name} · L${e.level} ${e.kind}${e.reach ? ' ' + e.reach : ''} +${e.launch}`,
}));

export function createPlaceController(deps: PlaceDeps, props: PlaceProps) {
  const { game } = deps;

  // proto: the draft still stores a side on every engine, and the siege step files new ones
  // under the attacker until a unit claims them.
  const side = $derived(props.side ?? 'attacker');
  const siege = $derived(props.pieces === 'engines');

  let picking = $state(false);
  /** What the sidebar has picked up: one of this side's units, or an emplacement. */
  let selected = $state<PieceRef | null>(null);
  // Set on a tray item's dragstart, read back from DataTransfer on drop — dragstart is the
  // only point a native drag gives Svelte a hook, so it also drives the live deploy-wash
  // highlight during that drag.
  let dragging = $state<PieceRef | null>(null);
  let hoveredCell = $state<string | null>(null);
  /** The emplacement a unit was just put on, while the player decides whether it hauls it. */
  let haulAsk = $state<string | null>(null);
  $effect(() => { void props.side; void props.pieces; selected = null; dragging = null; hoveredCell = null; haulAsk = null; });

  const units = $derived(game.setup.units);
  const emplacements = $derived(game.setup.emplacements);
  const board = $derived(game.setup.board!);
  const myUnits = $derived(units.filter((u) => u.side === side));
  // Siege preparation shows the equipment alone, including when revisiting a saved setup.
  const visibleUnits = $derived(siege ? [] : units);
  const mine = $derived(siege ? [] : myUnits);
  const myEngines = $derived(siege ? emplacements : []);
  const held = $derived(mine.reduce<Record<string, number>>((n, u) => ({ ...n, [u.card.name]: (n[u.card.name] ?? 0) + 1 }), {}));

  // A selected piece deploys on its own side's ranks; with nothing selected the wash shows
  // this stage's side, so the player always sees where its next unit may go.
  const picked = $derived(selected?.kind === 'unit' ? units.find((u) => u.id === selected!.id) ?? null : null);
  const pickedAmbush = $derived(picked ? isAmbush(picked) : false);

  // The wash describes the whole deployment zone. Occupancy and terrain only decide whether
  // the current placement is legal, so placing a piece leaves the zone intact beneath it.
  const deploymentRanks = $derived(new Set(deployRanks(side, pickedAmbush, board.squares.length)));
  const highlightCells = $derived(gridOf(board).cells()
    .filter((cell) => (siege ? canEmplace(board, cell) : deploymentRanks.has(cell.rank))).map(notation));
  const legalCells = $derived(new Set(deployableCells(game.setup, side, pickedAmbush, selected, siege ? 'engine' : 'unit')));
  const invalidCell = $derived(selected && hoveredCell && !legalCells.has(hoveredCell) ? hoveredCell : null);
  const validCell = $derived(selected && hoveredCell && legalCells.has(hoveredCell) ? hoveredCell : null);

  const tokens = $derived<TokenModel[]>(setupTokens(game.setup, { units: visibleUnits, selected }));

  // Derived, so the board's effects rerun when the cells change and at no other time.
  const highlights = $derived([
    { style: 'deploy' as const, cells: highlightCells },
    { style: 'valid' as const, cells: validCell ? [validCell] : [] },
    { style: 'invalid' as const, cells: invalidCell ? [invalidCell] : [] },
  ]);

  const haulEngine = $derived(emplacements.find((e) => e.id === haulAsk) ?? null);
  const haulUnit = $derived(haulEngine ? units.find((u) => u.square === haulEngine.square) ?? null : null);
  const sideWord = $derived(side === 'attacker' ? 'attacking' : 'defending');
  const unplaced = $derived(mine.filter((u) => !u.square).length + myEngines.filter((e) => !e.square).length);

  const pieceAt = (p: PieceRef): SetupUnit | SetupEngine | undefined => pieceOf(game.setup, p);

  /** A token carries its piece's own ID, so the kind comes from which list holds it. */
  const pickOf = (id: string): PieceRef =>
    ({ kind: units.some((u) => u.id === id) ? 'unit' : 'engine', id });

  function nextUnplaced(): PieceRef | null {
    const u = mine.find((u) => u.square === null);
    if (u) return { kind: 'unit', id: u.id };
    const e = myEngines.find((e) => e.square === null);
    return e ? { kind: 'engine', id: e.id } : null;
  }

  // proto: a resent command carries no `added`; fall back to the newest piece.
  function newest(kind: PieceRef['kind']): PieceRef | null {
    const piece = (kind === 'unit' ? mine : myEngines).at(-1);
    return piece ? { kind, id: piece.id } : null;
  }

  const pickAdded = (result: CommandAccepted, kind: PieceRef['kind']) => result.added?.find((p) => p.kind === kind) ?? newest(kind);

  async function add(card: UnitCard) {
    const result = await deps.addUnit(side, card);
    if (result.ok) selected = pickAdded(result, 'unit');
  }

  /** Take a piece out of the force. The tray loses it, so nothing stays selected. */
  function drop(p: PieceRef) {
    selected = null;
    return p.kind === 'unit' ? deps.removeUnit(p.id) : deps.removeEmplacement(p.id);
  }

  /** A unit put on an engine works it; one that can move asks about hauling. */
  async function put(p: PieceRef, cell: string) {
    const result = await deps.placePiece(p, cell);
    if (!result.ok || p.kind !== 'unit') return result;
    const unit = pieceAt(p) as SetupUnit | undefined;
    const under = unit && engineUnder(game.setup, unit);
    if (under && canHaul(under)) haulAsk = under.id;
    return result;
  }

  async function answerHaul(hauling: boolean) {
    const id = haulAsk;
    haulAsk = null;
    if (id && hauling) await deps.setHauling(id, true);
  }

  /** Put the selected piece down, then jump to this side's next unplaced piece. */
  async function placeOn(n: string) {
    if (!selected || !legalCells.has(n)) return;
    const result = await put(selected, n);
    if (result.ok) selected = nextUnplaced();
  }

  async function placeAuto(p: PieceRef) {
    const result = await deps.autoPlacePiece(p);
    if (result.ok) selected = nextUnplaced();
  }

  /** Only this step's own pieces answer: the rest are there to deploy against. */
  function mayMove(p: PieceRef): boolean {
    if ((p.kind === 'engine') !== siege) return false;
    return siege || pieceAt(p)?.side === side;
  }

  function onCell(e: BoardEventOf<'cell'>) { void placeOn(e.cell); }
  function onToken(e: BoardEventOf<'token'>) {
    const p = pickOf(e.id);
    if (!mayMove(p)) return;
    selected = p;
  }

  // A board-internal drag of an already-placed token. Validated against that piece's own
  // side/ambush ranks (not `legalCells`, which follows the sidebar and may be stale mid-drag):
  // an invalid or occupied drop is a no-op, so the token stays put and TokenLayer's next
  // render snaps it back on its own.
  function onTokenDrop(e: BoardEventOf<'drop'>) {
    const p = pickOf(e.id);
    if (!mayMove(p)) return;
    if (!cellsFor(game.setup, p).includes(e.cell)) return;
    void put(p, e.cell);
  }

  function onTokenDrag(e: BoardEventOf<'drag'>) {
    if (e.cell === null) { hoveredCell = null; return; }
    const p = pickOf(e.id);
    if (!mayMove(p)) return;
    // Pointer moves carry the same piece throughout a drag. Replacing this object would
    // rebuild every token, including its text and graphics, on every pointer event.
    if (selected?.id !== p.id || selected.kind !== p.kind) selected = p;
    hoveredCell = e.cell;
  }

  function liftFromTray(p: PieceRef) {
    dragging = p;
    selected = p;
  }
  function onTrayDragEnd() { dragging = null; }

  // A tray item dropped onto the canvas. `cell` is null outside the grid entirely; outside
  // the deploy wash (or over an occupied square) the piece simply stays in the tray.
  function onTrayDrop(cell: string | null, data: DataTransfer | null) {
    const raw = data?.getData('text/plain');
    const p = raw ? pickOf(raw) : dragging;
    dragging = null;
    if (cell === null || !p || !mayMove(p) || !cellsFor(game.setup, p).includes(cell)) return;
    void put(p, cell);
  }

  let engineName = $state(engineNamed('Catapult')?.name ?? ENGINES[0].name);
  async function addEngine() {
    const result = await deps.addEmplacement(side, engineName);
    if (result.ok) selected = pickAdded(result, 'engine');
  }

  async function generate() {
    const result = await deps.generateForce(side);
    if (result.ok) selected = nextUnplaced();
  }

  const deployNote = (u: SetupUnit) => {
    const ranks = deployRanks(u.side, isAmbush(u), game.setup.board?.squares.length).map((r) => r + 1);
    return `ranks ${Math.min(...ranks)}–${Math.max(...ranks)}`;
  };

  const isSelected = (kind: PieceRef['kind'], id: string) => selected?.kind === kind && selected.id === id;
  const isLifted = (kind: PieceRef['kind'], id: string) => dragging?.kind === kind && dragging.id === id;

  return {
    close: () => deps.notifications.dismiss(COMMAND_NOTICE),
    get side() { return side; },
    get siege() { return siege; },
    get picking() { return picking; },
    set picking(next) { picking = next; },
    get engineName() { return engineName; },
    set engineName(next) { engineName = next; },
    get mine() { return mine; },
    get myEngines() { return myEngines; },
    get held() { return held; },
    get haulEngine() { return haulEngine; },
    get haulUnit() { return haulUnit; },
    get sideWord() { return sideWord; },
    get unplaced() { return unplaced; },
    armyCells: () => [...mine.map((u) => u.square), ...myEngines.map((e) => e.square)].filter((sq) => sq !== null),
    isSelected,
    isLifted,
    select: (p: PieceRef) => { selected = p; },
    engineChoices,
    statRows,
    sheet,
    deployNote,
    engineCard: engineNamed,
    workedEngine: (u: SetupUnit) => engineUnder(game.setup, u),
    mayHaul: canHaul,
    canAutoPlace: (p: PieceRef) => autoCell(game.setup, p) !== null,
    add,
    drop,
    answerHaul,
    placeAuto,
    addEngine,
    generate,
    liftFromTray,
    onTrayDragEnd,
    unplace: (p: PieceRef) => deps.unplacePiece(p),
    toggleHauling: (engine: SetupEngine) => deps.setHauling(engine.id, !engine.hauled),
    setLoaded: (id: string, loaded: boolean) => deps.setEngineLoaded(id, loaded),
    resetToExample: () => deps.resetToExample(),
    get selected() { return selected; },
    get board() {
      return {
        board, tokens, mode: 'place' as const, highlights,
        onhover: (e: BoardEventOf<'hover'>) => { hoveredCell = e.cell; }, ondrag: onTokenDrag,
        ontrayhover: (cell: string | null) => { hoveredCell = cell; },
        oncell: onCell, ontoken: onToken, ondrop: onTokenDrop, ontraydrop: onTrayDrop,
        terrainAppearance: deps.gameMap.terrainAppearance, inkMap: deps.gameMap.inkMap,
      };
    },
  };
}

export type PlaceController = ReturnType<typeof createPlaceController>;
