<script lang="ts">
  import {
    activeUnit, availableActions, engagedEnemies, isOutflanked, isRouted, levelDc, MAX_WOUNDS, notation, reachOf, rungOf, SPELLS,
    type ActionOffer, type Grade, type LadderType, type RungOption, type Unit,
  } from '../engine/index.js';
  import { troopArtUrl, type BoardEventOf, type EngineTokenModel, type HighlightStyle, type TokenModel, type UnitTokenModel } from '../board/index.js';
  import PixiBoard from './PixiBoard.svelte';
  import { backToSetup, game, selectUnit, takeAction, undo } from './game.svelte.js';

  const b = $derived(game.battle!);
  const active = $derived(activeUnit(b));
  const offers = $derived(availableActions(b));
  const strip = $derived(b.units.filter((u) => u.side === b.pending && u.status === 'active'));

  let chosen = $state<Record<string, string>>({});
  let focused = $state<string | null>(null);
  let boardRef = $state<PixiBoard>();

  // The only place `resolveStrike` is called with `free: true` (doWithdraw's covering
  // strikes) — the sole channel to flag a free strike for the token pulse without a
  // dedicated field on the log entry.
  const FREE_STRIKE_RE = /strikes the withdrawing/;
  const FLASH_MS = 700;
  let flashing = $state<string[]>([]);
  let flashTimers: ReturnType<typeof setTimeout>[] = [];
  function flash(id: string) {
    flashing = [...flashing, id];
    flashTimers.push(setTimeout(() => { flashing = flashing.filter((x) => x !== id); }, FLASH_MS));
  }
  $effect(() => () => { for (const t of flashTimers) clearTimeout(t); });
  const flashSet = $derived(new Set(flashing));

  const rungKey = (offer: ActionOffer, opt: RungOption) => `${offer.type}:${offer.spell ?? ''}:${opt.index}`;

  const focusedEntry = $derived.by<{ offer: ActionOffer; opt: RungOption } | null>(() => {
    if (!focused) return null;
    for (const offer of offers) for (const opt of offer.rungs) if (rungKey(offer, opt) === focused) return { offer, opt };
    return null;
  });
  const highlightCells = $derived((focusedEntry?.opt.targets ?? []).filter((t) => t.kind === 'cell').map((t) => t.id));
  const highlightedUnitIds = $derived(new Set((focusedEntry?.opt.targets ?? []).filter((t) => t.kind === 'unit').map((t) => t.id)));

  // Cell/unit targets highlight directly off `RungTarget.kind`; a wall target has no board
  // highlight (`BoardView.setHighlight` only paints cells) but still resolves on an edge
  // click via `onEdge` below — see "Wave 2 notes" in the todos.
  function styleFor(offer: ActionOffer): HighlightStyle {
    if (offer.spell) return SPELLS[offer.spell].at === 'enemy' ? 'attack' : 'deploy';
    if (offer.type === 'shoot' || offer.type === 'fight') return 'attack';
    if (offer.type === 'move' || offer.type === 'withdraw') return 'move';
    return 'deploy';
  }
  const highlightStyle = $derived(focusedEntry ? styleFor(focusedEntry.offer) : 'move');

  const tokens = $derived.by<TokenModel[]>(() => [
    ...b.units.filter((u) => u.status === 'active').map((u): UnitTokenModel => ({
      kind: 'unit',
      id: u.id,
      side: u.side,
      name: u.name,
      role: u.role,
      level: u.level,
      cell: notation(u.square),
      wounds: u.wounds,
      disorder: u.disorder,
      quality: u.quality,
      engine: u.engines.find((e) => e.status === 'crewed')?.name ?? null,
      ring: active?.id === u.id ? 'active' : flashSet.has(u.id) ? 'flash' : highlightedUnitIds.has(u.id) ? 'highlighted' : null,
    })),
    // Abandoned and captured engines stand alone on the square they were left.
    ...b.units.flatMap((u) => u.engines
      .filter((e) => e.status !== 'crewed')
      .map((e, i): EngineTokenModel => ({ kind: 'engine', id: `${u.id}:engine:${i}`, side: u.side, name: e.name, cell: notation(e.square), ring: null }))),
  ]);

  function performRung(offer: ActionOffer, opt: RungOption, target?: string) {
    const before = game.battle!.log.length;
    takeAction({ type: offer.type, rung: opt.index, target, spell: offer.spell ?? undefined });
    for (const e of game.battle!.log.slice(before)) if (e.unit && FREE_STRIKE_RE.test(e.text)) flash(e.unit);
    focused = null;
  }

  // Hovering the matching rung wins when it targets the same thing (disambiguates a
  // cell/unit two rungs both offer); otherwise every legal rung is searched, same as
  // clicking straight off the panel.
  function findMatch(kind: 'cell' | 'unit' | 'wall', id: string): { offer: ActionOffer; opt: RungOption } | null {
    if (focusedEntry?.opt.targets.some((t) => t.kind === kind && t.id === id)) return focusedEntry;
    for (const offer of offers) {
      for (const opt of offer.rungs) {
        if (opt.legal && opt.targets.some((t) => t.kind === kind && t.id === id)) return { offer, opt };
      }
    }
    return null;
  }
  function onCell(e: BoardEventOf<'cell'>) { const m = findMatch('cell', e.cell); if (m) performRung(m.offer, m.opt, e.cell); }
  function onToken(e: BoardEventOf<'token'>) { const m = findMatch('unit', e.id); if (m) performRung(m.offer, m.opt, e.id); }
  function onEdge(e: BoardEventOf<'edge'>) { const m = findMatch('wall', e.edge); if (m) performRung(m.offer, m.opt, e.edge); }

  function pickUnit(u: Unit) {
    if (u.status !== 'active' || u.side !== b.pending || b.activated.includes(u.id)) return;
    selectUnit(u.id);
    boardRef?.centerOn(notation(u.square));
  }

  const grantedLabel = (type: LadderType, granted: Grade) => rungOf(type, granted).label;
  const aboveLabel = (type: LadderType, index: number) => rungOf(type, Math.min(3, index + 1) as Grade).label;

  const status = (u: Unit) => [
    u.guard ? `guarding +${u.guard.defence}` : '',
    u.rooted ? 'rooted' : '',
    u.exposed ? 'exposed' : '',
    u.warded ? 'warded' : '',
    u.blessed ? 'blessed' : '',
    u.compelled ? 'compelled' : '',
    b.phase === 'battle' && isOutflanked(b, u) ? 'outflanked' : '',
  ].filter(Boolean).join(' · ');

  const spec = $derived(`${b.board.spec.base}${b.board.spec.feature && b.board.spec.feature !== 'none' ? ' · ' + b.board.spec.feature : ''}`);
  const cls = (e: { degree: string } | undefined) => !e ? '' : e.degree === 'critical-success' ? 'crit' : e.degree.includes('fail') ? 'fail' : '';
  let logEl = $state<HTMLDivElement>();
  $effect(() => { void b.log.length; logEl?.scrollTo({ top: logEl.scrollHeight }); });
