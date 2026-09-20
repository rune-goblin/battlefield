<script lang="ts">
  import { canEmplace, deployRanks, ENGINES, derivation, gridOf, notation, paceReason, type Side, type UnitCard } from '../engine/index.js';
  import { engineArtUrl, troopArtUrl, type BoardEventOf, type TokenModel } from '../board/index.js';
  import { gameMap } from './map-style.svelte.js';
  import { MapControls, TopBar } from './shell/index.js';
  import { presentStage, stage } from './stage-view.svelte.js';
  import WizardRail from './WizardRail.svelte';
  import TroopPicker from './TroopPicker.svelte';
  import {
    addEmplacement, addUnit, autoPlacePiece,
    game, generateForce, placePiece, removeEmplacement, removeUnit, setHauling, unplacePiece, type SetupEngine, type SetupUnit,
  } from './game.svelte.js';
  import { resetToExample } from './navigation.svelte.js';
  import { autoCell, canHaul, cellsFor, deployableCells, engineUnder, isAmbush, pieceOf } from '../services/ArmyPreparationService.js';
  import type { PieceRef } from '../runtime/commands.js';
  import { onDestroy } from 'svelte';
  import { useNotifications } from './notification-context.js';
  import { COMMAND_NOTICE } from './command-notices.js';

  interface Props {
    /** The army step's side. The siege step has none: an engine belongs to whoever stands on it. */
    side?: Side;
    pieces: 'units' | 'engines';
  }
  let { side: stepSide, pieces }: Props = $props();

  // proto: the draft still stores a side on every engine, and the siege step files new ones
  // under the attacker until a unit claims them.
  const side = $derived(stepSide ?? 'attacker');
  const siege = $derived(pieces === 'engines');

  const notifications = useNotifications();
  onDestroy(() => notifications.dismiss(COMMAND_NOTICE));

  let picking = $state(false);

  /** What the sidebar has picked up: one of this side's units, or an emplacement. */
  let selected = $state<PieceRef | null>(null);
  // Set on a tray item's dragstart, read back from DataTransfer on drop — dragstart is the
  // only point a native drag gives Svelte a hook, so it also drives the live deploy-wash
  // highlight during that drag.
  let dragging = $state<PieceRef | null>(null);
  let hoveredCell = $state<string | null>(null);
  $effect(() => { void stepSide; void pieces; selected = null; dragging = null; hoveredCell = null; haulAsk = null; });

  const units = $derived(game.setup.units);
  const emplacements = $derived(game.setup.emplacements);
  const board = $derived(game.setup.board!);
  const myUnits = $derived(units.filter((u) => u.side === side));
  // Each step lists its own kind of piece; the other kind still stands on the board.
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


  // An engine under a unit shows as that unit's badge.
  const crewedSquares = $derived(new Set(units.map((u) => u.square)));
  const tokens = $derived.by<TokenModel[]>(() => [
    ...units.flatMap((u) => u.square ? [{
      kind: 'unit' as const,
      id: u.id,
      side: u.side,
      name: u.card.name,
      role: u.card.role,
      level: u.card.level,
      cell: u.square,
      wounds: 0,
      disorder: 0,
      engine: (engineUnder(game.setup, u) ?? u.engines[0])?.name ?? null,
      verdict: null,
      statuses: [],
      pick: null,
      ring: selected?.kind === 'unit' && selected.id === u.id ? 'selected' as const : null,
    }] : []),
    ...emplacements.flatMap((e) => e.square && !crewedSquares.has(e.square) ? [{
      kind: 'engine' as const,
      id: e.id,
      side: e.side,
      name: e.name,
      cell: e.square,
      ring: selected?.kind === 'engine' && selected.id === e.id ? 'selected' as const : null,
    }] : []),
  ]);

  async function add(card: UnitCard) {
    const result = await addUnit(side, card);
    if (result.ok) selected = lastPick('unit');
  }

  /** Take a piece out of the force. The tray loses it, so nothing stays selected. */
  function drop(p: PieceRef) {
    selected = null;
    return p.kind === 'unit' ? removeUnit(p.id) : removeEmplacement(p.id);
  }

  const pieceAt = (p: PieceRef): SetupUnit | SetupEngine | undefined => pieceOf(game.setup, p);

  /** The emplacement a unit was just put on, while the player decides whether it hauls it. */
  let haulAsk = $state<string | null>(null);
  const haulEngine = $derived(emplacements.find((e) => e.id === haulAsk) ?? null);
  const haulUnit = $derived(haulEngine ? units.find((u) => u.square === haulEngine.square) ?? null : null);

  /** A unit put on an engine works it; one that can move asks about hauling. */
  async function put(p: PieceRef, cell: string) {
    const result = await placePiece(p, cell);
    if (!result.ok || p.kind !== 'unit') return result;
    const unit = pieceAt(p) as SetupUnit | undefined;
    const under = unit && engineUnder(game.setup, unit);
    if (under && canHaul(under)) haulAsk = under.id;
    return result;
  }

  async function answerHaul(hauling: boolean) {
    const id = haulAsk;
    haulAsk = null;
    if (id && hauling) await setHauling(id, true);
  }

  /** Put the selected piece down, then jump to this side's next unplaced piece. */
  async function placeOn(n: string) {
    if (!selected || !legalCells.has(n)) return;
    const result = await put(selected, n);
    if (result.ok) selected = nextUnplaced();
  }

  async function placeAuto(p: PieceRef) {
    const result = await autoPlacePiece(p);
    if (result.ok) selected = nextUnplaced();
  }

  function nextUnplaced(): PieceRef | null {
    const u = mine.find((u) => u.square === null);
    if (u) return { kind: 'unit', id: u.id };
    const e = myEngines.find((e) => e.square === null);
    return e ? { kind: 'engine', id: e.id } : null;
  }

  /** The piece a command just appended: the service mints its ID, so the tray names it back. */
  function lastPick(kind: 'unit' | 'engine'): PieceRef | null {
    const piece = (kind === 'unit' ? mine : myEngines).at(-1);
    return piece ? { kind, id: piece.id } : null;
  }

  /** A token carries its piece's own ID, so the kind comes from which list holds it. */
  const pickOf = (id: string): PieceRef =>
    ({ kind: units.some((u) => u.id === id) ? 'unit' : 'engine', id });

  function onCell(e: BoardEventOf<'cell'>) { void placeOn(e.cell); }
  function onToken(e: BoardEventOf<'token'>) {
    const p = pickOf(e.id);
    if (!mayMove(p)) return;
    selected = p;
  }

  /** Only this step's own pieces answer: the rest are there to deploy against. */
  function mayMove(p: PieceRef): boolean {
    if ((p.kind === 'engine') !== siege) return false;
    return siege || pieceAt(p)?.side === side;
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
    if (e.cell === null) return;
    const p = pickOf(e.id);
    if (!mayMove(p)) return;
    selected = p;
    hoveredCell = e.cell;
  }

  function onTrayDragStart(p: PieceRef, e: DragEvent) {
    e.dataTransfer?.setData('text/plain', p.id);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      // Dragging the icon carries the miniature already; dragging the rest of the row would
      // otherwise carry a snapshot of the whole card.
      const icon = (e.currentTarget as HTMLElement).querySelector('img');
      if (icon && e.target !== icon) e.dataTransfer.setDragImage(icon, icon.width / 2, icon.height / 2);
    }
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

  const STAT_LABEL: Record<string, string> = { strike: 'Strike', volley: 'Volley', defence: 'Def', will: 'Will', reflex: 'Ref', perception: 'Per' };

  let engineName = $state(ENGINES.find((e) => e.name === 'Catapult')?.name ?? ENGINES[0].name);
  async function addEngine() {
    const result = await addEmplacement(side, engineName);
    if (result.ok) selected = lastPick('engine');
  }

  async function generate() {
    const result = await generateForce(side);
    if (result.ok) selected = nextUnplaced();
  }

  const deployNote = (u: SetupUnit) => {
    const ranks = deployRanks(u.side, isAmbush(u), game.setup.board?.squares.length).map((r) => r + 1);
    return `ranks ${Math.min(...ranks)}–${Math.max(...ranks)}`;
  };
  const engineCard = (name: string) => ENGINES.find((e) => e.name === name);
  const sideWord = $derived(side === 'attacker' ? 'attacking' : 'defending');
  const unplaced = $derived(mine.filter((u) => !u.square).length + myEngines.filter((e) => !e.square).length);

  // Derived, so the board's effects rerun when the cells change and at no other time.
  const highlights = $derived([
    { style: 'deploy' as const, cells: highlightCells },
    { style: 'invalid' as const, cells: invalidCell ? [invalidCell] : [] },
  ]);

  presentStage({
    get leftTitle() { return siege ? 'Siege engines' : `${sideWord} army`; },
    leftWidth: 26,
    get top() { return top; }, get rail() { return rail; }, get modal() { return modal; }, get float() { return float; }, get left() { return left; },
    get board() {
      return {
        board, tokens, mode: 'place' as const, highlights,
        onhover: (e: BoardEventOf<'hover'>) => { hoveredCell = e.cell; }, ondrag: onTokenDrag,
        ontrayhover: (cell: string | null) => { hoveredCell = cell; },
        oncell: onCell, ontoken: onToken, ondrop: onTokenDrop, ontraydrop: onTrayDrop,
        terrainAppearance: gameMap.terrainAppearance, inkMap: gameMap.inkMap,
      };
    },
  });
