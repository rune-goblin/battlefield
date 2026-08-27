<script lang="ts">
  import { at, COMBATANTS, deployRanks, ENGINES, derivation, generateForce, gridOf, notation, OFFICIAL, paceReason, qualityFor, seededRandom, ROSTER, type Side, type UnitCard } from '../engine/index.js';
  import type { BoardEventOf, TokenModel } from '../board/index.js';
  import PixiBoard from './PixiBoard.svelte';
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
      quality: qualityFor(u.card),
      engine: u.engines[0] ?? null,
      prop: null,
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
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
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

  const STAT_LABEL: Record<string, string> = { strike: 'Strike', volley: 'Volley', defence: 'Def', will: 'Will', perception: 'Per', reach: 'Reach' };

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

{#snippet sheetLines(card: UnitCard)}
  {@const sh = card.sheet}
  <div class="muted stat">
    {#if sh}
      Sheet · AC {sh.ac} · HP {sh.hp} · Battle DC {sh.battleDc} · Salvo {sh.salvoDc === null ? '—' : `DC ${sh.salvoDc} (${sh.salvoFeet} ft)`} · Fort +{sh.fortitude} · Ref +{sh.reflex} · Will +{sh.will} · Per +{sh.perception} · Speed {sh.speed} ft{sh.fly ? ', fly' : ''}
    {:else}
      Sheet · none (generic card, level table)
    {/if}
  </div>
  <div class="muted stat derived">
    Battle ·
    {#each derivation(card) as d (d.stat)}
      <span title={d.from}>{STAT_LABEL[d.stat]} {d.value}</span> ·
    {/each}
    {paceReason(card)}
  </div>
{/snippet}

<div class="stage place">
  <section class="sidepane stage-scroll">
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
    <div class="unitlist">
      {#each mine as { u, i } (i)}
        <div
          class="unitrow click"
          class:sel={selected?.kind === 'unit' && selected.i === i}
          role="button"
          tabindex="0"
          draggable={!u.square}
          ondragstart={u.square ? undefined : (e) => onTrayDragStart({ kind: 'unit', i }, e)}
          ondragend={u.square ? undefined : onTrayDragEnd}
          onclick={() => (selected = { kind: 'unit', i })}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selected = { kind: 'unit', i }; } }}
        >
          <div><strong>{u.card.name}</strong> <span class="muted">L{u.card.level} {u.card.role}{u.card.tactics?.length ? ' · ' + u.card.tactics.join(', ') : ''}</span><br>
            {@render sheetLines(u.card)}
            {#each u.engines as e, ei (ei)}
              <div class="muted">⚙ {e} rides along <button onclick={(ev) => { ev.stopPropagation(); detach(u, ei); }} title="Remove engine" style="padding:0 .35rem">×</button></div>
            {/each}
          </div>
          <span class="muted stat">{u.square ? `on ${u.square}` : `drag to place · ${deployNote(u)}`}</span>
          <button disabled={!u.square} onclick={(ev) => { ev.stopPropagation(); unplace({ kind: 'unit', i }); }} title="Unplace">↩</button>
          <button onclick={(ev) => { ev.stopPropagation(); removeUnit(i); }} title="Remove">×</button>
        </div>
      {:else}
        <p class="muted">No units yet. Add one from the roster, or generate a force.</p>
      {/each}

      {#each myEngines as { e, i } (i)}
        {@const c = engineCard(e.name)}
        <div
          class="unitrow click engine"
          class:sel={selected?.kind === 'engine' && selected.i === i}
          role="button"
          tabindex="0"
          draggable={!e.square}
          ondragstart={e.square ? undefined : (ev) => onTrayDragStart({ kind: 'engine', i }, ev)}
          ondragend={e.square ? undefined : onTrayDragEnd}
          onclick={() => (selected = { kind: 'engine', i })}
          onkeydown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selected = { kind: 'engine', i }; } }}
        >
          <div><strong>⚙ {e.name}</strong>
            {#if c}<span class="muted">L{c.level} {c.kind}{c.reach ? ' · ' + c.reach : ''} · +{c.launch} · Def {c.defence}</span>{/if}
          </div>
          <span class="muted stat">{e.square ? `emplaced on ${e.square}` : 'drag to emplace'}</span>
          <button disabled={!e.square} onclick={(ev) => { ev.stopPropagation(); unplace({ kind: 'engine', i }); }} title="Unplace">↩</button>
          <button onclick={(ev) => { ev.stopPropagation(); removeEmplacement(i); }} title="Remove">×</button>
        </div>
      {/each}
    </div>

    <div class="row" style="margin-top:.6rem">
      <button onclick={resetSetup}>Reset to the example</button>
    </div>
  </section>

  <section class="boardpane">
    <p class="muted deploy-note">
      {#if unplaced}
        <strong>{unplaced}</strong> still to place. Drag one onto a lit square, or select it and click.
      {:else}
        Every piece is placed. Drag a token to move it.
      {/if}
      Attackers deploy on ranks 1–3, defenders on 7–9; an ambush unit may go one rank further in.
    </p>
    <div class="boardfill">
      <PixiBoard {board} {tokens} mode="place" fill highlights={[{ style: 'deploy', cells: highlightCells }]} oncell={onCell} ontoken={onToken} ondrop={onTokenDrop} ontraydrop={onTrayDrop} />
    </div>
  </section>
</div>

<style>
  .place { display: grid; grid-template-columns: 26rem minmax(0, 1fr); gap: 1rem; min-height: 0; }
  .boardpane { display: flex; flex-direction: column; gap: .3rem; min-height: 0; }
  .deploy-note { margin: 0; }
  .unitrow.engine { border-style: dashed; }
  @media (max-width: 62rem) {
    .place { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) minmax(0, 1.4fr); }
  }
</style>
