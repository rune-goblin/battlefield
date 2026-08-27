<script lang="ts">
  import { at, COMBATANTS, deployRanks, ENGINES, derivation, generateForce, gridOf, notation, OFFICIAL, paceReason, qualityFor, seededRandom, ROSTER, type Side, type UnitCard } from '../engine/index.js';
  import type { BoardEventOf, TokenModel } from '../board/index.js';
  import PixiBoard from './PixiBoard.svelte';
  import { back, game, resetSetup, save, startBattle, type SetupUnit } from './game.svelte.js';

  let side: Side = $state('attacker');
  let rosterName = $state(COMBATANTS[0].name);
  const library = [...COMBATANTS, ...OFFICIAL, ...ROSTER];
  let selected = $state<number | null>(null);
  // Set on a tray item's dragstart, read back from DataTransfer on drop — dragstart is the
  // only point a native drag gives Svelte a hook, so it also drives the live deploy-wash
  // highlight during that drag (see the `highlight` derivation below).
  let dragIndex = $state<number | null>(null);

  const units = $derived(game.setup.units);
  const board = $derived(game.setup.board!);
  const bySide = (s: Side) => units.map((u, i) => ({ u, i })).filter(({ u }) => u.side === s);
  const ready = $derived(bySide('attacker').length > 0 && bySide('defender').length > 0 && units.every((u) => u.square !== null));
  const ambush = (u: SetupUnit) => (u.card.tactics ?? []).includes('ambush');
  const deploySide = $derived(selected !== null && units[selected] ? units[selected].side : side);
  const deployAmbush = $derived(selected !== null && units[selected] ? ambush(units[selected]) : false);

  // The open deploy-rank cells for one unit's own side, excluding every OTHER unit's square
  // — excluding its own (`excludeIndex`) lets a placed, selected unit's current square count
  // as an available destination, which a token-move drop needs as much as a fresh placement.
  function deployCells(forSide: Side, forAmbush: boolean, excludeIndex: number | null): Set<string> {
    const taken = new Set(units.filter((_, i) => i !== excludeIndex).map((u) => u.square).filter((s): s is string => s !== null));
    const out = new Set<string>();
    const ranks = new Set(deployRanks(forSide, forAmbush));
    for (const sq of gridOf(board).cells()) {
      if (!ranks.has(sq.rank)) continue;
      const n = notation(sq);
      if (at(board, sq).terrain !== 'water' && !taken.has(n)) out.add(n);
    }
    return out;
  }
  const highlight = $derived(deployCells(deploySide, deployAmbush, selected));
  const highlightCells = $derived([...highlight]);

  const tokens = $derived.by<TokenModel[]>(() =>
    units.flatMap((u, i) => {
      if (!u.square) return [];
      return [{
        kind: 'unit',
        id: String(i),
        side: u.side,
        name: u.card.name,
        role: u.card.role,
        level: u.card.level,
        cell: u.square,
        wounds: 0,
        disorder: 0,
        quality: qualityFor(u.card),
        engine: u.engines[0] ?? null,
        ring: selected === i ? 'selected' : null,
      }];
    }),
  );

  const wallsTier = $derived(Math.max(-1, ...Object.values(board.walls).map((w) => w.tier)) + 1);

  function add(card: UnitCard) {
    units.push({ card: structuredClone($state.snapshot(card)), side, square: null, engines: [] });
    selected = units.length - 1;
    save();
  }
  function remove(i: number) {
    units.splice(i, 1);
    if (selected === i) selected = null;
    else if (selected !== null && selected > i) selected -= 1;
    save();
  }
  function unplace(i: number) { units[i].square = null; save(); }
  function placeOn(n: string) {
    if (selected === null || !units[selected] || !highlight.has(n)) return;
    units[selected].square = n;
    selected = units.findIndex((u) => u.square === null && u.side === units[selected!].side);
    if (selected === -1) selected = null;
    save();
  }
  function onCell(e: BoardEventOf<'cell'>) { placeOn(e.cell); }
  function onToken(e: BoardEventOf<'token'>) { selected = Number(e.id); }

  // A board-internal drag of an already-placed token. Validated against that token's own
  // side/ambush ranks (not `highlight`, which follows the sidebar's `selected` unit and may
  // be stale mid-drag — see `dragIndex`'s note above): an invalid or occupied drop is a no-op,
  // so the token stays put and TokenLayer's next render snaps it back on its own.
  function onTokenDrop(e: BoardEventOf<'drop'>) {
    const i = Number(e.id);
    const u = units[i];
    if (!u || !deployCells(u.side, ambush(u), i).has(e.cell)) return;
    u.square = e.cell;
    save();
  }

  function onTrayDragStart(i: number, e: DragEvent) {
    e.dataTransfer?.setData('text/plain', String(i));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    dragIndex = i;
    selected = i;
  }
  function onTrayDragEnd() { dragIndex = null; }

  // A tray item dropped onto the canvas. `cell` is null outside the grid entirely; outside
  // the deploy wash (or over an occupied square) the unit simply stays in the tray.
  function onTrayDrop(cell: string | null, data: DataTransfer | null) {
    const i = data?.getData('text/plain') ? Number(data.getData('text/plain')) : dragIndex;
    dragIndex = null;
    if (cell === null || i === null || !units[i] || !highlight.has(cell)) return;
    units[i].square = cell;
    save();
  }

  const STAT_LABEL: Record<string, string> = { strike: 'Strike', volley: 'Volley', defence: 'Def', will: 'Will', perception: 'Per', reach: 'Reach' };
  let engineName = $state(ENGINES.find((e) => e.name === 'Catapult')?.name ?? ENGINES[0].name);
  let engineTarget = $state(0);
  function addEngine() {
    const u = units[engineTarget];
    if (!u) return;
    u.engines.push(engineName);
    save();
  }
  function removeEngine(u: SetupUnit, i: number) { u.engines.splice(i, 1); save(); }
  function generate() {
    const other: Side = side === 'attacker' ? 'defender' : 'attacker';
    const opponentCards = bySide(other).map(({ u }) => $state.snapshot(u.card) as UnitCard);
    const force = generateForce(opponentCards, seededRandom(Math.floor(Math.random() * 1e9)), { attacking: side === 'attacker', wallsTier });
    for (let i = units.length - 1; i >= 0; i--) if (units[i].side === side) units.splice(i, 1);
    for (const { card, engine } of force) units.push({ card: structuredClone(card), side, square: null, engines: engine ? [engine.name] : [] });
    selected = units.findIndex((u) => u.side === side);
    if (selected === -1) selected = null;
    save();
  }
  const deployNote = (u: SetupUnit) => {
    const ranks = deployRanks(u.side, ambush(u)).map((r) => r + 1);
    return `ranks ${Math.min(...ranks)}–${Math.max(...ranks)}`;
  };
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