</script>

{#snippet grip(label: string)}
  <span class="grip" role="presentation" title={`Drag ${label} onto the board`}></span>
{/snippet}

{#snippet statBlock(card: UnitCard)}
  <dl class="stats">
    {#each derivation(card) as d (d.stat)}
      <div class="statcell" title={d.from}>
        <dt>{STAT_LABEL[d.stat]}</dt>
        <dd>{d.value}</dd>
      </div>
    {/each}
  </dl>
{/snippet}

{#snippet sheetLines(card: UnitCard)}
  {@const sh = card.sheet}
  <p class="line">
    {#if sh}
      AC {sh.ac} · HP {sh.hp} · Battle DC {sh.battleDc} · Salvo {sh.salvoDc === null ? '—' : `DC ${sh.salvoDc} (${sh.salvoFeet} ft)`} · Fort +{sh.fortitude}{sh.fly ? ' · flies' : ''}
    {:else}
      No sheet — a generic card off the level table
    {/if}
  </p>
  <p class="line">{paceReason(card)}</p>
{/snippet}

{#snippet engineOptions()}
  {#each ENGINES as e (e.name)}<option value={e.name}>{e.name} · L{e.level} {e.kind}{e.reach ? ' ' + e.reach : ''} +{e.launch}</option>{/each}
{/snippet}

{#snippet top()}
  <TopBar>
    {#snippet status()}
      {#if unplaced}
        <strong>{unplaced}</strong> still to place — drag one onto a lit square, or press Place.
      {:else}
        {siege && !myEngines.length ? 'Siege engines are optional. Add one, or go on to the armies.' : 'Every piece is placed. Drag a token — or its card — to move it.'}
      {/if}
    {/snippet}
  </TopBar>
{/snippet}

{#snippet rail()}<WizardRail />{/snippet}

{#snippet modal()}
  {#if picking}<TroopPicker {side} {held} add={(card) => void add(card)} close={() => (picking = false)} />{/if}
  {#if haulEngine && haulUnit}
    <div class="scrim" role="presentation">
      <div class="ask" role="dialog" aria-modal="true" aria-label="Haul the engine" style:--side={haulUnit.side === 'attacker' ? 'var(--att)' : 'var(--def)'}>
        <h2>{haulUnit.card.name} stands on the {haulEngine.name}</h2>
        <p>The unit works the engine from this square. Hauling takes the engine along when the unit moves, at the slower of the two speeds.</p>
        <div class="row">
          <button class="primary" onclick={() => void answerHaul(true)}>Haul it</button>
          <button onclick={() => void answerHaul(false)}>Work it in place</button>
        </div>
      </div>
    </div>
  {/if}
{/snippet}

{#snippet float()}
  <MapControls
    board={stage.board}
    army={() => [...mine.map((u) => u.square), ...myEngines.map((e) => e.square)].filter((sq) => sq !== null)}
    armyLabel={siege ? 'Frame the engines' : `Frame the ${sideWord} force`}
  />
{/snippet}

{#snippet left()}
  {#if siege}
    <div class="card">
      <div class="row">
        <select bind:value={engineName}>{@render engineOptions()}</select>
        <button onclick={addEngine}>Add engine</button>
      </div>
      <p class="muted">
        An emplaced engine stands on any dry hex and belongs to neither army. The unit deployed
        on or beside it claims it and works it; after that, an engine left with only the enemy
        beside it changes hands at the end of the round.
      </p>
    </div>
  {:else}
    <div class="card">
      <div class="row">
        <button class="primary" onclick={() => (picking = true)}>Choose troops…</button>
        <button onclick={generate}>Generate the {sideWord} army</button>
      </div>
      <p class="muted">Put a unit on an engine to claim and work it; an engine that can move may be hauled.</p>
    </div>
  {/if}

  {#if siege}
    <h3>Engines</h3>
  {:else}
    <h3 class={side === 'attacker' ? 'side-att' : 'side-def'}>{side === 'attacker' ? 'Attackers' : 'Defenders'}</h3>
  {/if}
  <div class="unitlist" style:--side={siege ? 'var(--muted)' : side === 'attacker' ? 'var(--att)' : 'var(--def)'}>
    {#each mine as u (u.id)}
      {@const p = { kind: 'unit' as const, id: u.id }}
      {@const under = engineUnder(game.setup, u)}
      <div
        class="piece"
        class:sel={selected?.kind === 'unit' && selected.id === u.id}
        class:down={!!u.square}
        class:lift={dragging?.kind === 'unit' && dragging.id === u.id}
        role="button"
        tabindex="0"
        draggable="true"
        ondragstart={(e) => onTrayDragStart(p, e)}
        ondragend={onTrayDragEnd}
        onclick={() => (selected = p)}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selected = p; } }}
      >
        <div class="head">
          {@render grip(u.card.name)}
          <div class="title">
            <h4 class="name">{u.card.name}</h4>
            <p class="meta">{u.card.role}{u.card.tactics?.length ? ' · ' + u.card.tactics.join(' · ') : ''}</p>
          </div>
          <button class="kill" onclick={(ev) => { ev.stopPropagation(); drop(p); }} title="Take out of the force" aria-label="Remove {u.card.name}">×</button>
        </div>

        {@render statBlock(u.card)}

        <div class="plate">
          <div class="portrait">
            <img src={troopArtUrl(u.card.name, u.card.role)} alt="" />
            <span class="level">{u.card.level}</span>
          </div>
          {#if u.square}
            <button class="deploy set" onclick={(ev) => { ev.stopPropagation(); unplacePiece(p); }} title="Take it off the board">{u.square}<span class="undo">↩</span></button>
          {:else}
            <button class="deploy" disabled={!autoCell(game.setup, p)} onclick={(ev) => { ev.stopPropagation(); placeAuto(p); }} title={`Put it on the board · ${deployNote(u)}`}>Place</button>
          {/if}
        </div>

        <div class="details">
          {@render sheetLines(u.card)}
          <p class="line where">{u.square ? `Standing on ${u.square}` : `Off the board · deploys on ${deployNote(u)}`}</p>
          {#each u.engines as e (e.id)}
            <p class="line">⚙ {e.name} rides along</p>
          {/each}
          {#if under}
            <p class="line">
              ⚙ {under.hauled ? 'Hauls' : 'Works'} the {under.name}
              {#if canHaul(under)}
                <button class="inline" onclick={(ev) => { ev.stopPropagation(); void setHauling(under.id, !under.hauled); }}>{under.hauled ? 'Work it in place' : 'Haul it'}</button>
              {/if}
            </p>
          {/if}
        </div>
      </div>
    {:else}
      {#if !siege}<p class="muted">No units yet. Choose troops, or generate an army.</p>{/if}
    {/each}

    {#each myEngines as e (e.id)}
      {@const c = engineCard(e.name)}
      {@const art = engineArtUrl(e.name)}
      {@const p = { kind: 'engine' as const, id: e.id }}
      <div
        class="piece engine"
        class:sel={selected?.kind === 'engine' && selected.id === e.id}
        class:down={!!e.square}
        class:lift={dragging?.kind === 'engine' && dragging.id === e.id}
        role="button"
        tabindex="0"
        draggable="true"
        ondragstart={(ev) => onTrayDragStart(p, ev)}
        ondragend={onTrayDragEnd}
        onclick={() => (selected = p)}
        onkeydown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selected = p; } }}
      >
        <div class="head">
          {@render grip(e.name)}
          <div class="title">
            <h4 class="name">{e.name}</h4>
            <p class="meta">emplacement{c ? ` · ${c.kind}` : ''}</p>
          </div>
          <button class="kill" onclick={(ev) => { ev.stopPropagation(); drop(p); }} title="Take out of the force" aria-label="Remove {e.name}">×</button>
        </div>

        {#if c}
          <dl class="stats">
            <div class="statcell"><dt>Launch</dt><dd>+{c.launch}</dd></div>
            <div class="statcell"><dt>Def</dt><dd>{c.defence}</dd></div>
            <div class="statcell"><dt>Reach</dt><dd>{c.reach ?? '—'}</dd></div>
          </dl>
        {/if}

        <div class="plate">
          <div class="portrait">
            {#if art}<img src={art} alt="" />{:else}<span class="cog">⚙</span>{/if}
            {#if c}<span class="level">{c.level}</span>{/if}
          </div>
          {#if e.square}
            <button class="deploy set" onclick={(ev) => { ev.stopPropagation(); unplacePiece(p); }} title="Take it off the board">{e.square}<span class="undo">↩</span></button>
          {:else}
            <button class="deploy" disabled={!autoCell(game.setup, p)} onclick={(ev) => { ev.stopPropagation(); placeAuto(p); }} title="Put it on the board">Place</button>
          {/if}
        </div>

        <div class="details">
          <p class="line where">{e.square ? `Emplaced on ${e.square}${e.hauled ? ' · hauled by the unit on it' : ''}` : 'Off the board · holds the square it stands on'}</p>
        </div>
      </div>
    {/each}
  </div>

  <div class="row">
    <button onclick={() => void resetToExample()}>Reset to the example</button>
  </div>
{/snippet}

<style>
  /* The longest engine name is wider than the dock, and a select sizes to its longest option. */
  .card .row select { flex: 1 1 10rem; min-width: 0; }
  .scrim { position: absolute; inset: 0; display: grid; place-items: center; padding: 2rem; background: rgba(0, 0, 0, .45); }
  .ask {
    width: min(26rem, 100%); padding: 1rem 1.1rem; background: var(--paper); border: 1px solid var(--rule);
    border-top: 4px solid var(--side); border-radius: 10px; box-shadow: 0 12px 40px rgba(0, 0, 0, .45);
  }
  .ask h2 { margin: 0 0 .4rem; border: 0; padding: 0; font-size: 1.05rem; }

  /* The card. A piece off the board is a card still in hand: dashed edge, hatched paper. Put
     it down and the card goes solid, with its square stamped under the portrait. */
  .piece {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 4.9rem;
    grid-template-areas: 'head plate' 'stats plate' 'details details';
    column-gap: .65rem;
    padding: .5rem .6rem .45rem .75rem;
    background-color: color-mix(in srgb, var(--side) 22%, var(--card));
    background-image: linear-gradient(to right, color-mix(in srgb, var(--side) 16%, transparent), transparent 60%);
    border: 1px solid color-mix(in srgb, var(--side) 55%, var(--rule));
    border-radius: 8px;
    cursor: grab;
    transition: border-color .15s, box-shadow .15s, opacity .15s;
  }
  .piece::before {
    content: '';
    position: absolute;
    inset: -1px auto -1px -1px;
    width: 4px;
    border-radius: 8px 0 0 8px;
    background: var(--side);
  }
  .piece:not(.down) {
    border-style: dashed;
    background-image:
      repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in srgb, var(--side) 30%, transparent) 7px 8px),
      linear-gradient(to right, color-mix(in srgb, var(--side) 16%, transparent), transparent 60%);
  }
  .piece:hover { border-color: var(--hi); }
  .piece.sel { border-color: var(--hi); box-shadow: 0 0 0 2px var(--hi); }
  .piece.lift { opacity: .4; }
  .piece:active { cursor: grabbing; }

  /* An emplacement's rail is broken: it holds a square rather than marching off one. */
  .piece.engine::before { background: repeating-linear-gradient(to bottom, var(--side) 0 5px, transparent 5px 9px); }

  .head { grid-area: head; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: .4rem; }
  .unitlist { gap: .5rem; --hi: color-mix(in srgb, var(--side) 65%, var(--ink)); }
  .grip {
    display: block;
    width: .6rem; height: 1.05rem; margin-top: .15rem; align-self: center;
    background-image: radial-gradient(currentColor .9px, transparent 1px);
    background-size: .3rem .3rem;
    color: var(--rule);
    cursor: grab;
  }
  .piece:hover .grip { color: var(--hi); }
  .name { margin: 0; font-size: .95rem; font-weight: 600; line-height: 1.15; }
  .meta { margin: .1rem 0 0; font-size: .62rem; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }

  .stats { grid-area: stats; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .3rem .4rem; margin: .5rem 0 0; }
  .statcell { min-width: 0; border-left: 1px solid color-mix(in srgb, var(--side) 60%, transparent); padding-left: .35rem; }
  .statcell dt { font-size: .55rem; letter-spacing: .11em; text-transform: uppercase; color: var(--muted); }
  .statcell dd { margin: 0; font-size: .92rem; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .plate { grid-area: plate; display: flex; flex-direction: column; gap: .3rem; }
  /* The miniature stands on the card itself: the art is cut out, so a plate behind it would
     only put a box round a piece that has none on the board. */
  .portrait { position: relative; aspect-ratio: 1; display: grid; place-items: center; }
  .portrait img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .portrait .cog { font-size: 1.6rem; color: var(--muted); }
  .level {
    position: absolute; top: 0; right: 0; min-width: 1.15rem; padding: .05rem .2rem;
    font-size: .68rem; font-weight: 700; text-align: center; font-variant-numeric: tabular-nums;
    color: var(--paper); background: var(--side); border-radius: 4px;
  }
  .deploy { width: 100%; padding: .2rem .1rem; font-size: .8rem; border-radius: 5px; font-variant-numeric: tabular-nums; }
  .deploy:not(.set) { color: var(--hi); border-color: var(--hi); font-weight: 600; }
  .deploy:hover:not(:disabled) { border-color: var(--hi); }
  .deploy.set { color: var(--muted); }
  .undo { margin-left: .25rem; opacity: .35; }
  .deploy.set:hover .undo { opacity: 1; }

  .details { grid-area: details; margin-top: .5rem; padding-top: .35rem; border-top: 1px solid color-mix(in srgb, var(--side) 55%, transparent); }
  .line { margin: 0; font-size: .72rem; line-height: 1.4; color: var(--muted); font-variant-numeric: tabular-nums; }
  .where { color: var(--ink); }
  .piece:not(.down) .where { font-style: italic; color: var(--muted); }


  .kill { border: 0; background: none; color: var(--muted); padding: 0 .2rem; font-size: 1rem; line-height: 1; opacity: .5; }
  .kill:hover:not(:disabled) { color: var(--bad); opacity: 1; border-color: transparent; }
  .line .inline { font-size: .75rem; padding: .05rem .4rem; margin-left: .3rem; }
</style>
