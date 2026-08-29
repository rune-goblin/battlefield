<script lang="ts">
  import {
    ACTIONS_PER_ACTIVATION, activation, activeUnit, CELL_FEET, DIALS, engagedEnemies, guardDefence, HEART_BONUS, isOutflanked, isRouted, isShaken, levelDc, MAX_WOUNDS, movePath, notation,
    offersAt, pushDcFor, pushModifierFor, pushPath, reachOf, routDcFor, rungAccess, rungOf, SPELLS, withdrawTargets,
    type ActionOffer, type ChargeOption, type Dial, type Grade, type LadderType, type MoveReach, type RungOption,
    type RungTarget, type Spend, type SpendDials, type TargetOffer, type TargetRef, type Unit, type WithdrawOffer,
  } from '../engine/index.js';
  import { actionIconUrl, troopArtUrl, type ActionIcon, type BoardEventOf, type EngineTokenModel, type HighlightStyle, type TokenModel, type UnitTokenModel } from '../board/index.js';
  import BoardPopup from './BoardPopup.svelte';
  import PixiBoard from './PixiBoard.svelte';
  import { AppShell, MapControls, TopBar } from './shell/index.js';
  import RadialMenu from './RadialMenu.svelte';
  import { backToSetup, endActivation, game, selectUnit, takeAction, undo } from './game.svelte.js';

  const b = $derived(game.battle!);
  const active = $derived(activeUnit(b));
  // The whole engine surface for the active unit in one call: the menu, the movement pool,
  // and where it reaches — `moves`/`charges` drive the drag, `offers` drive the panel.
  const act = $derived(active ? activation(b, active.id) : null);
  const offers = $derived(act?.offers ?? []);
  const strip = $derived(b.units.filter((u) => u.side === b.pending && u.status === 'active'));

  // One allocation per rung (and one for the withdrawal), so the push dial can be offered
  // only where a reach check actually stands in the way.
  let alloc = $state<Record<string, Spend>>({});
  let boardRef = $state<PixiBoard>();

  // Move's own row, hovered independently of the type row — Move is drag-driven and its bands
  // stay visible without a click (Mark: "it shows status based on interaction").
  type MoveBand = 1 | 2 | 3 | 'push';
  let hoveredBand = $state<MoveBand | null>(null);
  let moveOpen = $state(true);

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
          : `one more square${speed > CELL_FEET ? 's' : ''}' worth of ground`;

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

  /** The fewest committed actions whose Stride reaches `cell`. `withdrawOffer.targets` is the
   * reach at *full* commitment, so a destination picked off that wash needs its own price
   * quoting — `doWithdrawAction` refuses one the committed distance does not carry. */
  function withdrawFloor(u: Unit, w: WithdrawOffer, cell: string): number {
    for (let n = 0; n <= w.dials.extra; n++) {
      if (withdrawTargets(b, u, n * u.speed).some((sq) => notation(sq) === cell)) return n;
    }
    return w.dials.extra;
  }

  /** What a withdrawal to `cell` actually spends: the dials as set, with distance floored at
   * what the destination needs. Distance takes its share of the budget first, so a run the
   * player has already chosen is never quietly shortened by the roll dial. */
  function withdrawSpend(cell?: string): Spend {
    const w = act?.withdraw;
    if (!w || !active) return NONE;
    const sp = spendOn(WITHDRAW_KEY, w.dials);
    if (cell === undefined) return sp;
    const distance = Math.max(sp.distance, withdrawFloor(active, w, cell));
    return { ...NONE, roll: Math.min(sp.roll, Math.max(0, w.dials.extra - distance)), distance };
  }

  function withdrawTotals(w: WithdrawOffer, sp: Spend, u: Unit): string[] {
    const out = w.escapes.map((e) => `Escape ${e.name}: d20+${w.modifier + sp.roll * w.dials.step} vs DC ${e.dc}`);
    if (w.dials.distance) out.push(`Runs up to ${((1 + sp.distance) * u.speed) / CELL_FEET} squares`);
    out.push(`Costs ${w.cost + used(sp)} of ${u.actions} actions`);
    return out;
  }

  const offerKey = (offer: ActionOffer) => `${offer.type}:${offer.spell ?? ''}`;
  const rungKey = (offer: ActionOffer, opt: RungOption) => `${offerKey(offer)}:${opt.index}`;

  // A new unit drops every open popup and any in-flight drag preview — all of it is
  // per-activation UI state, not part of the engine's own state.
  $effect(() => { void active?.id; aim = null; drag = null; dragTarget = null; pending = null; armed = null; radial = null; hoveredBand = null; moveOpen = true; alloc = {}; });

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
  // The cell a drag has pulled to that the piece may not take — an X goes there, since the
  // refusal reads where the player is pulling rather than on the piece under their finger.
  let blockedCell = $state<string | null>(null);
  // The enemy a live drag is pulling into, and whether the drop can reach a melee on it. The
  // mark rides the piece rather than the cell: the overlay's X would sit under the token.
  let dragTarget = $state<{ id: string; attack: boolean } | null>(null);
  // A released drag, parked until the player picks one of its readings and confirms. One drop
  // means more than one thing, and deciding by where the pointer landed decides for the player.
  interface Parked { cell: string; rows: Preview[]; index: number; rung: Grade | null }
  let pending = $state<Parked | null>(null);
  const picked = $derived(pending?.rows[pending.index] ?? null);
  const preview = $derived(drag ?? picked);
  // Touching a board object opens the other popup: every rung that can act on *that*, which
  // is `offersAt`'s whole job. Grouped by verb, because the props are what the eye lands on —
  // a tile row across the top, then the chosen verb's three rungs beneath it.
  interface AimRow { offer: ActionOffer; opt: RungOption }
  interface Aim { cell: string; target: TargetRef; label: string; groups: TargetOffer[]; group: number; index: number }
  let aim = $state<Aim | null>(null);
  const aimGroup = $derived(aim?.groups[aim.group] ?? null);
  const aimed = $derived<AimRow | null>(
    aimGroup && aim ? { offer: aimGroup.offer, opt: aimGroup.rungs[aim.index] } : null,
  );
  let anchor = $state<{ x: number; y: number } | null>(null);
  let anchorR = $state(0);

  // --- The ring. Touching your own piece blooms its verbs around it, so the menu arrives at
  // the piece rather than the player travelling to a menu. Choosing one either acts on your
  // own piece at once (Guard, a self-Rally) or arms it against a target. It sets no mode a
  // player can be stranded in — a verb stays armed only until it is spent, Esc, or a touch
  // anywhere else.
  const ICON_FOR: Record<LadderType, ActionIcon> = {
    fight: 'attack', shoot: 'shoot', guard: 'block', rally: 'rally', cast: 'cast',
  };

  // Always these six, always in this order. A ring is learned by direction, so a verb the
  // situation forbids dims in place — letting it vanish would rotate every other verb onto a
  // new angle and cost the player the muscle memory the ring exists to build.
  type Slot = 'melee' | 'shoot' | 'cast' | 'withdraw' | 'rally' | 'guard';
  const SLOTS: Slot[] = ['melee', 'shoot', 'cast', 'withdraw', 'rally', 'guard'];
  const SLOT_LABEL: Record<Slot, string> = {
    melee: 'Fight', shoot: 'Shoot', cast: 'Cast', withdraw: 'Withdraw', rally: 'Rally', guard: 'Guard',
  };
  const SLOT_STYLE: Record<Slot, HighlightStyle> = {
    melee: 'attack', shoot: 'attack', cast: 'deploy', withdraw: 'move', rally: 'deploy', guard: 'deploy',
  };
  interface Prop {
    key: Slot;
    icon: ActionIcon;
    label: string;
    legal: boolean;
    /** The ladder an aim off this slice narrows to. Charge and Withdraw have none. */
    type: LadderType | null;
    style: HighlightStyle;
    /** Everything this verb can touch right now. */
    cells: string[];
  }

  const cellOf = (id: string) => {
    const u = b.units.find((x) => x.id === id);
    return u ? notation(u.square) : null;
  };
  const targetCell = (t: RungTarget): string | null =>
    t.kind === 'cell' ? t.id : t.kind === 'wall' ? t.id.split('|')[0] : cellOf(t.id);

  /** Where an offer can land, with the unit's own square first when a rung needs no target. */
  function offerCells(offer: ActionOffer): string[] {
    const legal = offer.rungs.filter((r) => r.legal);
    const cells = legal.flatMap((r) => r.targets).map(targetCell).filter((x): x is string => x !== null);
    // A rung that names no target acts on your own piece, which is where its popup opens.
    if (active && legal.some((r) => !r.needsTarget)) cells.unshift(notation(active.square));
    return [...new Set(cells)];
  }

  const props = $derived.by<Prop[]>(() => {
    if (!active || !act) return [];
    const byType = new Map<LadderType, ActionOffer[]>();
    for (const offer of act.offers) {
      const list = byType.get(offer.type);
      if (list) list.push(offer);
      else byType.set(offer.type, [offer]);
    }
    // Charge shares the melee slice with Fight. Charging is how a unit out of contact reaches
    // the fight the slice already holds, so one direction means "hit them" either way.
    const charges = act.charges.map((c) => cellOf(c.unit)).filter((x): x is string => x !== null);
    const w = act.withdraw;

    return SLOTS.map((key): Prop => {
      if (key === 'withdraw') {
        return {
          key, icon: 'withdraw', label: 'Withdraw', type: null, style: 'move',
          legal: !!w && w.targets.length > 0,
          cells: w ? w.targets.map((t) => t.id) : [],
        };
      }
      const type: LadderType = key === 'melee' ? 'fight' : key;
      const offers = byType.get(type) ?? [];
      const cells = [...new Set([...offers.flatMap(offerCells), ...(key === 'melee' ? charges : [])])];
      if (key === 'melee' && !offers.length) {
        return {
          key, icon: 'charge', label: 'Charge', type: null, style: 'attack',
          legal: charges.length > 0,
          cells: charges,
        };
      }
      // One slice per verb, so a caster's whole book sits behind Cast — the aim popup already
      // groups by verb and shows every spell that reaches whatever the player touches.
      const label = key === 'cast' ? 'Cast' : offers[0]?.label ?? SLOT_LABEL[key];
      return {
        key, icon: ICON_FOR[type], label, type, style: SLOT_STYLE[key],
        legal: cells.length > 0,
        cells,
      };
    });
  });

  let armed = $state<string | null>(null);
  const armedProp = $derived(props.find((p) => p.key === armed && p.legal) ?? null);
  // The arm outlives the popup it opened, so cancelling the popup lands back on the wash
  // instead of on nothing. `arming` is the state where the board is waiting to be touched.
  const arming = $derived(armedProp && !aim && !pending ? armedProp : null);
  // A new activation, or a verb that has run out of targets, drops the arm.
  $effect(() => { if (armed && !armedProp) armed = null; });

  /** One step back up the chain the ring starts: popup, then the wash, then the ring, then
   * nothing. Nothing is committed until the last click, so every stage can be walked out of. */
  function stepBack() {
    if (pending) { pending = null; return; }
    if (aim) { aim = null; return; }
    if (armed) {
      armed = null;
      if (active) radial = { cell: notation(active.square) };
      return;
    }
    radial = null;
  }

  /** Take a verb off the ring: it lights everything it can touch. One thing to touch means
   * there is nothing to choose, so it opens there at once — which is what keeps Guard a
   * single click, the way it was when the ladder sat straight on the piece. */
  function takeProp(p: Prop) {
    if (!p.legal || !active) return;
    pending = null;
    aim = null;
    radial = null;
    if (armed === p.key) { armed = null; return; }
    armed = p.key;
    if (p.cells.length === 1) applyProp(p, p.cells[0]);
  }

  /** Spend an armed prop on a board object. */
  function applyProp(p: Prop, cell: string) {
    // A charge is read off the cell rather than the slice: in contact the melee slice fights,
    // out of it the same slice closes.
    const c = p.key === 'melee' ? act?.charges.find((x) => cellOf(x.unit) === cell) : undefined;
    if (c) {
      pending = { cell: c.cell, rows: [chargeRow(c)], index: 0, rung: null };
      return;
    }
    // A withdrawal is a destination, not a target, so it parks the same drop a drag there
    // would — and reads its escapes and dials in that popup rather than a panel card.
    if (p.key === 'withdraw') {
      const rows = rowsAt(cell).filter((r) => r.kind === 'withdraw');
      if (rows.length) pending = { cell, rows, index: 0, rung: null };
      return;
    }
    const u = b.units.find((x) => x.status === 'active' && notation(x.square) === cell);
    const target: TargetRef = u ? { kind: 'unit', id: u.id } : { kind: 'cell', id: cell };
    aimAt(target, cell, u?.name ?? cell, p.type);
  }

  let radial = $state<{ cell: string } | null>(null);
  const radialItems = $derived(props.map((p) => ({
    key: p.key, src: actionIconUrl(p.icon), label: p.label, legal: p.legal,
  })));
  const pickProp = (key: string) => {
    const p = props.find((x) => x.key === key);
    if (p) takeProp(p);
  };

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

  /** Whether Fight already names this enemy — the melee of a unit standing in contact, which
   * needs no ground crossed and so has no charge behind it. */
  const canFight = (enemy: Unit) => offers.some((o) => o.type === 'fight' && o.rungs.some(
    (r) => r.legal && r.targets.some((t) => t.kind === 'unit' && t.id === enemy.id),
  ));

  function onBoardDrag(e: BoardEventOf<'drag'>) {
    if (!active || !act || e.id !== active.id) return;
    dragTarget = null;
    if (e.cell === null) { drag = null; blockedCell = null; return; }
    // Pulling into a piece is a melee and nothing else: the charge that closes on it, or the
    // fight already in contact. The swords go on the target the moment either one stands up.
    const enemy = enemyAt(e.cell);
    if (enemy) {
      const charge = act.charges.find((c) => c.unit === enemy.id);
      dragTarget = { id: enemy.id, attack: !!charge || canFight(enemy) };
      // A charge redraws the route to its approach cell; anything else leaves the trace where
      // it stalled, so the arrow still shows how far the drag did get.
      if (charge) drag = chargeRow(charge);
      blockedCell = null;
      return;
    }
    const next = rowsAt(e.cell)[0];
    // Dragging past reach stalls at the last legal cell rather than drawing an illegal one.
    if (next) { drag = next; blockedCell = null; return; }
    // Nothing this cell can mean: past every action, walled off, impassable, or an ally is
    // standing on it. The X goes under the pointer while the arrow keeps the last legal cell
    // it traced, so the refusal names the ground refused rather than the whole gesture. The
    // piece's own square never takes it — an X there would cover the thing it is about.
    blockedCell = e.cell === notation(active.square) ? null : e.cell;
  }

  function onBoardDrop(e: BoardEventOf<'drop'>) {
    drag = null;
    blockedCell = null;
    dragTarget = null;
    if (!active || !act || e.id !== active.id) return;
    // Dropped on a piece: the charge, or the fight it is already in. A shot is aimed by
    // touching a target, never by dragging into one — a drag is the unit going there.
    const enemy = enemyAt(e.cell);
    if (enemy) {
      const charge = act.charges.find((c) => c.unit === enemy.id);
      if (charge) pending = { cell: charge.cell, rows: [chargeRow(charge)], index: 0, rung: null };
      else aimAt({ kind: 'unit', id: enemy.id }, e.cell, enemy.name, 'fight');
      return;
    }
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
    armed = null;
    const row = p?.rows[p.index];
    if (!p || !row) return;
    // The piece walks the route the drag traced, not the straight line to where it ends.
    if (active) boardRef?.setRoute(active.id, row.path);
    if (row.kind === 'charge') takeAction({ type: 'charge', target: row.enemy, rung: p.rung ?? undefined });
    else if (row.kind === 'move') takeAction({ type: 'move', to: row.cell });
    else if (row.kind === 'push') takeAction({ type: 'push', to: row.cell });
    else if (act?.withdraw) performWithdraw(act.withdraw, row.cell);
  }

  const stepBy = (key: string, length: number) => (key === 'ArrowDown' ? 1 : length - 1);

  function onKey(e: KeyboardEvent) {
    // One Escape, one step back — the same walk out that a click off the target takes.
    if (e.key === 'Escape') { stepBack(); return; }
    if (pending) {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
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
      const n = aim.groups[aim.group].rungs.length;
      aim = { ...aim, index: (aim.index + stepBy(e.key, n)) % n };
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const n = aim.groups.length;
      aim = { ...aim, group: (aim.group + (e.key === 'ArrowRight' ? 1 : n - 1)) % n, index: 0 };
    }
  }

  // proto: pan, zoom, a window resize and the board's own recentring each move the cell under
  // the open ring, and no one event covers all four — so the anchor is read every frame while
  // the ring is open, and never otherwise.
  let lastAnchor: { x: number; y: number } | null = null;
  $effect(() => {
    if (!radial) { anchor = null; lastAnchor = null; return; }
    const cell = radial.cell;
    let frame = 0;
    const follow = () => {
      const p = boardRef?.screenOf(cell);
      if (p && (!lastAnchor || Math.abs(p.x - lastAnchor.x) > 0.5 || Math.abs(p.y - lastAnchor.y) > 0.5)) {
        lastAnchor = { x: p.x, y: p.y };
        anchor = lastAnchor;
      }
      const r = boardRef?.cellRadius(cell);
      if (r && Math.abs(r - anchorR) > 0.5) anchorR = r;
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
    row.kind === 'charge' ? `${actions(row.actions)}, melee included`
      : row.kind === 'push' ? `DC ${row.dc} · a fail stops you at ${row.fallback}, and it spends every action you have left`
        : row.kind === 'withdraw' ? 'One Escape check per enemy holding you'
          : actionCost(row.actions);
  const rowKey = (row: Preview) => `${row.kind}:${row.kind === 'charge' ? row.enemy : row.cell}`;

  // What each reading of a drop actually costs. A push is the odd one: it spends every action
  // the unit has left, win or lose — that is what reaching beyond them all means.
  const dropCost = (row: Preview): number =>
    row.kind === 'move' || row.kind === 'charge' ? row.actions
      : row.kind === 'push' ? (act?.actions ?? 0)
        : act?.withdraw ? act.withdraw.cost + used(withdrawSpend(row.cell)) : 1;
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
  // Contact empties `moves`/`push` outright (see `moveReach`), so the Move card would
  // otherwise sit there reading "0 cells reachable" four times over with no reason given.
  const holders = $derived(active ? engagedEnemies(b, active) : []);
  // Every other way a Stride can be closed. Contact at least draws enemies next to you; a root
  // or a spent last action leaves the board looking exactly like ground you could walk onto,
  // so the panel and a dragged token both have to say it out loud.
  interface Stuck { tag: string; why: string }
  const stuck = $derived.by<Stuck | null>(() => {
    if (!active || !act || act.moves.size || act.push.size) return null;
    // Contact keeps its own card in the panel; here it is one more reason a drag goes nowhere.
    if (holders.length) return {
      tag: 'held in contact',
      why: 'A Stride is closed while you are in contact. Withdraw is the only way off this square.',
    };
    if (isRouted(active)) return {
      tag: 'routed',
      why: 'A routed unit runs for its own edge and no other way. The withdrawal is the only thing it is offered, and it leaves the field when it gets there.',
    };
    if (isShaken(active)) return {
      tag: 'shaken',
      why: 'A shaken unit leaves a square by withdrawing and no other way. Its only other act is Rally — clear a point and it is a unit again.',
    };
    if (active.rooted > 0) return {
      tag: 'rooted',
      why: 'Digging in roots you where you stand: no Stride for the rest of this activation. Your remaining actions still fight, shoot, rally and cast.',
    };
    if (active.speed === 0) return { tag: 'no speed', why: 'This piece has Speed 0. It holds the ground it was placed on.' };
    if (act.actions <= 0) return { tag: 'out of actions', why: 'No actions left to spend — end the activation.' };
    return { tag: 'boxed in', why: 'Nothing adjacent can be entered: the ground around you is blocked or occupied.' };
  });

  // The piece lifts only while some drop could still land. `stuck` already means no Stride and
  // no push, so with no charge and nowhere to withdraw to there is nothing to carry: lifting it
  // to snap it straight back mimes a move being considered, where the X alone is the answer.
  const anchored = $derived(
    stuck && !act?.charges.length && !act?.withdraw?.targets.length ? active?.id ?? null : null,
  );

  const bandStyle = (n: MoveBand): HighlightStyle => (n === 'push' ? 'push' : n === 1 ? 'move' : n === 2 ? 'moveFar' : 'moveFar3');

  // Reach is shown on request, not on selection: selecting a unit used to wash four bands
  // across half the board, which buried the map it was drawn on. The drag arrow says where a
  // move goes; hovering a Move row is how you ask to see the band behind it.
  const bandHighlights = $derived.by<{ style: HighlightStyle; cells: string[] }[]>(() => {
    if (!active || !act || preview || arming || !hoveredBand) return [];
    return [{ style: bandStyle(hoveredBand), cells: moveBands[hoveredBand] }];
  });

  const aimCells = $derived(aim && aimed ? [aim.cell] : []);
  // A shot is the one verb whose two ends are far apart, so it draws its own flight path: the
  // prop on the target says what is coming, the arc says who it is coming from.
  const shot = $derived(
    active && aim && aimGroup?.offer.type === 'shoot' ? { from: notation(active.square), to: aim.cell } : null,
  );
  const aimStyle = $derived<HighlightStyle>(aimed ? styleFor(aimed.offer) : 'attack');

  // An armed prop lights everything it can touch, so picking the verb first still teaches
  // reach — the thing pure object-first hides until you happen to touch a distant enemy.
  const propCells = $derived(arming?.cells ?? []);
  // A withdrawal lights ground to run to, not a target to hit, so it washes like a move.
  const propStyle = $derived<HighlightStyle>(arming?.style ?? 'attack');

  const highlights = $derived<{ style: HighlightStyle; cells: string[] }[]>([
    { style: propStyle, cells: propCells },
    { style: aimStyle, cells: aimCells },
    ...bandHighlights,
    ...previewHighlights,
  ]);

  /** What rides on a piece: the verb being aimed at it right now, or the shield a guarding
   * unit keeps until it acts again. State the board can show is state the panel need not. */
  function propOn(u: Unit): ActionIcon | null {
    if (dragTarget?.id === u.id) return dragTarget.attack ? 'attack' : 'no';
    if (aim?.target.kind === 'unit' && aim.target.id === u.id && aimGroup) return ICON_FOR[aimGroup.offer.type];
    if (picked?.kind === 'charge' && picked.enemy === u.id) return 'charge';
    return u.guard ? 'block' : null;
  }

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
      prop: propOn(u),
      ring: active?.id === u.id ? 'active' : flashSet.has(u.id) ? 'flash' : null,
    })),
    // Abandoned and captured engines stand alone on the square they were left.
    ...b.units.flatMap((u) => u.engines
      .filter((e) => e.status !== 'crewed')
      .map((e, i): EngineTokenModel => ({ kind: 'engine', id: `${u.id}:engine:${i}`, side: u.side, name: e.name, cell: notation(e.square), ring: null }))),
    // An emplacement is a board object in its own right, drawn whoever is working it.
    ...b.engines.map((e, i): EngineTokenModel =>
      ({ kind: 'engine', id: `engine:${i}`, side: e.side, name: e.name, cell: notation(e.square), ring: null })),
  ]);

  function performRung(offer: ActionOffer, opt: RungOption, target?: string) {
    const before = game.battle!.log.length;
    takeAction({ type: offer.type, rung: opt.index, target, spell: offer.spell ?? undefined, spend: spendOn(rungKey(offer, opt), rungDials(offer, opt)) });
    for (const e of game.battle!.log.slice(before)) if (e.unit && FREE_STRIKE_RE.test(e.text)) flash(e.unit);
    alloc = {};
  }

  function performWithdraw(w: WithdrawOffer, to?: string) {
    const before = game.battle!.log.length;
    takeAction({ type: 'withdraw', to, spend: withdrawSpend(to) });
    for (const e of game.battle!.log.slice(before)) if (e.unit && FREE_STRIKE_RE.test(e.text)) flash(e.unit);
    alloc = {};
  }

  /** Open the popup for a board object: everything this unit can do to it, verb by verb. A
   * prop taken off the tray narrows it to that one verb. */
  function aimAt(target: TargetRef, cell: string, label: string, only: LadderType | null = null) {
    if (!active) return;
    const all = offersAt(b, target, active.id);
    const groups = only ? all.filter((g) => g.offer.type === only) : all;
    aim = groups.length ? { cell, target, label, groups, group: 0, index: 0 } : null;
  }

  /** A second touch of the same row takes it, the way the drop popup's rows work. */
  function aimChoose(i: number) {
    if (!aim) return;
    if (aim.index === i) { takeAim(); return; }
    aim = { ...aim, index: i };
  }

  const aimVerb = (i: number) => { if (aim) aim = { ...aim, group: i, index: 0 }; };

  function takeAim() {
    const a = aim;
    const row = aimed;
    if (!a || !row) return;
    aim = null;
    armed = null;
    // The id goes through only where the rung actually names it: Guard takes none, and a
    // Rally on your own piece must not arrive carrying your own id as its ally.
    const names = row.opt.targets.some((t) => t.kind === a.target.kind && t.id === a.target.id);
    performRung(row.offer, row.opt, names ? a.target.id : undefined);
  }

  function onCell(e: BoardEventOf<'cell'>) {
    // A click on the parked destination confirms the row it has chosen. Anywhere else is a
    // cancel: while something is open or armed, a stray click walks one step back rather than
    // meaning something new, so a verb picked by mistake costs one click to undo.
    if (pending) {
      if (pending.cell === e.cell) { commit(); return; }
      stepBack();
      return;
    }
    if (aim) { stepBack(); return; }
    const p = arming;
    if (p) {
      if (p.cells.includes(e.cell)) applyProp(p, e.cell);
      else stepBack();
    }
  }
  function onToken(e: BoardEventOf<'token'>) {
    // A charge parks on its approach cell, so clicking the enemy is what confirms it.
    if (pending) {
      if (picked?.kind === 'charge' && picked.enemy === e.id) { commit(); return; }
      stepBack();
      return;
    }
    if (aim) { stepBack(); return; }
    const u = b.units.find((x) => x.id === e.id);
    const cell = u ? notation(u.square) : '';
    const p = arming;
    if (p) {
      if (p.cells.includes(cell)) applyProp(p, cell);
      else stepBack();
      return;
    }
    // Your own piece is the verbs; anyone else's is what you can do to them.
    if (e.id === active?.id) { radial = { cell }; return; }
    aimAt({ kind: 'unit', id: e.id }, cell, u?.name ?? e.id);
  }
  // A wall has no cell of its own; its popup opens over the first of the two it divides.
  function onEdge(e: BoardEventOf<'edge'>) {
    if (pending || aim || arming) { stepBack(); return; }
    aimAt({ kind: 'wall', id: e.edge }, e.edge.split('|')[0], e.edge.replace('|', ' / '));
  }

  /** The ring is the menu while it is open: the board answers nothing (`frozen`), and a press
   * anywhere off the ring closes it and does nothing else. */
  function onWindowPointerDown(e: PointerEvent) {
    if (!radial) return;
    if (e.target instanceof Element && e.target.closest('.radial')) return;
    radial = null;
  }

  function pickUnit(u: Unit) {
    if (u.status !== 'active' || u.side !== b.pending || b.activated.includes(u.id)) return;
    selectUnit(u.id);
    boardRef?.centerOn(notation(u.square));
  }

  const grantedLabel = (type: LadderType, granted: Grade) => rungOf(type, granted).label;
  const aboveLabel = (type: LadderType, index: number) => rungOf(type, Math.min(3, index + 1) as Grade).label;

  const status = (u: Unit) => [
    isRouted(u) ? 'routed' : isShaken(u) ? 'shaken' : '',
    u.guard ? `${rungOf('guard', u.guard.rung).label.toLowerCase()} +${u.guard.defence} Defence` : '',
    u.rooted ? 'rooted' : '',
    u.exposed ? 'exposed' : '',
    u.warded ? 'warded' : '',
    u.blessed ? 'blessed' : '',
    u.heartened ? `heartened +${HEART_BONUS}` : '',
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
    <span class="muted">
      {cost} of {left} action{left === 1 ? '' : 's'}{cost >= left ? ' — ends the activation' : ''}
    </span>
    <button onclick={stepBack}>Cancel</button>
    <button class="primary" onclick={confirm}>Confirm</button>
  </div>
{/snippet}

<svelte:window onkeydown={onKey} onpointerdown={onWindowPointerDown} />

<AppShell leftTitle="Battle log" leftWidth={21} rightTitle="Orders" rightWidth={24}>
  {#snippet top()}
    <TopBar>
      {#snippet status()}
        <strong>Round {b.round} / 6</strong>
        <span class={b.pending === 'attacker' ? 'side-att' : 'side-def'}>{b.pending}</span> to activate
        {#if active}<span class="muted">· {active.name}</span>{/if}
        <span class="muted">· {spec}</span>
      {/snippet}
      {#snippet tools()}
        <button onclick={undo} disabled={!game.history.length} title="Undo the last action">Undo</button>
        <button onclick={backToSetup}>New battle</button>
      {/snippet}
    </TopBar>
  {/snippet}

  {#snippet float()}
    <MapControls
      board={boardRef}
      army={() => b.units.filter((u) => u.side === (active?.side ?? b.pending) && u.status === 'active').map((u) => notation(u.square))}
      armyLabel="Frame the {active?.side ?? b.pending} force"
    />
  {/snippet}

  {#snippet map()}
    <div class="mapwrap" class:aiming={arming !== null}>
    <PixiBoard
      bind:this={boardRef}
      board={b.board}
      {tokens}
      mode="battle"
      fill
      frozen={radial !== null}
      {highlights}
      dragPath={previewPath}
      barred={blockedCell}
      {anchored}
      {shot}
      draggable={active?.id ?? null}
      oncell={active ? onCell : undefined}
      ontoken={active ? onToken : undefined}
      onedge={active ? onEdge : undefined}
      ondrag={active ? onBoardDrag : undefined}
      ondrop={active ? onBoardDrop : undefined}
    />
    </div>
  {/snippet}

  {#snippet pin()}
    {#if radial && anchor && radialItems.length}
      <RadialMenu x={anchor.x} y={anchor.y} hole={anchorR} items={radialItems} pick={pickProp} />
    {/if}
    {#if drag}
      <div class="drag-hud">
        <strong>{rowLabel(drag)}</strong>
        <span class="muted">{drag.cell} — {rowDetail(drag)}</span>
      </div>
    {:else if blockedCell && stuck}
      <div class="drag-hud stuck">
        <img class="row-prop" src={actionIconUrl('no')} alt="" />
        <strong>Cannot move — {stuck.tag}</strong>
        <span class="muted">{stuck.why}</span>
      </div>
    {/if}
    {#if pending}
      <BoardPopup cell={pending.cell} close={stepBack}>
        {@render popupHead(pending.cell)}
        {#each pending.rows as row, i (rowKey(row))}
          <button class="popup-row" class:on={i === pending.index} onclick={() => choose(i)}>
            <span class="popup-verb">
              {#if row.kind === 'charge'}<img class="row-prop" src={actionIconUrl('charge')} alt="" />{/if}
              {rowLabel(row)}
            </span>
            <span class="muted">{rowDetail(row)}</span>
          </button>
          {#if i === pending.index && row.kind === 'withdraw' && act?.withdraw && active}
            {@const w = act.withdraw}
            {@const sp = withdrawSpend(row.cell)}
            {@const floor = withdrawFloor(active, w, row.cell)}
            <div class="popup-escapes">
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
                Crit → away, and unfollowed. Success → away clean. Fail → that enemy strikes
                free. Crit fail → it strikes free, you gain 1 disorder, and you do not break
                contact.
              </p>
            </div>
            {#if w.dials.extra > 0 && DIALS.some((x) => w.dials[x])}
              <div class="popup-dials">
                {#each DIALS.filter((x) => w.dials[x]) as dial (dial)}
                  {@const least = dial === 'distance' ? floor : 0}
                  <div class="dial">
                    <button class="dial-step" disabled={sp[dial] <= least} aria-label="less" onclick={() => setDial(WITHDRAW_KEY, w.dials, dial, sp[dial] - 1)}>−</button>
                    <span class="dial-n">{sp[dial]}</span>
                    <button class="dial-step" disabled={used(sp) >= w.dials.extra} aria-label="more" onclick={() => setDial(WITHDRAW_KEY, w.dials, dial, sp[dial] + 1)}>+</button>
                    <span class="dial-buys">{perAction(null, dial, w.dials.step, active.speed)}</span>
                    {#if dial === 'distance' && floor > 0}<span class="muted">{row.cell} needs {floor}</span>{/if}
                  </div>
                {/each}
              </div>
            {/if}
            <p class="popup-totals">
              {#each withdrawTotals(w, sp, active) as line (line)}<span class="total">{line}</span>{/each}
            </p>
          {/if}
          {#if i === pending.index && row.kind === 'charge' && active}
            <div class="rung-chips">
              {#each FIGHT_RUNGS as g (g)}
                {@const access = rungAccess(b, active, 'fight', g)}
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
    {#if aim && active && !pending}
      <BoardPopup cell={aim.cell} close={stepBack}>
        {@render popupHead(aim.label)}
        <div class="verb-row" class:solo={aim.groups.length === 1}>
          {#each aim.groups as g, gi (offerKey(g.offer))}
            {@const icon = ICON_FOR[g.offer.type]}
            <button class="verb-tile" class:on={gi === aim.group} onclick={() => aimVerb(gi)}>
              {#if icon}<img src={actionIconUrl(icon)} alt="" />{/if}
              <span>{g.offer.label}</span>
            </button>
            {/each}
        </div>
        {#each aim.groups[aim.group].rungs as opt, i (opt.rung)}
          {@const offer = aim.groups[aim.group].offer}
          <button class="popup-row" class:on={i === aim.index} onclick={() => aimChoose(i)}>
            <span class="popup-verb">
              {opt.label}
              {#if opt.access === 'reach'}<span class="chip-note">gamble</span>{/if}
            </span>
            <span class="muted">{opt.detail}</span>
          </button>
          {#if i === aim.index}
            {@const d = rungDials(offer, opt)}
            {@const sp = spendOn(rungKey(offer, opt), d)}
            {#if opt.access === 'reach' && offer.reachDc !== null}
              <p class="popup-gamble">
                DC {offer.reachDc} · d20{offer.reachModifier >= 0 ? '+' : ''}{offer.reachModifier + sp.push * d.step}.
                Fail → {rungOf(offer.type, offer.granted).label}.
              </p>
            {/if}
            {#if d.extra > 0 && DIALS.some((x) => d[x])}
              <div class="popup-dials">
                {#each DIALS.filter((x) => d[x]) as dial (dial)}
                  <div class="dial">
                    <button class="dial-step" disabled={sp[dial] === 0} aria-label="less" onclick={() => setDial(rungKey(offer, opt), d, dial, sp[dial] - 1)}>−</button>
                    <span class="dial-n">{sp[dial]}</span>
                    <button class="dial-step" disabled={used(sp) >= d.extra} aria-label="more" onclick={() => setDial(rungKey(offer, opt), d, dial, sp[dial] + 1)}>+</button>
                    <span class="dial-buys">{perAction(offer, dial, d.step, active.speed)}</span>
                  </div>
                {/each}
              </div>
            {/if}
            <p class="popup-totals">
              {#each totals(offer, opt, sp, active) as line (line)}<span class="total">{line}</span>{/each}
            </p>
          {/if}
        {/each}
        {@render popupFoot(takeAim)}
      </BoardPopup>
    {/if}
  {/snippet}

  {#snippet bottom()}
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
  {/snippet}

  {#snippet right()}
    {#if b.phase === 'ended'}
      <div class="card result">
        <h2>{b.winner === 'draw' ? (b.endedBy === 'dusk' ? 'Dusk. The field is contested.' : 'Both armies are spent.') : `The ${b.winner} holds the field.`}</h2>
        <div class="unitlist">
          {#each b.units as u (u.id)}
            <div class="unitrow">
              <span class={u.side === 'attacker' ? 'side-att' : 'side-def'}>{u.name}</span>
              <span class="stat">wounds {u.wounds}/{MAX_WOUNDS}</span>
              <span class="stat">disorder {u.disorder}/{u.quality}</span>
              <span class="muted">{u.status === 'active' ? (isRouted(u) ? 'routed' : isShaken(u) ? 'shaken' : 'standing') : u.status}</span>
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
            <span class="muted">
              {#if holders.length}
                — held in contact
              {:else if stuck}
                — {stuck.tag}
              {:else if moveOpen}
                — drag the token, or read the bands
              {:else}
                — {moveBands[1].length + moveBands[2].length + moveBands[3].length} cells reachable
              {/if}
            </span>
          </button>
          {#if moveOpen}
          {#if holders.length}
            <p class="move-note">
              <strong>{holders.map((e) => e.name).join(' and ')}</strong>
              {holders.length === 1 ? 'holds' : 'hold'} you. A Stride is closed while you are in
              contact — <strong>Withdraw</strong> is the only way off this square, and it costs an
              Escape check against each of them.
              {#if act.withdraw}
                Drag to one of its {act.withdraw.targets.length} cell{act.withdraw.targets.length === 1 ? '' : 's'}.
              {/if}
            </p>
          {:else if stuck}
            <p class="move-note">
              <img class="row-prop" src={actionIconUrl('no')} alt="" />
              {stuck.why}
            </p>
          {:else}
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
          {/if}
        </div>
      {/if}


      {#if isRouted(active)}
        <p class="muted">
          Routed at {active.disorder}/{active.quality} — nothing but the withdrawal, and it runs
          for its own edge. Only an adjacent ally's Rally can bring it back.
        </p>
      {:else if isShaken(active)}
        <p class="muted">
          Shaken at {active.disorder}/{active.quality} — it may Rally or withdraw, nothing else.
          One more point and it routs.
        </p>
      {:else if !offers.length}
        <p class="muted">Nothing else to do here — end the activation.</p>
      {:else}
        <p class="muted hint">Touch a piece for what you can do to it, or drag your own to move.</p>
      {/if}
    {/if}

  {/snippet}

  {#snippet left()}
    <div class="log" bind:this={logEl}>
      {#each b.log as e, i (i)}
        <p class:round={!e.unit} class={cls(e.check)}>{e.text}</p>
      {/each}
    </div>
  {/snippet}
</AppShell>

<style>
  .mapwrap { width: 100%; height: 100%; }
  .mapwrap.aiming { cursor: crosshair; }
  .battle-strip { display: flex; gap: .5rem; padding: .4rem .75rem; overflow-x: auto; }
  .log { flex: 1; min-height: 8rem; max-height: none; background: none; padding: 0; }

  .verb-row { display: flex; gap: .3rem; padding: .1rem .3rem .35rem; border-bottom: 1px solid var(--rule); margin-bottom: .3rem; }
  /* One verb is a heading, not a choice — the rungs below no longer name it themselves. */
  .verb-row.solo .verb-tile { flex-direction: row; justify-content: center; gap: .45rem; cursor: default; }
  .verb-row.solo .verb-tile img { width: 2rem; height: 1.6rem; }
  .verb-tile {
    display: flex; flex-direction: column; align-items: center; gap: .1rem;
    flex: 1; padding: .2rem; border: 1px solid transparent; border-radius: 8px;
    background: transparent; color: var(--ink); font: inherit; font-size: .72rem; font-weight: 600; cursor: pointer;
  }
  .verb-tile img { width: 2.4rem; height: 1.9rem; object-fit: contain; }
  .verb-tile:hover { background: var(--band); }
  .verb-tile.on { border-color: var(--accent); background: var(--band); }

  .row-prop { width: 1.7rem; height: 1.3rem; object-fit: contain; }

  .drag-hud {
    position: absolute; z-index: 5; max-width: 26rem;
    top: calc(var(--inset-top, 0px) + .6rem);
    left: calc(var(--inset-left, 0px) + .6rem);
    display: flex; gap: .6rem; align-items: center;
    padding: .35rem .7rem; border-radius: 8px; font-size: .85rem;
    background: var(--card); border: 1px solid var(--rule); box-shadow: 0 2px 8px rgba(0, 0, 0, .25);
    pointer-events: none;
  }
  .drag-hud.stuck { border-color: var(--bad); }
  .popup-head { display: flex; justify-content: space-between; align-items: center; gap: .5rem; padding: .1rem 1.3rem .3rem .4rem; font-weight: 600; color: var(--muted); }
  .popup-actions { display: flex; gap: 2px; }
  .popup-row {
    display: flex; flex-direction: column; gap: .1rem; width: 100%;
    padding: .35rem .5rem; border: 1px solid transparent; border-radius: 7px;
    background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer;
  }
  .popup-row:hover { background: var(--band); }
  .popup-row.on { border-color: var(--accent); background: var(--band); }
  .popup-verb { display: flex; align-items: center; gap: .35rem; font-weight: 600; }
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
  .popup-foot .muted { margin-right: auto; }
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
  .move-note .row-prop { vertical-align: -.35rem; margin-right: .2rem; }
  .move-note { margin: 0; padding: .45rem .55rem; border-radius: 6px; border-left: 4px solid var(--bad); background: var(--band); line-height: 1.45; }
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
  .popup-escapes { padding: .1rem .5rem .2rem 1rem; font-size: .8rem; }
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

  .totals { display: flex; flex-wrap: wrap; gap: .25rem; margin: .25rem 0; }
  .total {
    padding: .05rem .4rem; border-radius: 999px; font-size: .74rem;
    border: 1px solid var(--accent); color: var(--accent); white-space: nowrap;
  }

  .escape { display: flex; flex-wrap: wrap; align-items: baseline; gap: .35rem; margin: .15rem 0; font-size: .82rem; }
  .escape-name { font-weight: 600; }
  .tag { padding: .02rem .35rem; border-radius: 999px; border: 1px solid var(--bad); color: var(--bad); font-size: .7rem; }
</style>