</script>

<div class="battle">
  <div class="battle-top">
    <div class="battle-top-left">
      <strong>Round {b.round} / 6</strong>
      <span class={b.pending === 'attacker' ? 'side-att' : 'side-def'}>{b.pending}</span> to activate
      {#if active}<span class="muted">· {active.name}</span>{/if}
      <span class="muted">· {spec}</span>
    </div>
    <div class="row">
      <button onclick={undo} disabled={!game.history.length} title="Undo the last activation">Undo</button>
      <button onclick={backToSetup}>New battle</button>
    </div>
  </div>

  <div class="battle-board">
    <PixiBoard
      bind:this={boardRef}
      board={b.board}
      {tokens}
      mode="battle"
      fill
      highlight={highlightCells}
      {highlightStyle}
      oncell={active ? onCell : undefined}
      ontoken={active ? onToken : undefined}
      onedge={active ? onEdge : undefined}
    />
  </div>

  <div class="battle-strip">
    {#each strip as u (u.id)}
      {@const spent = b.activated.includes(u.id)}
      <button class="unit-card" class:active={active?.id === u.id} class:spent disabled={spent} onclick={() => pickUnit(u)}>
        <img src={troopArtUrl(u.name, u.role)} alt="" />
        <span class="unit-card-name">{u.name}</span>
        <span class="unit-card-meta">L{u.level} · {notation(u.square)}</span>
        <span class="pip-row">
          {#each Array(MAX_WOUNDS) as _, i (i)}<span class="pip square" class:on={i < u.wounds}></span>{/each}
        </span>
        <span class="pip-row">
          {#each Array(u.quality) as _, i (i)}<span class="pip circle" class:on={i < u.disorder}></span>{/each}
        </span>
      </button>
    {:else}
      <p class="muted">No units left to activate this round.</p>
    {/each}
  </div>

  <div class="battle-panel">
    {#if b.phase === 'ended'}
      <div class="card result">
        <h2>{b.winner === 'draw' ? (b.endedBy === 'dusk' ? 'Dusk. The field is contested.' : 'Both armies are spent.') : `The ${b.winner} holds the field.`}</h2>
        <div class="unitlist">
          {#each b.units as u (u.id)}
            <div class="unitrow">
              <span class={u.side === 'attacker' ? 'side-att' : 'side-def'}>{u.name}</span>
              <span class="stat">wounds {u.wounds}/{MAX_WOUNDS}</span>
              <span class="stat">disorder {u.disorder}/{u.quality}</span>
              <span class="muted">{u.status === 'active' ? (isRouted(u) ? 'routed' : 'standing') : u.status}</span>
            </div>
          {/each}
        </div>
        <p><button class="primary" onclick={backToSetup}>Set up another battle</button></p>
      </div>
    {:else if active}
      <div class="card">
        <h3 class={active.side === 'attacker' ? 'side-att' : 'side-def'}>{active.name} · {active.side} · {notation(active.square)}</h3>
        <table class="stats"><tbody>
          <tr><td>Strike</td><td class="stat">{active.stats.strike === null ? '—' : '+' + active.stats.strike}</td><td>Volley</td><td class="stat">{active.stats.volley === null ? '—' : `+${active.stats.volley} · ${['—', 'close', 'long', 'extreme'][Math.max(0, reachOf(b, active))]}`}</td></tr>
          <tr><td>Defence</td><td class="stat">{active.stats.defence}</td><td>Will</td><td class="stat">+{active.stats.will}</td></tr>
          <tr><td>Disorder</td><td class="stat">{active.disorder}/{active.quality}</td><td>Level DC</td><td class="stat">{levelDc(active.level)}</td></tr>
          <tr><td>Engaged with</td><td colspan="3">{engagedEnemies(b, active).map((e) => `${e.name} (${notation(e.square)})`).join(', ') || 'nobody'}</td></tr>
          {#if active.tactics.length}<tr><td>Tactics</td><td colspan="3">{active.tactics.join(', ')}</td></tr>{/if}
          {#if status(active)}<tr><td>Status</td><td colspan="3">{status(active)}</td></tr>{/if}
        </tbody></table>
      </div>

      <div class="actions">
        {#each offers as offer (offer.type + ':' + (offer.spell ?? ''))}
          <div class="offer">
            <h4>{offer.label}</h4>
            <p class="muted">{offer.detail}</p>
            {#each offer.rungs as opt (opt.index)}
              <div
                class="rung"
                class:locked={opt.access === 'locked'}
                class:reach={opt.access === 'reach'}
                role="group"
                onmouseenter={() => { if (opt.legal) focused = rungKey(offer, opt); }}
                onmouseleave={() => { if (focused === rungKey(offer, opt)) focused = null; }}
                onfocusin={() => { if (opt.legal) focused = rungKey(offer, opt); }}
                onfocusout={() => { if (focused === rungKey(offer, opt)) focused = null; }}
              >
                <div class="rung-head">
                  <span class="rung-label">{opt.index}. {opt.label}</span>
                  <span class="rung-access {opt.access}">{opt.access === 'free' ? 'Free' : opt.access === 'reach' ? 'Reach — gamble' : 'Locked'}</span>
                </div>
                <p class="muted rung-detail">{opt.detail}</p>
                {#if opt.access === 'reach'}
                  <p class="gamble">
                    DC {offer.reachDc} · roll d20{offer.reachModifier >= 0 ? '+' : ''}{offer.reachModifier}.
                    Crit → {aboveLabel(offer.type, opt.index)}. Fail → falls back to {grantedLabel(offer.type, offer.granted)}.
                    Crit fail → {grantedLabel(offer.type, offer.granted)}, and 1 disorder.
                  </p>
                {/if}
                {#if !opt.legal}
                  <p class="muted rung-reason">{opt.reason}</p>
                {:else}
                  <div class="row rung-go">
                    {#if opt.targets.length}
                      <select bind:value={chosen[rungKey(offer, opt)]}>
                        {#each opt.targets as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
                      </select>
                      <button onclick={() => performRung(offer, opt, chosen[rungKey(offer, opt)] ?? opt.targets[0].id)}>Go</button>
                    {:else}
                      <button onclick={() => performRung(offer, opt)}>Go</button>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>
    {/if}

    <h3>Battle log</h3>
    <div class="log" bind:this={logEl}>
      {#each b.log as e, i (i)}
        <p class:round={!e.unit} class={cls(e.check)}>{e.text}</p>
      {/each}
    </div>
  </div>
</div>

<style>
  .battle {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    grid-template-columns: 1fr 24rem;
    grid-template-rows: auto 1fr auto;
    grid-template-areas: "top top" "board panel" "strip panel";
    background: var(--paper);
    color: var(--ink);
  }
  .battle-top { grid-area: top; display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .5rem 1rem; border-bottom: 1px solid var(--rule); }
  .battle-top-left { display: flex; gap: .4rem; align-items: baseline; flex-wrap: wrap; }
  .battle-board { grid-area: board; position: relative; min-width: 0; min-height: 0; }
  .battle-strip { grid-area: strip; display: flex; gap: .5rem; padding: .5rem .75rem; overflow-x: auto; border-top: 1px solid var(--rule); background: var(--band); }
  .battle-panel { grid-area: panel; display: flex; flex-direction: column; gap: .6rem; padding: .75rem; overflow-y: auto; border-left: 1px solid var(--rule); min-height: 0; }
  .battle-panel .log { flex: 1; min-height: 8rem; max-height: none; }

  .unit-card {
    flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: .2rem;
    width: 5.5rem; padding: .3rem; background: var(--card); border: 1px solid var(--rule); border-radius: 8px;
    cursor: pointer; font: inherit; color: var(--ink); text-align: center;
  }
  .unit-card:disabled { cursor: default; }
  .unit-card.active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent) inset; }
  .unit-card.spent { filter: grayscale(1); opacity: .5; }
  .unit-card img { width: 3.4rem; height: 3.4rem; object-fit: cover; border-radius: 6px; background: var(--band); }
  .unit-card-name { font-size: .78rem; font-weight: 600; line-height: 1.15; }
  .unit-card-meta { font-size: .7rem; color: var(--muted); }
  .pip-row { display: flex; gap: 2px; }
  .pip { display: inline-block; width: .5rem; height: .5rem; border: 1px solid var(--rule); background: transparent; }
  .pip.square { border-radius: 2px; }
  .pip.circle { border-radius: 50%; }
  .pip.on { background: var(--accent); border-color: var(--accent); }

  .actions { display: flex; flex-direction: column; gap: .6rem; }
  .offer { border: 1px solid var(--rule); border-radius: 8px; padding: .5rem .6rem; background: var(--card); }
  .offer h4 { margin: 0 0 .15rem; }
  .rung { border-top: 1px dashed var(--rule); padding: .3rem 0; }
  .rung:first-of-type { border-top: none; }
  .rung.locked { opacity: .5; }
  .rung-head { display: flex; justify-content: space-between; align-items: baseline; gap: .5rem; }
  .rung-label { font-weight: 600; }
  .rung-access { font-size: .72rem; padding: .05rem .4rem; border-radius: 999px; border: 1px solid var(--rule); white-space: nowrap; }
  .rung-access.free { color: var(--good); border-color: var(--good); }
  .rung-access.reach { color: var(--accent); border-color: var(--accent); }
  .rung-access.locked { color: var(--muted); }
  .rung-detail { margin: .1rem 0; }
  .gamble { margin: .25rem 0; font-size: .82rem; color: var(--accent); }
  .rung-reason { margin: .1rem 0; font-style: italic; }
  .rung-go { margin-top: .3rem; }
</style>
