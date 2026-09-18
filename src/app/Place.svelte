<script lang="ts">
  import { COMBATANTS, deployRanks, ENGINES, derivation, OFFICIAL, paceReason, ROSTER, type Side, type UnitCard } from '../engine/index.js';
  import { engineArtUrl, troopArtUrl, type BoardEventOf, type TokenModel } from '../board/index.js';
  import PixiBoard from './PixiBoard.svelte';
  import { gameMap } from './map-style.svelte.js';
  import { AppShell, MapControls, TopBar } from './shell/index.js';
  import StageNav from './StageNav.svelte';
  import {
    addEmplacement, addUnit, attachEquipment, autoPlacePiece, declaredReady, declareReady, detachEquipment,
    game, generateForce, placePiece, removeEmplacement, removeUnit, unplacePiece, type SetupEngine, type SetupUnit,
  } from './game.svelte.js';
  import { resetToExample } from './navigation.svelte.js';
  import { autoCell, cellsFor, deployableCells, isAmbush, pieceOf } from '../services/ArmyPreparationService.js';
  import type { PieceRef } from '../runtime/commands.js';
  import { onDestroy } from 'svelte';
  import { useNotifications } from './notification-context.js';
  import { commandReporter, COMMAND_NOTICE } from './command-notices.js';

  interface Props { side: Side }
  let { side }: Props = $props();

  const notifications = useNotifications();
  const run = commandReporter(notifications);
  onDestroy(() => notifications.dismiss(COMMAND_NOTICE));

  let rosterName = $state(COMBATANTS[0].name);
  const library = [...COMBATANTS, ...OFFICIAL, ...ROSTER];

  /** What the sidebar has picked up: one of this side's units, or one of its emplacements. */
  let selected = $state<PieceRef | null>(null);
  // Set on a tray item's dragstart, read back from DataTransfer on drop — dragstart is the
  // only point a native drag gives Svelte a hook, so it also drives the live deploy-wash
  // highlight during that drag.
  let dragging = $state<PieceRef | null>(null);

  const units = $derived(game.setup.units);
  const emplacements = $derived(game.setup.emplacements);
  const board = $derived(game.setup.board!);
  const mine = $derived(units.filter((u) => u.side === side));
  const myEngines = $derived(emplacements.filter((e) => e.side === side));

  // A selected piece deploys on its own side's ranks; with nothing selected the wash shows
  // this stage's side, so the player always sees where its next unit may go.
  const picked = $derived(selected?.kind === 'unit' ? units.find((u) => u.id === selected!.id) ?? null : null);
  const pickedAmbush = $derived(picked ? isAmbush(picked) : false);

  const highlightCells = $derived(deployableCells(game.setup, side, pickedAmbush, selected));
  const highlight = $derived(new Set(highlightCells));

  let boardRef = $state<PixiBoard>();

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
      engine: u.engines[0]?.name ?? null,
      prop: null,
      pick: null,
      ring: selected?.kind === 'unit' && selected.id === u.id ? 'selected' as const : null,
    }] : []),
    ...emplacements.flatMap((e) => e.square ? [{
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

  /** Put the selected piece down, then jump to this side's next unplaced piece. */
  async function placeOn(n: string) {
    if (!selected || !highlight.has(n)) return;
    const result = await placePiece(selected, n);
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
    // Only this stage's own pieces answer: the other side's tokens are there to deploy
    // against, not to move.
    if (pieceAt(p)?.side === side) selected = p;
  }

  // A board-internal drag of an already-placed token. Validated against that piece's own
  // side/ambush ranks (not `highlight`, which follows the sidebar and may be stale mid-drag):
  // an invalid or occupied drop is a no-op, so the token stays put and TokenLayer's next
  // render snaps it back on its own.
  function onTokenDrop(e: BoardEventOf<'drop'>) {
    const p = pickOf(e.id);
    const piece = pieceAt(p);
    if (!piece || piece.side !== side) return;
    if (!cellsFor(game.setup, p).includes(e.cell)) return;
    void placePiece(p, e.cell);
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
    if (cell === null || !p || !pieceAt(p) || !highlight.has(cell)) return;
    void placePiece(p, cell);
  }

  const STAT_LABEL: Record<string, string> = { strike: 'Strike', volley: 'Volley', defence: 'Def', will: 'Will', reflex: 'Ref', perception: 'Per' };

  let engineName = $state(ENGINES.find((e) => e.name === 'Catapult')?.name ?? ENGINES[0].name);
  // 'emplace' drops the engine on a square of its own; anything else is a unit index and the
  // engine rides with that unit instead.
  let engineHost = $state<string>('emplace');
  async function addEngine() {
    if (engineHost !== 'emplace') return void attachEquipment(engineHost, engineName);
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
  const other = $derived<Side>(side === 'attacker' ? 'defender' : 'attacker');
  const otherWord = $derived(other === 'attacker' ? 'attacking' : 'defending');
  // proto: the readiness wording is reserved for review with the rest of the player-facing text.
  const ready = $derived(declaredReady(side));
  const otherReady = $derived(declaredReady(other));
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

<AppShell leftTitle="{sideWord} force" leftWidth={26}>
  {#snippet top()}
    <TopBar>
      {#snippet status()}
        {#if unplaced}
          <strong>{unplaced}</strong> still to place — drag one onto a lit square, or press Place.
        {:else}
          Every piece is placed. Drag a token — or its card — to move it.
        {/if}
      {/snippet}
      {#snippet tools()}<StageNav />{/snippet}
    </TopBar>
  {/snippet}

  {#snippet float()}
    <MapControls
      board={boardRef}
      army={() => [...mine.map((u) => u.square), ...myEngines.map((e) => e.square)].filter((sq) => sq !== null)}
      armyLabel="Frame the {sideWord} force"
    />
  {/snippet}

  {#snippet map()}
    <PixiBoard bind:this={boardRef} {board} {tokens} mode="place" fill highlights={[{ style: 'deploy', cells: highlightCells }]} oncell={onCell} ontoken={onToken} ondrop={onTokenDrop} ontraydrop={onTrayDrop}
      terrainAppearance={gameMap.terrainAppearance} inkMap={gameMap.inkMap} />
  {/snippet}

  {#snippet left()}
    <div class="card">
      <div class="row">
        <select bind:value={rosterName}>
          <optgroup label="Reignmaker troops">
            {#each COMBATANTS as c (c.name)}<option value={c.name}>{c.name} · L{c.level} {c.role}</option>{/each}
          </optgroup>
          <optgroup label="Official Pathfinder troops">
            {#each OFFICIAL as c (c.name)}<option value={c.name}>{c.name} · L{c.level} {c.role}</option>{/each}
          </optgroup>
          <optgroup label="Generic roster">
            {#each ROSTER as c (c.name)}<option value={c.name}>{c.name} · L{c.level} {c.role}</option>{/each}
          </optgroup>
        </select>
        <button onclick={() => add(library.find((c) => c.name === rosterName)!)}>Add</button>
        <button onclick={generate}>Generate the {sideWord} force</button>
      </div>
      <div class="row" style="margin-top:.5rem">
        <select bind:value={engineName}>{#each ENGINES as e (e.name)}<option value={e.name}>{e.name} · L{e.level} {e.kind}{e.reach ? ' ' + e.reach : ''} +{e.launch}</option>{/each}</select>
        <select bind:value={engineHost}>
          <option value="emplace">on its own square</option>
          {#each mine as u (u.id)}<option value={u.id}>with {u.card.name}</option>{/each}
        </select>
        <button onclick={addEngine}>Add engine</button>
      </div>
      <p class="muted">
        An emplaced engine holds its square. Any unit of yours standing on or beside it works
        it; leave it alone and the enemy takes it at the end of the round. One attached to a
        unit rides along and is lost only with that unit.
      </p>
    </div>

    <h3 class={side === 'attacker' ? 'side-att' : 'side-def'}>{side === 'attacker' ? 'Attackers' : 'Defenders'}</h3>
    <div class="unitlist" style:--side={side === 'attacker' ? 'var(--att)' : 'var(--def)'}>
      {#each mine as u (u.id)}
        {@const p = { kind: 'unit' as const, id: u.id }}
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
              <p class="line">⚙ {e.name} rides along <button class="kill inline" onclick={(ev) => { ev.stopPropagation(); detachEquipment(u.id, e.id); }} title="Leave the engine behind" aria-label="Detach {e.name}">×</button></p>
            {/each}
          </div>
        </div>
      {:else}
        <p class="muted">No units yet. Add one from the roster, or generate a force.</p>
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
            <p class="line where">{e.square ? `Emplaced on ${e.square}` : 'Off the board · holds the square it stands on'}</p>
          </div>
        </div>
      {/each}
    </div>

    <div class="readiness">
      <button
        class="primary" class:selected={ready}
        disabled={!ready && unplaced > 0}
        onclick={() => void run(declareReady(side, !ready))}
      >{ready ? 'Ready — waiting for the other army' : `The ${sideWord} force is ready`}</button>
      <small>{otherReady ? `The ${otherWord} force is ready.` : `The ${otherWord} force is still forming up.`}</small>
    </div>

    <div class="row">
      <button onclick={() => void resetToExample()}>Reset to the example</button>
    </div>
  {/snippet}
</AppShell>

<style>

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

  .readiness { display: flex; flex-direction: column; gap: .3rem; margin-top: .6rem; }
  .readiness button.selected { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--card)); }
  .readiness small { font-size: .75rem; color: var(--muted); }

  .kill { border: 0; background: none; color: var(--muted); padding: 0 .2rem; font-size: 1rem; line-height: 1; opacity: .5; }
  .kill:hover:not(:disabled) { color: var(--bad); opacity: 1; border-color: transparent; }
  .kill.inline { font-size: .8rem; }
</style>
