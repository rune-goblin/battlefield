<script lang="ts">
  import { at, COMBATANTS, deployRanks, ENGINES, derivation, generateForce, gridOf, notation, OFFICIAL, paceReason, parse, RADIUS, seededRandom, ROSTER, SIZE, type Side, type Square, type UnitCard } from '../engine/index.js';
  import { engineArtUrl, troopArtUrl, type BoardEventOf, type TokenModel } from '../board/index.js';
  import PixiBoard from './PixiBoard.svelte';
  import { gameMap } from './map-style.svelte.js';
  import { AppShell, MapControls, TopBar } from './shell/index.js';
  import StageNav from './StageNav.svelte';
  import { game, resetSetup, save, type SetupUnit } from './game.svelte.js';

  interface Props { side: Side }
  let { side }: Props = $props();

  let rosterName = $state(COMBATANTS[0].name);
  const library = [...COMBATANTS, ...OFFICIAL, ...ROSTER];

  /** What the sidebar has picked up: one of this side's units, or one of its emplacements. */
  type Pick = { kind: 'unit' | 'engine'; i: number };
  let selected = $state<Pick | null>(null);
  // Set on a tray item's dragstart, read back from DataTransfer on drop — dragstart is the
  // only point a native drag gives Svelte a hook, so it also drives the live deploy-wash
  // highlight during that drag.
  let dragging = $state<Pick | null>(null);

  const units = $derived(game.setup.units);
  const emplacements = $derived(game.setup.emplacements);
  const board = $derived(game.setup.board!);
  const mine = $derived(units.map((u, i) => ({ u, i })).filter(({ u }) => u.side === side));
  const myEngines = $derived(emplacements.map((e, i) => ({ e, i })).filter(({ e }) => e.side === side));
  const ambush = (u: SetupUnit) => (u.card.tactics ?? []).includes('ambush');

  // A selected piece deploys on its own side's ranks; with nothing selected the wash shows
  // this stage's side, so the player always sees where its next unit may go.
  const picked = $derived(selected?.kind === 'unit' ? units[selected.i] : null);
  const pickedAmbush = $derived(picked ? ambush(picked) : false);

  // Every square something already stands on, whichever side owns it — two pieces never
  // share a square at deployment, so the wash is the same set for units and engines alike.
  function occupied(exclude: Pick | null): Set<string> {
    const out = new Set<string>();
    units.forEach((u, i) => { if (u.square && !(exclude?.kind === 'unit' && exclude.i === i)) out.add(u.square); });
    emplacements.forEach((e, i) => { if (e.square && !(exclude?.kind === 'engine' && exclude.i === i)) out.add(e.square); });
    return out;
  }

  /** The open deploy-rank cells for one piece — excluding its own square lets a placed,
   * selected piece's current square count as a destination, which a token move needs. */
  function deployCells(forSide: Side, forAmbush: boolean, exclude: Pick | null): Set<string> {
    const taken = occupied(exclude);
    const ranks = new Set(deployRanks(forSide, forAmbush));
    const out = new Set<string>();
    for (const sq of gridOf(board).cells()) {
      if (!ranks.has(sq.rank)) continue;
      const n = notation(sq);
      if (at(board, sq).terrain !== 'water' && !taken.has(n)) out.add(n);
    }
    return out;
  }
  const highlight = $derived(deployCells(side, pickedAmbush, selected));
  const highlightCells = $derived([...highlight]);

  let boardRef = $state<PixiBoard>();

  const tokens = $derived.by<TokenModel[]>(() => [
    ...units.flatMap((u, i) => u.square ? [{
      kind: 'unit' as const,
      id: `u${i}`,
      side: u.side,
      name: u.card.name,
      role: u.card.role,
      level: u.card.level,
      cell: u.square,
      wounds: 0,
      disorder: 0,
      engine: u.engines[0] ?? null,
      prop: null,
      pick: null,
      ring: selected?.kind === 'unit' && selected.i === i ? 'selected' as const : null,
    }] : []),
    ...emplacements.flatMap((e, i) => e.square ? [{
      kind: 'engine' as const,
      id: `e${i}`,
      side: e.side,
      name: e.name,
      cell: e.square,
      ring: selected?.kind === 'engine' && selected.i === i ? 'selected' as const : null,
    }] : []),
  ]);

  const wallsTier = $derived(Math.max(-1, ...Object.values(board.walls).map((w) => w.tier)) + 1);

  function add(card: UnitCard) {
    units.push({ card: structuredClone($state.snapshot(card)), side, square: null, engines: [] });
    selected = { kind: 'unit', i: units.length - 1 };
    save();
  }

  function removeUnit(i: number) {
    units.splice(i, 1);
    selected = null;
    save();
  }
  function removeEmplacement(i: number) {
    emplacements.splice(i, 1);
    selected = null;
    save();
  }
  function unplace(p: Pick) {
    if (p.kind === 'unit') units[p.i].square = null;
    else emplacements[p.i].square = null;
    save();
  }

  const pieceAt = (p: Pick) => (p.kind === 'unit' ? units[p.i] : emplacements[p.i]);

  /** Put the selected piece down, then jump to this side's next unplaced piece. */
  function placeOn(n: string) {
    if (!selected || !pieceAt(selected) || !highlight.has(n)) return;
    pieceAt(selected).square = n;
    selected = nextUnplaced();
    save();
  }
  /** Where the Place button puts a piece: nearest its own edge, then nearest the centre file. */
  function autoCell(p: Pick): string | null {
    const piece = pieceAt(p);
    if (!piece) return null;
    const forAmbush = p.kind === 'unit' && ambush(piece as SetupUnit);
    const open = [...deployCells(piece.side, forAmbush, p)].map(parse);
    if (!open.length) return null;
    const home = (c: Square) => (piece.side === 'attacker' ? c.rank : SIZE - 1 - c.rank);
    open.sort((a, b) => home(a) - home(b) || Math.abs(a.file - RADIUS) - Math.abs(b.file - RADIUS));
    return notation(open[0]);
  }

  function placeAuto(p: Pick) {
    const cell = autoCell(p);
    if (!cell || !pieceAt(p)) return;
    pieceAt(p).square = cell;
    selected = nextUnplaced();
    save();
  }

  function nextUnplaced(): Pick | null {
    const u = mine.find(({ u }) => u.square === null);
    if (u) return { kind: 'unit', i: u.i };
    const e = myEngines.find(({ e }) => e.square === null);
    return e ? { kind: 'engine', i: e.i } : null;
  }

  const idOf = (p: Pick) => `${p.kind === 'unit' ? 'u' : 'e'}${p.i}`;
  const pickOf = (id: string): Pick => ({ kind: id[0] === 'u' ? 'unit' : 'engine', i: Number(id.slice(1)) });

  function onCell(e: BoardEventOf<'cell'>) { placeOn(e.cell); }
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
    const forAmbush = p.kind === 'unit' && ambush(piece as SetupUnit);
    if (!deployCells(piece.side, forAmbush, p).has(e.cell)) return;
    piece.square = e.cell;
    save();
  }

  function onTrayDragStart(p: Pick, e: DragEvent) {
    e.dataTransfer?.setData('text/plain', idOf(p));
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
    pieceAt(p).square = cell;
    save();
  }

  const STAT_LABEL: Record<string, string> = { strike: 'Strike', volley: 'Volley', defence: 'Def', will: 'Will', reflex: 'Ref', perception: 'Per' };

  let engineName = $state(ENGINES.find((e) => e.name === 'Catapult')?.name ?? ENGINES[0].name);
  // 'emplace' drops the engine on a square of its own; anything else is a unit index and the
  // engine rides with that unit instead.
  let engineHost = $state<string>('emplace');
  function addEngine() {
    if (engineHost === 'emplace') {
      emplacements.push({ name: engineName, side, square: null });
      selected = { kind: 'engine', i: emplacements.length - 1 };
    } else {
      units[Number(engineHost)]?.engines.push(engineName);
    }
    save();
  }
  function detach(u: SetupUnit, i: number) { u.engines.splice(i, 1); save(); }

  function generate() {
    const other: Side = side === 'attacker' ? 'defender' : 'attacker';
    const opponentCards = units.filter((u) => u.side === other).map((u) => $state.snapshot(u.card) as UnitCard);
    const force = generateForce(opponentCards, seededRandom(Math.floor(Math.random() * 1e9)), { attacking: side === 'attacker', wallsTier });
    for (let i = units.length - 1; i >= 0; i--) if (units[i].side === side) units.splice(i, 1);
    for (const { card, engine } of force) units.push({ card: structuredClone(card), side, square: null, engines: engine ? [engine.name] : [] });
    selected = nextUnplaced();
    save();
  }

  const deployNote = (u: SetupUnit) => {
    const ranks = deployRanks(u.side, ambush(u)).map((r) => r + 1);
    return `ranks ${Math.min(...ranks)}–${Math.max(...ranks)}`;
  };
  const engineCard = (name: string) => ENGINES.find((e) => e.name === name);
  const sideWord = $derived(side === 'attacker' ? 'attacking' : 'defending');
  const unplaced = $derived(mine.filter(({ u }) => !u.square).length + myEngines.filter(({ e }) => !e.square).length);
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
      army={() => [...mine.map(({ u }) => u.square), ...myEngines.map(({ e }) => e.square)].filter((sq) => sq !== null)}
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
          {#each mine as { u, i } (i)}<option value={String(i)}>with {u.card.name}</option>{/each}
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
      {#each mine as { u, i } (i)}
        {@const p = { kind: 'unit' as const, i }}
        <div
          class="piece"
          class:sel={selected?.kind === 'unit' && selected.i === i}
          class:down={!!u.square}
          class:lift={dragging?.kind === 'unit' && dragging.i === i}
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
            <button class="kill" onclick={(ev) => { ev.stopPropagation(); removeUnit(i); }} title="Take out of the force" aria-label="Remove {u.card.name}">×</button>
          </div>

          {@render statBlock(u.card)}

          <div class="plate">
            <div class="portrait">
              <img src={troopArtUrl(u.card.name, u.card.role)} alt="" />
              <span class="level">{u.card.level}</span>
            </div>
            {#if u.square}
              <button class="deploy set" onclick={(ev) => { ev.stopPropagation(); unplace(p); }} title="Take it off the board">{u.square}<span class="undo">↩</span></button>
            {:else}
              <button class="deploy" disabled={!autoCell(p)} onclick={(ev) => { ev.stopPropagation(); placeAuto(p); }} title={`Put it on the board · ${deployNote(u)}`}>Place</button>
            {/if}
          </div>

          <div class="details">
            {@render sheetLines(u.card)}
            <p class="line where">{u.square ? `Standing on ${u.square}` : `Off the board · deploys on ${deployNote(u)}`}</p>
            {#each u.engines as e, ei (ei)}
              <p class="line">⚙ {e} rides along <button class="kill inline" onclick={(ev) => { ev.stopPropagation(); detach(u, ei); }} title="Leave the engine behind" aria-label="Detach {e}">×</button></p>
            {/each}
          </div>
        </div>
      {:else}
        <p class="muted">No units yet. Add one from the roster, or generate a force.</p>
      {/each}

      {#each myEngines as { e, i } (i)}
        {@const c = engineCard(e.name)}
        {@const art = engineArtUrl(e.name)}
        {@const p = { kind: 'engine' as const, i }}
        <div
          class="piece engine"
          class:sel={selected?.kind === 'engine' && selected.i === i}
          class:down={!!e.square}
          class:lift={dragging?.kind === 'engine' && dragging.i === i}
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
            <button class="kill" onclick={(ev) => { ev.stopPropagation(); removeEmplacement(i); }} title="Take out of the force" aria-label="Remove {e.name}">×</button>
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
              <button class="deploy set" onclick={(ev) => { ev.stopPropagation(); unplace(p); }} title="Take it off the board">{e.square}<span class="undo">↩</span></button>
            {:else}
              <button class="deploy" disabled={!autoCell(p)} onclick={(ev) => { ev.stopPropagation(); placeAuto(p); }} title="Put it on the board">Place</button>
            {/if}
          </div>

          <div class="details">
            <p class="line where">{e.square ? `Emplaced on ${e.square}` : 'Off the board · holds the square it stands on'}</p>
          </div>
        </div>
      {/each}
    </div>

    <div class="row">
      <button onclick={resetSetup}>Reset to the example</button>
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

  .kill { border: 0; background: none; color: var(--muted); padding: 0 .2rem; font-size: 1rem; line-height: 1; opacity: .5; }
  .kill:hover:not(:disabled) { color: var(--bad); opacity: 1; border-color: transparent; }
  .kill.inline { font-size: .8rem; }
</style>