<div class="grid2">
  <section>
    <h2>Add units</h2>
    <div class="card">
      <div class="row">
        <label>Side <select bind:value={side}><option value="attacker">Attacker</option><option value="defender">Defender</option></select></label>
      </div>
      <div class="row" style="margin-top:.5rem">
        <button onclick={generate}>Generate {side} force</button>
      </div>
      <p class="muted">Replaces the {side}'s units with a force matched to the other side.</p>
      <h3>From the roster</h3>
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
      </div>
    </div>

    <h2>Siege engines</h2>
    <div class="card">
      <div class="row">
        <select bind:value={engineName}>{#each ENGINES as e (e.name)}<option value={e.name}>{e.name} · L{e.level} {e.kind}{e.reach ? ' ' + e.reach : ''} +{e.launch}</option>{/each}</select>
        <label>Attach to <select bind:value={engineTarget}>{#each units as u, i (i)}<option value={i}>{u.card.name} ({u.side})</option>{/each}</select></label>
        <button disabled={units.length === 0} onclick={addEngine}>Add engine</button>
      </div>
      <p class="muted">A siege engine rides with the unit it is attached to and fires on that unit's activation.</p>
    </div>
  </section>

  <section>
    <h2>Deployment</h2>
    <p class="muted">Attackers deploy on ranks 1–3, defenders on 7–9. Ambush units may deploy one rank further in. Drag an unplaced unit onto a highlighted square, or select one below and click a square. Drag a placed token to move it.</p>
    <PixiBoard {board} {tokens} mode="place" highlights={[{ style: 'deploy', cells: highlightCells }]} oncell={onCell} ontoken={onToken} ondrop={onTokenDrop} ontraydrop={onTrayDrop} />

    {#each ['attacker', 'defender'] as const as s (s)}
      <h3 class={s === 'attacker' ? 'side-att' : 'side-def'}>{s === 'attacker' ? 'Attacker' : 'Defender'}</h3>
      <div class="unitlist">
        {#each bySide(s) as { u, i } (i)}
          <div
            class="unitrow click"
            class:sel={selected === i}
            role="button"
            tabindex="0"
            draggable={!u.square}
            ondragstart={u.square ? undefined : (e) => onTrayDragStart(i, e)}
            ondragend={u.square ? undefined : onTrayDragEnd}
            onclick={() => (selected = i)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selected = i; } }}
          >
            <div><strong>{u.card.name}</strong> <span class="muted">L{u.card.level} {u.card.role}{u.card.tactics?.length ? ' · ' + u.card.tactics.join(', ') : ''}</span><br>
              {@render sheetLines(u.card)}
              {#each u.engines as e, ei (ei)}
                <div class="muted">⚙ {e} <button onclick={(ev) => { ev.stopPropagation(); removeEngine(u, ei); }} title="Remove engine" style="padding:0 .35rem">×</button></div>
              {/each}
            </div>
            <span class="muted stat">{u.square ? `on ${u.square}` : `drag to place · ${deployNote(u)}`}</span>
            <button disabled={!u.square} onclick={(ev) => { ev.stopPropagation(); unplace(i); }} title="Unplace">↩</button>
            <button onclick={(ev) => { ev.stopPropagation(); remove(i); }} title="Remove">×</button>
          </div>
        {:else}
          <p class="muted">No units yet.</p>
        {/each}
      </div>
    {/each}
    <div class="row" style="margin-top:1rem">
      <button onclick={back}>Back</button>
      <button class="primary" disabled={!ready} onclick={startBattle}>Begin the battle</button>
      <button onclick={resetSetup}>Reset to the example</button>
    </div>
  </section>
</div>
