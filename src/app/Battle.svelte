<script lang="ts">
  import {
    ACTIONS_PER_ACTIVATION, activation, activeUnit, DIALS, engagedEnemies, guardDefence, isOutflanked, isRouted, levelDc, MAX_WOUNDS, movePath, notation,
    offersAt, pushDcFor, pushModifierFor, pushPath, reachOf, routDcFor, rungAccess, rungOf, SPELLS,
    type ActionOffer, type ChargeOption, type Dial, type Grade, type LadderType, type MoveReach, type RungOption,
    type Spend, type SpendDials, type TargetRef, type Unit, type WithdrawOffer,
  } from '../engine/index.js';
  import { troopArtUrl, type BoardEventOf, type EngineTokenModel, type HighlightStyle, type TokenModel, type UnitTokenModel } from '../board/index.js';
  import BoardPopup from './BoardPopup.svelte';
  import PixiBoard from './PixiBoard.svelte';
  import { backToSetup, endActivation, game, selectUnit, takeAction, undo } from './game.svelte.js';

  const b = $derived(game.battle!);
  const active = $derived(activeUnit(b));
  // The whole engine surface for the active unit in one call: the menu, the movement pool,
  // and where it reaches — `moves`/`charges` drive the drag, `offers` drive the panel.
  const act = $derived(active ? activation(b, active.id) : null);
  const offers = $derived(act?.offers ?? []);
  const strip = $derived(b.units.filter((u) => u.side === b.pending && u.status === 'active'));

  let chosen = $state<Record<string, string>>({});
  // One allocation per rung (and one for the withdrawal), so the push dial can be offered
  // only where a reach check actually stands in the way.
  let alloc = $state<Record<string, Spend>>({});
  let boardRef = $state<PixiBoard>();

  // Move's own row, hovered independently of the type row — Move is drag-driven and its bands
  // stay visible without a click (Mark: "it shows status based on interaction").
  type MoveBand = 1 | 2 | 3 | 'push';
  let hoveredBand = $state<MoveBand | null>(null);
  let moveOpen = $state(true);
  let withdrawOpen = $state(true);

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

  const NONE: Spend = { roll: 0, push: 0, defence: 0, distance: 0 };
  const WITHDRAW_KEY = 'withdraw';
  const used = (sp: Spend) => sp.roll + sp.push + sp.defence + sp.distance;

  /** The push dial bites only on the rung a check stands in front of, never on a granted one. */
  const rungDials = (offer: ActionOffer, opt: RungOption): SpendDials =>
    ({ ...offer.dials, push: offer.dials.push && opt.access === 'reach' });

  // Actions drain as the activation runs, so a stored allocation is trimmed on read rather
  // than tracked — the panel can never propose more than the unit still has.
  function spendOn(key: string, d: SpendDials): Spend {
    const stored = alloc[key] ?? NONE;
    const out = { ...NONE };
    let left = d.extra;
    for (const dial of DIALS) {
      if (!d[dial]) continue;
      out[dial] = Math.max(0, Math.min(stored[dial], left));
      left -= out[dial];
    }
    return out;
  }
  function setDial(key: string, d: SpendDials, dial: Dial, to: number) {
    const sp = spendOn(key, d);
    const room = d.extra - used(sp) + sp[dial];
    alloc = { ...alloc, [key]: { ...sp, [dial]: Math.max(0, Math.min(to, room)) } };
  }

  const ROLL_NOUN: Record<LadderType, string> = {
    fight: 'the attack roll', shoot: 'the shot', cast: 'the casting roll',
    rally: 'the Quality check', guard: '',
  };
  const perAction = (offer: ActionOffer | null, dial: Dial, step: number, speed: number) =>
    dial === 'roll' ? `+${step} to ${offer ? ROLL_NOUN[offer.type] : 'the Escape check'}`
      : dial === 'push' ? `+${step} to the reach check`
        : dial === 'defence' ? `+${step} more Defence`
          : `one more Speed's worth (${speed} ft)`;
  const dialSum = (dial: Dial, n: number, step: number, speed: number) =>
    n === 0 ? '' : dial === 'distance' ? `+${n * speed} ft` : `+${n * step}`;

  /** What the allocation actually comes to, so the player reads the number before committing.
   * Every number here is bought with actions — no rung adds one of its own. */
  function totals(offer: ActionOffer, opt: RungOption, sp: Spend, u: Unit): string[] {
    const step = offer.dials.step;
    const out: string[] = [];
    if (offer.dials.roll) {
      out.push(offer.type === 'rally'
        ? `Quality check d20+${offer.reachModifier + sp.roll * step} vs DC ${routDcFor(b, u)}`
        : `${opt.label} +${sp.roll * step} on ${ROLL_NOUN[offer.type]}`);
    }
    if (offer.dials.defence) out.push(`Defence +${guardDefence(offer.cost + sp.defence)}`);
    if (opt.access === 'reach' && offer.reachDc !== null) {
      out.push(`Reach DC ${offer.reachDc} · d20+${offer.reachModifier + sp.push * step}`);
    }
    out.push(`Costs ${offer.cost + used(sp)} of ${u.actions} actions`);
    return out;
  }

  function withdrawTotals(w: WithdrawOffer, sp: Spend, u: Unit): string[] {
    const out = w.escapes.map((e) => `Escape ${e.name}: d20+${w.modifier + sp.roll * w.dials.step} vs DC ${e.dc}`);
    if (w.dials.distance) out.push(`Runs up to ${(1 + sp.distance) * u.speed} ft`);
    out.push(`Costs ${w.cost + used(sp)} of ${u.actions} actions`);
    return out;
  }

  const offerKey = (offer: ActionOffer) => `${offer.type}:${offer.spell ?? ''}`;
  const rungKey = (offer: ActionOffer, opt: RungOption) => `${offerKey(offer)}:${opt.index}`;

  // A new unit drops every open popup and any in-flight drag preview — all of it is
  // per-activation UI state, not part of the engine's own state.
  $effect(() => { void active?.id; aim = null; drag = null; pending = null; hoveredBand = null; moveOpen = true; withdrawOpen = true; alloc = {}; });

  function styleFor(offer: ActionOffer): HighlightStyle {
    if (offer.spell) return SPELLS[offer.spell].at === 'enemy' ? 'attack' : 'deploy';
    if (offer.type === 'shoot' || offer.type === 'fight') return 'attack';
    return 'deploy';
  }

  // --- Drag to move: the primary verb. A path traces cell by cell as the pointer moves,
  // clamped to what the engine's own `moves`/`charges` say is reachable — never recomputed
  // here. Dragging past reach just stalls the preview at the last valid cell rather than
  // drawing an illegal one (see `onBoardDrag`).
  interface MovePreview { kind: 'move'; cell: string; feet: number; actions: number; path: string[]; near: string[]; far: string[] }
  interface ChargePreview { kind: 'charge'; cell: string; enemy: string; feet: number; actions: number; path: string[] }
  // Beyond every action the unit has — the DC and fallback are the bargain the HUD/panel read.
  interface PushPreview { kind: 'push'; cell: string; feet: number; fallback: string; dc: number; modifier: number; path: string[] }
  // No traced route: a withdrawal breaks contact and leaves, so its arrow is the straight
  // line from where the unit stands to where it is going.
  interface WithdrawPreview { kind: 'withdraw'; cell: string; path: string[] }
  type Preview = MovePreview | ChargePreview | PushPreview | WithdrawPreview;
  let drag = $state<Preview | null>(null);
  // A released drag, parked until the player picks one of its readings and confirms. One drop
  // means more than one thing, and deciding by where the pointer landed decides for the player.
  interface Parked { cell: string; rows: Preview[]; index: number; rung: Grade | null }
  let pending = $state<Parked | null>(null);
  const picked = $derived(pending?.rows[pending.index] ?? null);
  const preview = $derived(drag ?? picked);
  // Touching a board object opens the other popup: every rung that can act on *that*, which
  // is `offersAt`'s whole job. One flat list, because the player picks a rung, not a type.
  interface AimRow { offer: ActionOffer; opt: RungOption }
  interface Aim { cell: string; target: TargetRef; label: string; rows: AimRow[]; index: number }
  let aim = $state<Aim | null>(null);
  const aimed = $derived(aim?.rows[aim.index] ?? null);
  let anchor = $state<{ x: number; y: number } | null>(null);

  function classify(moves: Map<string, MoveReach>, path: string[]): { near: string[]; far: string[] } {
    const near: string[] = [];
    const far: string[] = [];
    for (const cell of path.slice(1)) (moves.get(cell)!.actions > 1 ? far : near).push(cell);
    return { near, far };
  }

  function enemyAt(cell: string): Unit | undefined {
    const a = active;
    if (!a) return undefined;
    return b.units.find((u) => u.status === 'active' && u.side !== a.side && notation(u.square) === cell);
  }

  const chargeRow = (c: ChargeOption): ChargePreview =>
    ({ kind: 'charge', cell: c.cell, enemy: c.unit, feet: c.feet, actions: c.actions + 1, path: movePath(act!.moves, c.cell) });

  /** Every reading of a drop on `cell`, in the order the popup offers them. One drag chains as
   * many Move actions as the route costs — `MoveReach.actions` counts them, and a row quotes
   * the whole price rather than asking again per action. */
  function rowsAt(cell: string): Preview[] {
    if (!active || !act) return [];
    // Dropped on a piece: there is one thing that means, and it is not a move.
    const enemy = enemyAt(cell);
    if (enemy) {
      const charge = act.charges.find((c) => c.unit === enemy.id);
      return charge ? [chargeRow(charge)] : [];
    }
    const rows: Preview[] = [];
    const m = act.moves.get(cell);
    if (m) {
      const path = movePath(act.moves, cell);
      rows.push({ kind: 'move', cell, feet: m.feet, actions: m.actions, path, ...classify(act.moves, path) });
    }
    const p = act.push.get(cell);
    if (p) {
      rows.push({ kind: 'push', cell, feet: p.feet, fallback: p.fallback, dc: pushDcFor(active), modifier: pushModifierFor(active, act.actions), path: pushPath(act.moves, act.push, cell) });
    }
    // Stopping here and fighting whoever this cell reaches — the same drop, read as a charge.
    for (const c of act.charges) if (c.cell === cell) rows.push(chargeRow(c));
    if (act.withdraw?.targets.some((t) => t.id === cell)) rows.push({ kind: 'withdraw', cell, path: [notation(active.square), cell] });
    return rows;
  }

  function onBoardDrag(e: BoardEventOf<'drag'>) {
    if (!active || !act || e.id !== active.id) return;
    if (e.cell === null) { drag = null; return; }
    const next = rowsAt(e.cell)[0];
    // Dragging past reach stalls at the last legal cell rather than drawing an illegal one.
    if (next) drag = next;
  }

  function onBoardDrop(e: BoardEventOf<'drop'>) {
    drag = null;
    if (!active || !act || e.id !== active.id) return;
    // An illegal drop parks nothing: state never changes, so `tokens` never changes, so
    // `TokenLayer` just snaps the token back to where it actually is.
    const rows = rowsAt(e.cell);
    pending = rows.length ? { cell: e.cell, rows, index: 0, rung: null } : null;
  }

  /** A second click on the row already chosen confirms it, so a plain move is drag, click. */
  function choose(i: number) {
    if (!pending) return;
    if (pending.index === i) { commit(); return; }
    pending = { ...pending, index: i, rung: null };
  }

  function commit() {
    const p = pending;
    pending = null;
    const row = p?.rows[p.index];
    if (!p || !row) return;
    if (row.kind === 'charge') takeAction({ type: 'charge', target: row.enemy, rung: p.rung ?? undefined });
    else if (row.kind === 'move') takeAction({ type: 'move', to: row.cell });
    else if (row.kind === 'push') takeAction({ type: 'push', to: row.cell });
    else if (act?.withdraw) performWithdraw(act.withdraw, row.cell);
  }

  const stepBy = (key: string, length: number) => (key === 'ArrowDown' ? 1 : length - 1);

  function onKey(e: KeyboardEvent) {
    if (pending) {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') pending = null;
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        pending = { ...pending, index: (pending.index + stepBy(e.key, pending.rows.length)) % pending.rows.length, rung: null };
      }
      return;
    }
    if (!aim) return;
    if (e.key === 'Enter') { e.preventDefault(); takeAim(); }
    else if (e.key === 'Escape') aim = null;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      aim = { ...aim, index: (aim.index + stepBy(e.key, aim.rows.length)) % aim.rows.length };
    }
  }

  // proto: pan, zoom, a window resize and the board's own recentring each move the cell under
  // an open popup, and no one event covers all four — so the anchor is read every frame while
  // a popup is open, and never otherwise.
  let lastAnchor: { x: number; y: number } | null = null;
  $effect(() => {
    const open = pending ?? aim;
    if (!open) { anchor = null; lastAnchor = null; return; }
    const cell = open.cell;
    let frame = 0;
    const follow = () => {
      const p = boardRef?.screenOf(cell);
      if (p && (!lastAnchor || Math.abs(p.x - lastAnchor.x) > 0.5 || Math.abs(p.y - lastAnchor.y) > 0.5)) {
        lastAnchor = { x: p.x, y: p.y };
        anchor = lastAnchor;
      }
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  });

  const enemyName = (id: string) => b.units.find((u) => u.id === id)?.name ?? id;
  const actions = (n: number) => `${n} action${n === 1 ? '' : 's'}`;
  const actionCost = (n: number) => (n === 0 ? 'free, on banked movement' : actions(n));
  const rowLabel = (row: Preview) =>
    row.kind === 'charge' ? `Charge ${enemyName(row.enemy)}`
      : row.kind === 'push' ? 'Push here'
        : row.kind === 'withdraw' ? 'Withdraw here' : 'Move here';
  const rowDetail = (row: Preview) =>
    row.kind === 'charge' ? `${row.feet} ft · ${actions(row.actions)}, melee included`
      : row.kind === 'push' ? `DC ${row.dc} · a fail stops you at ${row.fallback}, and it spends every action you have left`
        : row.kind === 'withdraw' ? 'One Escape check per enemy holding you'
          : `${row.feet} ft · ${actionCost(row.actions)}`;
  const rowKey = (row: Preview) => `${row.kind}:${row.kind === 'charge' ? row.enemy : row.cell}`;

  // What each reading of a drop actually costs. A push is the odd one: it spends every action
  // the unit has left, win or lose — that is what reaching beyond them all means.
  const dropCost = (row: Preview): number =>
    row.kind === 'move' || row.kind === 'charge' ? row.actions
      : row.kind === 'push' ? (act?.actions ?? 0)
        : act?.withdraw ? act.withdraw.cost + used(spendOn(WITHDRAW_KEY, act.withdraw.dials)) : 1;
  const aimCost = (row: AimRow) =>
    row.offer.cost + used(spendOn(rungKey(row.offer, row.opt), rungDials(row.offer, row.opt)));
  const cost = $derived(picked ? dropCost(picked) : aimed ? aimCost(aimed) : 0);
  const left = $derived(act?.actions ?? 0);

  // A charge carries a Fight rung of its own; `doCharge` takes the granted one unless told.
  const FIGHT_RUNGS: Grade[] = [1, 2, 3];
  const chargeRung = $derived(pending?.rung ?? active?.grades.fight ?? 1);

  const previewHighlights = $derived.by<{ style: HighlightStyle; cells: string[] }[]>(() => {
    if (!preview) return [];
    if (preview.kind === 'charge') return [{ style: 'attack', cells: preview.path.slice(1) }];
    if (preview.kind === 'push') return [{ style: 'push', cells: preview.path.slice(1) }];
    if (preview.kind === 'withdraw') return [{ style: 'move', cells: [preview.cell] }];
    return [{ style: 'move', cells: preview.near }, { style: 'moveFar', cells: preview.far }];
  });
  const previewPath = $derived(preview?.path ?? []);
  // Banked movement can carry a unit to a cell for no further action at all, so a reach's
  // cost floors at the 1-action row rather than indexing a row that does not exist.
  const bandOf = (actions: number): 1 | 2 | 3 => Math.max(1, Math.min(3, actions)) as 1 | 2 | 3;

  // Which Move row the preview's distance falls into, so the panel tracks the drag.
  const dragBand = $derived.by<MoveBand | null>(() => {
    if (!preview) return null;
    if (preview.kind === 'push') return 'push';
    if (preview.kind === 'move') return bandOf(preview.actions);
    return null; // a charge and a withdrawal are not Move rows

  });

  // Move's four bands, grouped straight off the engine's own `moves`/`push` maps — no pathing
  // recomputed here, just the `actions` each already carries.
  const moveBands = $derived.by<Record<1 | 2 | 3, string[]> & { push: string[] }>(() => {
    const bands: Record<1 | 2 | 3, string[]> = { 1: [], 2: [], 3: [] };
    if (act) for (const [cell, m] of act.moves) bands[bandOf(m.actions)].push(cell);
    return { ...bands, push: act ? [...act.push.keys()] : [] };
  });
  const bandStyle = (n: MoveBand): HighlightStyle => (n === 'push' ? 'push' : n === 1 ? 'move' : n === 2 ? 'moveFar' : 'moveFar3');

  // The standing wash: every band, the moment a unit is selected, before any drag. Hovering a
  // Move row narrows the wash to just that band; a live drag takes over entirely.
  const standingHighlights = $derived.by<{ style: HighlightStyle; cells: string[] }[]>(() => {
    if (!active || !act || preview) return [];
    if (hoveredBand) return [{ style: bandStyle(hoveredBand), cells: moveBands[hoveredBand] }];
    return ([1, 2, 3, 'push'] as const).map((n) => ({ style: bandStyle(n), cells: moveBands[n] }));
  });

  const withdrawCells = $derived(
    act?.withdraw && withdrawOpen && !preview ? act.withdraw.targets.map((t) => t.id) : [],
  );

  const aimCells = $derived(aim && aimed ? [aim.cell] : []);
  const aimStyle = $derived<HighlightStyle>(aimed ? styleFor(aimed.offer) : 'attack');

  const highlights = $derived<{ style: HighlightStyle; cells: string[] }[]>([
    { style: aimStyle, cells: aimCells },
    ...standingHighlights,
    { style: 'move', cells: withdrawCells },
    ...previewHighlights,
  ]);

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
      ring: active?.id === u.id ? 'active' : flashSet.has(u.id) ? 'flash' : null,
    })),
    // Abandoned and captured engines stand alone on the square they were left.
    ...b.units.flatMap((u) => u.engines
      .filter((e) => e.status !== 'crewed')
      .map((e, i): EngineTokenModel => ({ kind: 'engine', id: `${u.id}:engine:${i}`, side: u.side, name: e.name, cell: notation(e.square), ring: null }))),
  ]);

  function performRung(offer: ActionOffer, opt: RungOption, target?: string) {
    const before = game.battle!.log.length;
    takeAction({ type: offer.type, rung: opt.index, target, spell: offer.spell ?? undefined, spend: spendOn(rungKey(offer, opt), rungDials(offer, opt)) });
    for (const e of game.battle!.log.slice(before)) if (e.unit && FREE_STRIKE_RE.test(e.text)) flash(e.unit);
    alloc = {};
  }

  function performWithdraw(w: WithdrawOffer, to?: string) {
    const before = game.battle!.log.length;
    takeAction({ type: 'withdraw', to, spend: spendOn(WITHDRAW_KEY, w.dials) });
    for (const e of game.battle!.log.slice(before)) if (e.unit && FREE_STRIKE_RE.test(e.text)) flash(e.unit);
    alloc = {};
  }

  /** Open the popup for a board object: everything this unit can do to it, rung by rung. */
  function aimAt(target: TargetRef, cell: string, label: string) {
    if (!active) return;
    const rows = offersAt(b, target, active.id).flatMap((t) => t.rungs.map((opt) => ({ offer: t.offer, opt })));
    aim = rows.length ? { cell, target, label, rows, index: 0 } : null;
  }

  /** A second touch of the same row takes it, the way the drop popup's rows work. */
  function aimChoose(i: number) {
    if (!aim) return;
    if (aim.index === i) { takeAim(); return; }
    aim = { ...aim, index: i };
  }

  function takeAim() {
    const a = aim;
    const row = a?.rows[a.index];
    if (!a || !row) return;
    aim = null;
    // The id goes through only where the rung actually names it: Guard takes none, and a
    // Rally on your own piece must not arrive carrying your own id as its ally.
    const names = row.opt.targets.some((t) => t.kind === a.target.kind && t.id === a.target.id);
    performRung(row.offer, row.opt, names ? a.target.id : undefined);
  }

  function onCell(e: BoardEventOf<'cell'>) {
    // A click on the parked destination confirms the row it has chosen; a click anywhere else
    // abandons it and means whatever it would have meant with nothing parked.
    if (pending) {
      if (pending.cell === e.cell) { commit(); return; }
      pending = null;
    }
    aim = null;
    const w = act?.withdraw;
    if (w && withdrawOpen && w.targets.some((t) => t.id === e.cell)) performWithdraw(w, e.cell);
  }
  function onToken(e: BoardEventOf<'token'>) {
    // A charge parks on its approach cell, so clicking the enemy is what confirms it.
    if (pending) {
      if (picked?.kind === 'charge' && picked.enemy === e.id) { commit(); return; }
      pending = null;
    }
    const u = b.units.find((x) => x.id === e.id);
    aimAt({ kind: 'unit', id: e.id }, u ? notation(u.square) : '', u?.name ?? e.id);
  }
  // A wall has no cell of its own; its popup opens over the first of the two it divides.
  function onEdge(e: BoardEventOf<'edge'>) {
    pending = null;
    aimAt({ kind: 'wall', id: e.edge }, e.edge.split('|')[0], e.edge.replace('|', ' / '));
  }

  function pickUnit(u: Unit) {
    if (u.status !== 'active' || u.side !== b.pending || b.activated.includes(u.id)) return;
    selectUnit(u.id);
    boardRef?.centerOn(notation(u.square));
  }

  const grantedLabel = (type: LadderType, granted: Grade) => rungOf(type, granted).label;
  const aboveLabel = (type: LadderType, index: number) => rungOf(type, Math.min(3, index + 1) as Grade).label;

  const status = (u: Unit) => [
    u.guard ? `${rungOf('guard', u.guard.rung).label.toLowerCase()} +${u.guard.defence} Defence` : '',
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

{#snippet popupHead(label: string)}
  <div class="popup-head">
    <span>{label}</span>
    <span class="popup-actions" title="Actions left this activation">
      {#each Array(ACTIONS_PER_ACTIVATION) as _, i (i)}<span class="pip circle" class:on={i < left}></span>{/each}
    </span>
  </div>
{/snippet}

{#snippet popupFoot(confirm: () => void)}
  <div class="popup-foot">
    <button class="primary" onclick={confirm}>Confirm</button>
    <span class="muted">
      {cost} of {left} action{left === 1 ? '' : 's'}{cost >= left ? ' — ends the activation' : ''}
    </span>
  </div>
{/snippet}

<svelte:window onkeydown={onKey} />

<div class="battle">
  <div class="battle-top">
    <div class="battle-top-left">
      <strong>Round {b.round} / 6</strong>
      <span class={b.pending === 'attacker' ? 'side-att' : 'side-def'}>{b.pending}</span> to activate
      {#if active}<span class="muted">· {active.name}</span>{/if}
      <span class="muted">· {spec}</span>
    </div>
    <div class="row">
      <button onclick={undo} disabled={!game.history.length} title="Undo the last action">Undo</button>
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
      {highlights}
      dragPath={previewPath}
      draggable={active?.id ?? null}
      oncell={active ? onCell : undefined}
      ontoken={active ? onToken : undefined}
      onedge={active ? onEdge : undefined}
      ondrag={active ? onBoardDrag : undefined}
      ondrop={active ? onBoardDrop : undefined}
    />
    {#if drag}
      <div class="drag-hud">
        <strong>{rowLabel(drag)}</strong>
        <span class="muted">{drag.cell} — {rowDetail(drag)}</span>
      </div>
    {/if}
    {#if pending && anchor}
      <BoardPopup x={anchor.x} y={anchor.y}>
        {@render popupHead(pending.cell)}
        {#each pending.rows as row, i (rowKey(row))}
          <button class="popup-row" class:on={i === pending.index} onclick={() => choose(i)}>
            <span class="popup-verb">{rowLabel(row)}</span>
            <span class="muted">{rowDetail(row)}</span>
          </button>
          {#if i === pending.index && row.kind === 'charge' && active}
            <div class="rung-chips">
              {#each FIGHT_RUNGS as g (g)}
                {@const access = rungAccess(active, 'fight', g)}
                <button
                  class="rung-chip {access}"
                  class:on={chargeRung === g}
                  disabled={access === 'locked'}
                  onclick={() => { if (pending) pending = { ...pending, rung: g }; }}
                >
                  {rungOf('fight', g).label}
                  {#if access === 'reach'}<span class="chip-note">gamble</span>{/if}
                </button>
              {/each}
            </div>
          {/if}
        {/each}
        {@render popupFoot(commit)}
      </BoardPopup>
    {/if}
    {#if aim && anchor && active && !pending}
      <BoardPopup x={anchor.x} y={anchor.y}>
        {@render popupHead(aim.label)}
        {#each aim.rows as row, i (rungKey(row.offer, row.opt))}
          <button class="popup-row" class:on={i === aim.index} onclick={() => aimChoose(i)}>
            <span class="popup-verb">
              {row.offer.label} · {row.opt.label}
              {#if row.opt.access === 'reach'}<span class="chip-note">gamble</span>{/if}
            </span>
            <span class="muted">{row.opt.detail}</span>
          </button>
          {#if i === aim.index}
            {@const d = rungDials(row.offer, row.opt)}
            {@const sp = spendOn(rungKey(row.offer, row.opt), d)}
            {#if row.opt.access === 'reach' && row.offer.reachDc !== null}
              <p class="popup-gamble">
                DC {row.offer.reachDc} · d20{row.offer.reachModifier >= 0 ? '+' : ''}{row.offer.reachModifier + sp.push * d.step}.
                Fail → {rungOf(row.offer.type, row.offer.granted).label}.
              </p>
            {/if}
            {#if d.extra > 0 && DIALS.some((x) => d[x])}
              <div class="popup-dials">
                {#each DIALS.filter((x) => d[x]) as dial (dial)}
                  <div class="dial">
                    <button class="dial-step" disabled={sp[dial] === 0} aria-label="less" onclick={() => setDial(rungKey(row.offer, row.opt), d, dial, sp[dial] - 1)}>−</button>
                    <span class="dial-n">{sp[dial]}</span>
                    <button class="dial-step" disabled={used(sp) >= d.extra} aria-label="more" onclick={() => setDial(rungKey(row.offer, row.opt), d, dial, sp[dial] + 1)}>+</button>
                    <span class="dial-buys">{perAction(row.offer, dial, d.step, active.speed)}</span>
                  </div>
                {/each}
              </div>
            {/if}
            <p class="popup-totals">
              {#each totals(row.offer, row.opt, sp, active) as line (line)}<span class="total">{line}</span>{/each}
            </p>
          {/if}
        {/each}
        {@render popupFoot(takeAim)}
      </BoardPopup>
    {/if}
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
        <div class="row action-pips">
          {#each Array(ACTIONS_PER_ACTIVATION) as _, i (i)}<span class="pip circle" class:on={i < active.actions}></span>{/each}
          <span class="muted">{active.actions} action{active.actions === 1 ? '' : 's'} left</span>
          <button class="end-activation" onclick={() => endActivation()}>End activation</button>
        </div>
        <table class="stats"><tbody>
          <tr><td>Strike</td><td class="stat">{active.stats.strike === null ? '—' : '+' + active.stats.strike}</td><td>Volley</td><td class="stat">{active.stats.volley === null ? '—' : `+${active.stats.volley} · ${['—', 'close', 'long', 'extreme'][Math.max(0, reachOf(b, active))]}`}</td></tr>
          <tr><td>Defence</td><td class="stat">{active.stats.defence}</td><td>Will</td><td class="stat">+{active.stats.will}</td></tr>
          <tr><td>Disorder</td><td class="stat">{active.disorder}/{active.quality}</td><td>Level DC</td><td class="stat">{levelDc(active.level)}</td></tr>
          <tr><td>Move</td><td class="stat">{active.speed} ft{act && act.feet ? ` (+${act.feet} banked)` : ''}</td><td>Engaged</td><td>{engagedEnemies(b, active).length}</td></tr>
          {#if active.tactics.length}<tr><td>Tactics</td><td colspan="3">{active.tactics.join(', ')}</td></tr>{/if}
          {#if status(active)}<tr><td>Status</td><td colspan="3">{status(active)}</td></tr>{/if}
        </tbody></table>
      </div>

      <!-- Move opens with the selection rather than staying pinned: its bands are the same
           ones the board washes, and the rows track a live drag both ways. -->
      {#if act}
        <div class="card move-card">
          <button
            class="move-head"
            aria-expanded={moveOpen}
            onclick={() => { moveOpen = !moveOpen; if (!moveOpen) hoveredBand = null; }}
          >
            <h3>Move</h3>
            <span class="muted">{moveOpen ? '— drag the token, or read the bands' : `— ${moveBands[1].length + moveBands[2].length + moveBands[3].length} cells reachable`}</span>
          </button>
          {#if moveOpen}
          <div class="move-rows">
            {#each ([1, 2, 3] as const) as n (n)}
              <div
                class="move-row band-{n}"
                class:current={dragBand === n}
                role="group"
                onmouseenter={() => { hoveredBand = n; }}
                onmouseleave={() => { if (hoveredBand === n) hoveredBand = null; }}
              >
                <span class="move-row-label">{n} action{n > 1 ? 's' : ''}</span>
                <span class="muted">{moveBands[n].length} cell{moveBands[n].length === 1 ? '' : 's'} reachable</span>
              </div>
            {/each}
            <div
              class="move-row band-push"
              class:current={dragBand === 'push'}
              role="group"
              onmouseenter={() => { hoveredBand = 'push'; }}
              onmouseleave={() => { if (hoveredBand === 'push') hoveredBand = null; }}
            >
              <span class="move-row-label">Push</span>
              <span class="muted">
                {#if preview?.kind === 'push'}
                  DC {preview.dc} · fail and you stop at {preview.fallback}
                {:else}
                  DC {pushDcFor(active)} · a fail stops you at the furthest cell you can afford
                {/if}
              </span>
            </div>
          </div>
          {/if}
        </div>
      {/if}

      <!-- Withdraw is no longer a ladder: one Escape check per holder, and the four degrees
           are what Scatter, Break off and Fighting retreat used to name. -->
      {#if act?.withdraw}
        {@const w = act.withdraw}
        {@const sp = spendOn(WITHDRAW_KEY, w.dials)}
        <div class="card withdraw-card">
          <button class="move-head" aria-expanded={withdrawOpen} onclick={() => { withdrawOpen = !withdrawOpen; }}>
            <h3>Withdraw</h3>
            <span class="muted">{withdrawOpen ? '— break contact' : `— ${w.targets.length} cells`}</span>
          </button>
          {#if withdrawOpen}
            {#each w.escapes as e (e.unit)}
              <p class="escape">
                <span class="escape-name">{e.name}</span>
                <span class="muted">DC {e.dc} · d20+{w.modifier + sp.roll * w.dials.step}</span>
                {#if e.follows}<span class="tag">gives no retreat — follows you</span>{/if}
              </p>
            {:else}
              <p class="muted">Nothing holds you. Run for your own edge.</p>
            {/each}
            <p class="muted rung-detail">
              Crit → away, and unfollowed. Success → away clean. Fail → that enemy strikes free.
              Crit fail → it strikes free, you gain 1 disorder, and you do not break contact.
            </p>
            {#if w.dials.extra > 0 && DIALS.some((x) => w.dials[x])}
              <div class="dials">
                <div class="dial-head">
                  <span>Commit actions</span>
                  <span class="muted">{used(sp)} of {w.dials.extra} spare</span>
                </div>
                {#each DIALS.filter((x) => w.dials[x]) as dial (dial)}
                  <div class="dial">
                    <button class="dial-step" disabled={sp[dial] === 0} aria-label="less" onclick={() => setDial(WITHDRAW_KEY, w.dials, dial, sp[dial] - 1)}>−</button>
                    <span class="dial-n">{sp[dial]}</span>
                    <button class="dial-step" disabled={used(sp) >= w.dials.extra} aria-label="more" onclick={() => setDial(WITHDRAW_KEY, w.dials, dial, sp[dial] + 1)}>+</button>
                    <span class="dial-buys">{perAction(null, dial, w.dials.step, active.speed)}</span>
                    <span class="dial-sum">{dialSum(dial, sp[dial], w.dials.step, active.speed)}</span>
                  </div>
                {/each}
              </div>
            {/if}
            <p class="totals">
              {#each withdrawTotals(w, sp, active) as line (line)}<span class="total">{line}</span>{/each}
            </p>
            <div class="row rung-go">
              {#if w.targets.length}
                <select bind:value={chosen[WITHDRAW_KEY]}>
                  {#each w.targets as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
                </select>
                <button onclick={() => performWithdraw(w, chosen[WITHDRAW_KEY] ?? w.targets[0].id)}>Go</button>
              {:else}
                <button onclick={() => performWithdraw(w)}>Go</button>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      {#if !offers.length}
        <p class="muted">Nothing else to do here — end the activation.</p>
      {:else}
        <p class="muted hint">Touch a piece for what you can do to it, or drag your own to move.</p>
      {/if}
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

  .drag-hud {
    position: absolute; top: .6rem; left: .6rem; z-index: 5;
    display: flex; gap: .6rem; align-items: center;
    padding: .35rem .7rem; border-radius: 8px; font-size: .85rem;
    background: var(--card); border: 1px solid var(--rule); box-shadow: 0 2px 8px rgba(0, 0, 0, .25);
    pointer-events: none;
  }
  .popup-head { display: flex; justify-content: space-between; align-items: center; gap: .5rem; padding: .1rem .4rem .3rem; font-weight: 600; color: var(--muted); }
  .popup-actions { display: flex; gap: 2px; }
  .popup-row {
    display: flex; flex-direction: column; gap: .1rem; width: 100%;
    padding: .35rem .5rem; border: 1px solid transparent; border-radius: 7px;
    background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer;
  }
  .popup-row:hover { background: var(--band); }
  .popup-row.on { border-color: var(--accent); background: var(--band); }
  .popup-verb { font-weight: 600; }
  .rung-chips { display: flex; gap: .3rem; padding: .1rem .5rem .3rem 1rem; }
  .rung-chip {
    display: flex; gap: .25rem; align-items: baseline;
    padding: .1rem .4rem; border: 1px solid var(--rule); border-radius: 999px;
    background: transparent; color: var(--ink); font: inherit; font-size: .78rem; cursor: pointer;
  }
  .rung-chip.on { border-color: var(--accent); background: var(--band); }
  .rung-chip:disabled { opacity: .4; cursor: default; }
  .chip-note { font-size: .68rem; color: var(--muted); }
  .popup-foot { display: flex; gap: .5rem; align-items: center; padding: .3rem .5rem 0; border-top: 1px solid var(--rule); margin-top: .3rem; }
  .popup-foot button { font-size: .8rem; padding: .15rem .5rem; }

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

  .action-pips { align-items: center; gap: .3rem; margin: .3rem 0 .1rem; }
  .action-pips .pip { width: .65rem; height: .65rem; }
  .end-activation { margin-left: auto; }

  .move-card h3 { margin: 0; font-size: inherit; }
  .move-head {
    display: flex; align-items: baseline; gap: .4rem; width: 100%;
    margin: 0 0 .4rem; padding: 0; border: 0; background: none;
    color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .move-rows { display: flex; flex-direction: column; gap: .25rem; }
  .move-row {
    display: flex; justify-content: space-between; align-items: baseline; gap: .5rem;
    padding: .3rem .55rem; border-radius: 6px; border-left: 4px solid transparent; background: var(--band);
  }
  .move-row.band-1 { border-left-color: var(--good); }
  .move-row.band-2 { border-left-color: var(--warn); }
  .move-row.band-3 { border-left-color: var(--warn2); }
  .move-row.band-push { border-left-color: var(--bad); }
  .move-row.current { outline: 2px solid var(--accent); outline-offset: -1px; }
  .move-row-label { font-weight: 600; font-size: .85rem; white-space: nowrap; }

  .hint { font-size: .8rem; }
  .popup-gamble { padding: 0 .5rem .2rem 1rem; font-size: .78rem; color: var(--accent); }
  .popup-dials { display: flex; flex-direction: column; gap: .2rem; padding: .1rem .5rem .2rem 1rem; }
  .popup-totals { display: flex; flex-wrap: wrap; gap: .25rem; padding: 0 .5rem .3rem 1rem; margin: 0; }

  .rung-detail { margin: .1rem 0; }
  .rung-go { margin-top: .3rem; }

  .dials { margin: .35rem 0 .25rem; padding: .35rem .45rem; border-radius: 6px; background: var(--band); }
  .dial-head { display: flex; justify-content: space-between; align-items: baseline; gap: .5rem; font-size: .78rem; font-weight: 600; }
  .dial { display: flex; align-items: center; gap: .3rem; margin-top: .25rem; font-size: .8rem; }
  .dial-step {
    width: 1.35rem; height: 1.35rem; padding: 0; line-height: 1;
    border: 1px solid var(--rule); border-radius: 4px; background: var(--card); color: var(--ink); cursor: pointer;
  }
  .dial-step:disabled { opacity: .35; cursor: default; }
  .dial-n { min-width: .8rem; text-align: center; font-weight: 600; }
  .dial-buys { color: var(--muted); }
  .dial-sum { margin-left: auto; font-weight: 600; color: var(--accent); white-space: nowrap; }

  .totals { display: flex; flex-wrap: wrap; gap: .25rem; margin: .25rem 0; }
  .total {
    padding: .05rem .4rem; border-radius: 999px; font-size: .74rem;
    border: 1px solid var(--accent); color: var(--accent); white-space: nowrap;
  }

  .withdraw-card h3 { margin: 0; font-size: inherit; }
  .escape { display: flex; flex-wrap: wrap; align-items: baseline; gap: .35rem; margin: .15rem 0; font-size: .82rem; }
  .escape-name { font-weight: 600; }
  .tag { padding: .02rem .35rem; border-radius: 999px; border: 1px solid var(--bad); color: var(--bad); font-size: .7rem; }
</style>
