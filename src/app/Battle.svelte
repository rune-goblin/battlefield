<script lang="ts">
  import {
    ACTIONS_PER_ACTIVATION, activation, activeUnit, CELL_FEET, engagedEnemies, HEART_BONUS, isOutflanked, isRouted, isShaken, levelDc, MAX_WOUNDS, movePath, notation,
    offersAt, reachOf, rungCostFor, rungOf, TREE_TARGET, withdrawTargets,
    type ActionOffer, type ChargeOption, type Grade, type LadderType, type MoveReach, type RungOption,
    type RungTarget, type TargetOffer, type TargetRef, type Tree, type Unit, type WithdrawOffer,
  } from '../engine/index.js';
  import { actionIconUrl, castIconUrl, type ActionIcon, type BoardEventOf, type EngineTokenModel, type HighlightStyle, type TokenModel, type TokenPick, type UnitTokenModel } from '../board/index.js';
  import ActionCost from './ActionCost.svelte';
  import BoardPopup from './BoardPopup.svelte';
  import PixiBoard from './PixiBoard.svelte';
  import { AppShell, MapControls, TopBar } from './shell/index.js';
  import RadialMenu from './RadialMenu.svelte';
  import ArmyReel from './ArmyReel.svelte';
  import { backToSetup, deselectUnit, endActivation, game, selectUnit, takeAction, undo } from './game.svelte.js';

  const b = $derived(game.battle!);
  // Only an army the player has actually chosen is active. The engine falls back to the first
  // one still to act, which would pick for them — the carousel exists so they pick.
  const active = $derived(b.active ? activeUnit(b) : null);
  // The whole engine surface for the active unit in one call: the menu, the movement pool,
  // and where it reaches — `moves`/`charges` drive the drag, `offers` drive the popups.
  const act = $derived(active ? activation(b, active.id) : null);
  const offers = $derived(act?.offers ?? []);
  const roster = $derived(b.units.filter((u) => u.side === b.pending && u.status === 'active'));
  // Once an action is spent the choice is made: the engine refuses a second `select`.
  const locked = $derived(b.begun);

  let boardRef = $state<PixiBoard>();

  // Move's own row, hovered independently of the type row — Move is drag-driven and its bands
  // stay visible without a click (Mark: "it shows status based on interaction").
  type MoveBand = 1 | 2 | 3;
  let hoveredBand = $state<MoveBand | null>(null);
  let moveOpen = $state(true);

  // Further actions a withdrawal puts on ground, another Speed's worth each.
  let runDistance = $state(0);

  // Tracks the pointer's own cell while a spell is armed, so its cast line can follow the
  // cursor before a target is picked — see `cast` below.
  let hoveredCell = $state<string | null>(null);

  // The hover runs both ways: a card in the reel rings its miniature, and a miniature under the
  // pointer lights its card. One unit is hot at a time, whichever end the pointer is at.
  let hoveredCard = $state<string | null>(null);
  // Only a piece with a card of its own: the tie is between the two halves of the reel's own
  // roster, so an enemy under the pointer stays dark.
  const hoveredPiece = $derived(
    roster.find((u) => !b.activated.includes(u.id) && notation(u.square) === hoveredCell)?.id ?? null,
  );
  const hot = $derived(hoveredCard ?? hoveredPiece);

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

  /** The fewest further actions whose run reaches `cell`. `withdrawOffer.targets` is the reach
   * at *full* commitment, so a destination picked off that wash needs its own price quoting —
   * `doWithdrawAction` refuses one the committed distance does not carry. */
  function withdrawNeeds(u: Unit, w: WithdrawOffer, cell: string): number {
    for (let n = 0; n <= w.extra; n++) {
      if (withdrawTargets(b, u, n * u.speed).some((sq) => notation(sq) === cell)) return n;
    }
    return w.extra;
  }
  /** What a withdrawal to `cell` puts on ground: the stepper as set, floored at what the
   * destination needs. */
  const withdrawDistance = (cell?: string) => {
    const w = act?.withdraw;
    if (!w || !active) return 0;
    return Math.min(w.extra, Math.max(runDistance, cell ? withdrawNeeds(active, w, cell) : 0));
  };

  const offerKey = (offer: ActionOffer) => `${offer.type}:${offer.spell ?? ''}`;

  // A new unit drops every open popup and any in-flight drag preview — all of it is
  // per-activation UI state, not part of the engine's own state.
  $effect(() => { void active?.id; aim = null; drag = null; dragTarget = null; pending = null; armed = null; armedTree = null; castPick = null; radial = null; hoveredBand = null; moveOpen = true; runDistance = 0; });

  function styleFor(offer: ActionOffer): HighlightStyle {
    if (offer.spell) return TREE_TARGET[offer.spell] === 'enemy' ? 'attack' : 'deploy';
    if (offer.type === 'shoot' || offer.type === 'fight') return 'attack';
    return 'deploy';
  }

  // --- Drag to move: the primary verb. A path traces cell by cell as the pointer moves,
  // clamped to what the engine's own `moves`/`charges` say is reachable — never recomputed
  // here. Dragging past reach just stalls the preview at the last valid cell rather than
  // drawing an illegal one (see `onBoardDrag`).
  interface MovePreview { kind: 'move'; cell: string; feet: number; actions: number; path: string[]; near: string[]; far: string[] }
  interface ChargePreview { kind: 'charge'; cell: string; enemy: string; feet: number; actions: number; path: string[] }
  // No traced route: a withdrawal breaks contact and leaves, so its arrow is the straight
  // line from where the unit stands to where it is going.
  interface WithdrawPreview { kind: 'withdraw'; cell: string; path: string[] }
  type Preview = MovePreview | ChargePreview | WithdrawPreview;
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
  interface Aim { cell: string; target: TargetRef; label: string; groups: TargetOffer[]; group: number; index: number }
  let aim = $state<Aim | null>(null);
  const aimGroup = $derived(aim?.groups[aim.group] ?? null);
  /** Every rung of the chosen verb that names the aimed target, the unaffordable ones
   * included: a rung you cannot pay for this activation is still worth reading. */
  const aimRungs = $derived.by<RungOption[]>(() => {
    if (!aim || !aimGroup || !active) return [];
    const t = aim.target;
    const own = t.kind === 'unit' && t.id === active.id;
    return aimGroup.offer.rungs.filter((o) => o.cost !== null
      && (o.targets.some((x) => x.kind === t.kind && x.id === t.id) || (own && !o.needsTarget)));
  });
  const aimed = $derived(aimRungs[aim?.index ?? -1] ?? null);
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
  // Cast alone branches before a target: which tree, chosen off a picker anchored on the
  // caster's own piece, narrows what "Cast" then lights up and what the eventual aim popup
  // offers — every other verb still goes straight from the ring to the wash.
  let castPick = $state<ActionOffer[] | null>(null);
  let armedTree = $state<Tree | null>(null);
  const armedProp = $derived(props.find((p) => p.key === armed && p.legal) ?? null);
  const armedCastOffer = $derived(
    armed === 'cast' && armedTree ? (act?.offers.find((o) => o.type === 'cast' && o.spell === armedTree) ?? null) : null,
  );
  // The arm outlives the popup it opened, so cancelling the popup lands back on the wash
  // instead of on nothing. `arming` is the state where the board is waiting to be touched —
  // narrowed to the chosen tree's own targets once one is picked, not Cast's whole book.
  const arming = $derived(
    armedProp && !aim && !pending
      ? (armedCastOffer ? { ...armedProp, label: armedCastOffer.label, cells: offerCells(armedCastOffer) } : armedProp)
      : null,
  );
  // A new activation, or a verb that has run out of targets, drops the arm.
  $effect(() => { if (armed && !armedProp) { armed = null; armedTree = null; } });

  /** One step back up the chain the ring starts: popup, then the wash, then the tree picker
   * (Cast only), then the ring, then nothing. Nothing is committed until the last click, so
   * every stage can be walked out of. */
  function stepBack() {
    if (pending) { pending = null; return; }
    if (aim) { aim = null; return; }
    if (armed) {
      armed = null;
      if (armedTree && active) { armedTree = null; castPick = castOffers(); return; }
      armedTree = null;
      if (active) radial = { cell: notation(active.square) };
      return;
    }
    if (castPick) {
      castPick = null;
      if (active) radial = { cell: notation(active.square) };
      return;
    }
    radial = null;
  }

  /** Every tree the active unit could still cast — a fresh read, not a stored list, so a spent
   * pool point is reflected the moment the picker reopens. */
  const castOffers = () => (act?.offers ?? []).filter((o) => o.type === 'cast' && o.rungs.some((r) => r.legal));

  /** Take a verb off the ring: it lights everything it can touch. One thing to touch means
   * there is nothing to choose, so it opens there at once — which is what keeps Guard a
   * single click, the way it was when the ladder sat straight on the piece. Cast is the one
   * verb with a second choice behind it — which tree — so it branches to that picker instead
   * of lighting the board outright, unless there is only the one tree to pick. */
  function takeProp(p: Prop) {
    if (!p.legal || !active) return;
    pending = null;
    aim = null;
    radial = null;
    if (p.key === 'cast') {
      if (armed === 'cast' || castPick) { armed = null; armedTree = null; castPick = null; return; }
      const offers = castOffers();
      if (offers.length <= 1) {
        armed = 'cast';
        armedTree = offers[0]?.spell ?? null;
        if (p.cells.length === 1) applyProp(p, p.cells[0]);
      } else {
        castPick = offers;
      }
      return;
    }
    if (armed === p.key) { armed = null; return; }
    armed = p.key;
    if (p.cells.length === 1) applyProp(p, p.cells[0]);
  }

  /** The picker's own choice: arm Cast narrowed to this one tree, opening straight to the aim
   * popup when it has only one thing to touch. */
  function chooseTree(o: ActionOffer) {
    castPick = null;
    armed = 'cast';
    armedTree = o.spell;
    const castProp = props.find((p) => p.key === 'cast');
    const cells = offerCells(o);
    if (castProp && cells.length === 1) applyProp(castProp, cells[0]);
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
    // would — and reads its escapes and distance in that popup.
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

  // Cast's own second ring: the tree picker, on the same spot the first ring just vacated.
  const castRadialItems = $derived((castPick ?? []).map((o) => ({
    key: o.spell as string, src: castIconUrl(o.spell!), label: o.label, legal: true,
  })));
  const pickCastTree = (key: string) => {
    const o = castPick?.find((x) => x.spell === key);
    if (o) chooseTree(o);
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
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = aimRungs.length;
      if (n) aim = { ...aim, index: (aim.index + stepBy(e.key, n)) % n };
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const n = aim.groups.length;
      aim = { ...aim, group: (aim.group + (e.key === 'ArrowRight' ? 1 : n - 1)) % n, index: 0 };
    }
  }

  // proto: pan, zoom, a window resize and the board's own recentring each move the cell under
  // the open ring, and no one event covers all four — so the anchor is read every frame while
  // the ring is open, and never otherwise. The tree picker is a second ring on the same spot
  // Cast's own ring held — the caster's own square — so it shares this same tracker.
  let lastAnchor: { x: number; y: number } | null = null;
  $effect(() => {
    const cell = radial?.cell ?? (castPick && active ? notation(active.square) : null);
    if (!cell) { anchor = null; lastAnchor = null; return; }
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
      : row.kind === 'withdraw' ? 'Withdraw here' : 'Move here';
  const rowDetail = (row: Preview) =>
    row.kind === 'charge' ? `${actions(row.actions)}, melee included`
      : row.kind === 'withdraw' ? 'One Escape check per enemy holding you'
        : actionCost(row.actions);
  const rowKey = (row: Preview) => `${row.kind}:${row.kind === 'charge' ? row.enemy : row.cell}`;

  // A charge carries a Fight rung of its own; `doCharge` takes the granted one unless told.
  const FIGHT_RUNGS: Grade[] = [1, 2, 3];
  const chargeRung = $derived(pending?.rung ?? active?.grades.fight ?? 1);
  const chargeCost = (c: ChargePreview, rung: Grade) => {
    const price = active ? rungCostFor(b, active, 'fight', rung) : null;
    return price === null ? null : c.actions - 1 + price;
  };

  /** What each reading of a drop actually costs. */
  const dropCost = (row: Preview): number =>
    row.kind === 'move' ? row.actions
      : row.kind === 'charge' ? (chargeCost(row, chargeRung) ?? row.actions)
        : (act?.withdraw?.cost ?? 1) + withdrawDistance(row.cell);
  const cost = $derived(picked ? dropCost(picked) : aimed ? aimed.cost ?? 0 : 0);
  const left = $derived(act?.actions ?? 0);
  // A caster's own actions stretch what its ordinary three can buy.
  const purse = $derived((act?.actions ?? 0) + (aimGroup?.offer.type === 'cast' ? active?.castPool ?? 0 : 0));

  const previewHighlights = $derived.by<{ style: HighlightStyle; cells: string[] }[]>(() => {
    if (!preview) return [];
    if (preview.kind === 'charge') return [{ style: 'attack', cells: preview.path.slice(1) }];
    if (preview.kind === 'withdraw') return [{ style: 'move', cells: [preview.cell] }];
    return [{ style: 'move', cells: preview.near }, { style: 'moveFar', cells: preview.far }];
  });
  const previewPath = $derived(preview?.path ?? []);
  // Banked movement can carry a unit to a cell for no further action at all, so a reach's
  // cost floors at the 1-action row rather than indexing a row that does not exist.
  const bandOf = (actions: number): MoveBand => Math.max(1, Math.min(3, actions)) as MoveBand;

  // Which Move row the preview's distance falls into, so the panel tracks the drag.
  const dragBand = $derived.by<MoveBand | null>(() => {
    if (!preview) return null;
    if (preview.kind === 'move') return bandOf(preview.actions);
    return null; // a charge and a withdrawal are not Move rows
  });

  // Move's three bands, grouped straight off the engine's own `moves` map — no pathing
  // recomputed here, just the `actions` each already carries.
  const moveBands = $derived.by<Record<MoveBand, string[]>>(() => {
    const bands: Record<MoveBand, string[]> = { 1: [], 2: [], 3: [] };
    if (act) for (const [cell, m] of act.moves) bands[bandOf(m.actions)].push(cell);
    return bands;
  });
  // Contact empties `moves` outright (see `moveReach`), so the Move card would otherwise sit
  // there reading "0 cells reachable" three times over with no reason given.
  const holders = $derived(active ? engagedEnemies(b, active) : []);
  // Every other way a Stride can be closed. Contact at least draws enemies next to you; a root
  // or a spent last action leaves the board looking exactly like ground you could walk onto,
  // so the panel and a dragged token both have to say it out loud.
  interface Stuck { tag: string; why: string }
  const stuck = $derived.by<Stuck | null>(() => {
    if (!active || !act || act.moves.size) return null;
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

  // The piece lifts only while some drop could still land. `stuck` already means no Stride, so
  // with no charge and nowhere to withdraw to there is nothing to carry: lifting it to snap it
  // straight back mimes a move being considered, where the X alone is the answer.
  const anchored = $derived(
    stuck && !act?.charges.length && !act?.withdraw?.targets.length ? active?.id ?? null : null,
  );

  const bandStyle = (n: MoveBand): HighlightStyle => (n === 1 ? 'move' : n === 2 ? 'moveFar' : 'moveFar3');

  // Reach is shown on request, not on selection: selecting a unit used to wash three bands
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
  // A cast's line tracks the pointer's own cell while its target is still being chosen —
  // caster's own cell out to whatever legal cell it sits over — then locks to the popup's
  // target once one is clicked, the same way a shot's arc locks to `aim.cell`.
  const cast = $derived.by(() => {
    if (!active || armed !== 'cast' || !armedTree) return null;
    const to = aim?.cell ?? (hoveredCell && arming?.cells.includes(hoveredCell) ? hoveredCell : null);
    return to ? { from: notation(active.square), to, tree: armedTree } : null;
  });
  const aimStyle = $derived<HighlightStyle>(aimGroup ? styleFor(aimGroup.offer) : 'attack');

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

  // The acting piece's own hex, in its side's colour: once a unit is picked, the board stops
  // offering the choice and marks the one that was made.
  const selectedHex = $derived(active ? { cell: notation(active.square), side: active.side } : null);

  /** Which of the acting side's pieces are still yours to pick. It runs only while the
   * choice is open: the moment a piece is selected the board goes still and every piece
   * returns to full size, with the selected hex carrying the answer instead. */
  function pickOn(u: Unit): TokenPick | null {
    if (b.active || u.side !== b.pending) return null;
    return b.activated.includes(u.id) ? 'spent' : 'ready';
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
      pick: pickOn(u),
      ring: active?.id === u.id ? 'active' : flashSet.has(u.id) ? 'flash' : hot === u.id ? 'selected' : null,
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
    takeAction({ type: offer.type, rung: opt.index, target, spell: offer.spell ?? undefined });
    for (const e of game.battle!.log.slice(before)) if (e.unit && FREE_STRIKE_RE.test(e.text)) flash(e.unit);
  }

  function performWithdraw(w: WithdrawOffer, to?: string) {
    const before = game.battle!.log.length;
    takeAction({ type: 'withdraw', to, distance: withdrawDistance(to) });
    for (const e of game.battle!.log.slice(before)) if (e.unit && FREE_STRIKE_RE.test(e.text)) flash(e.unit);
    runDistance = 0;
  }

  /** Open the popup for a board object: everything this unit can do to it, verb by verb. A
   * prop taken off the tray narrows it to that one verb. */
  function aimAt(target: TargetRef, cell: string, label: string, only: LadderType | null = null) {
    if (!active) return;
    const all = offersAt(b, target, active.id);
    let groups = only ? all.filter((g) => g.offer.type === only) : all;
    // The tree was already chosen at the picker; the popup here is one tier ladder, not a
    // second choice of tree.
    if (only === 'cast' && armedTree) groups = groups.filter((g) => g.offer.spell === armedTree);
    aim = groups.length ? { cell, target, label, groups, group: 0, index: 0 } : null;
    // The granted rung is the one to land on first: it is the cheapest, and the one the
    // player most often wants.
    if (aim) {
      const i = aimRungs.findIndex((o) => o.index === aim!.groups[0].offer.granted && o.legal);
      if (i >= 0) aim = { ...aim, index: i };
    }
  }

  /** A rung is taken the moment it is touched: the price is on the row, so there is nothing
   * left to confirm. */
  function aimChoose(i: number) {
    if (!aim) return;
    aim = { ...aim, index: i };
    takeAim();
  }

  const aimVerb = (i: number) => { if (aim) aim = { ...aim, group: i, index: 0 }; };

  function takeAim() {
    const a = aim;
    const row = aimed;
    const group = aimGroup;
    if (!a || !row || !group || !row.legal) return;
    aim = null;
    armed = null;
    armedTree = null;
    // The id goes through only where the rung actually names it: Guard takes none, and a
    // Rally on your own piece must not arrive carrying your own id as its ally.
    const names = row.targets.some((t) => t.kind === a.target.kind && t.id === a.target.id);
    performRung(group.offer, row, names ? a.target.id : undefined);
    // A cast's resolution burst lands on the clicked cell — the same square the aim popup was
    // anchored on — regardless of what the roll behind it did; a miss still means the spell
    // went off, just not to effect.
    if (group.offer.type === 'cast' && group.offer.spell) boardRef?.burst(a.cell, group.offer.spell);
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
    if (castPick) { stepBack(); return; }
    const p = arming;
    if (p) {
      if (p.cells.includes(e.cell)) applyProp(p, e.cell);
      else stepBack();
      return;
    }
    // Nothing open and bare ground under the click: the pick goes back and the side is
    // choosing again. A unit that has already spent an action keeps its turn — `deselect`
    // refuses — so the click reads as a miss rather than losing what was done.
    deselectUnit();
  }
  function onToken(e: BoardEventOf<'token'>) {
    // Before an army is chosen the board is the second way into the army reel.
    if (!active) {
      const own = b.units.find((x) => x.id === e.id);
      if (own) pickUnit(own, false);
      return;
    }
    // A charge parks on its approach cell, so clicking the enemy is what confirms it.
    if (pending) {
      if (picked?.kind === 'charge' && picked.enemy === e.id) { commit(); return; }
      stepBack();
      return;
    }
    if (aim) { stepBack(); return; }
    if (castPick) { stepBack(); return; }
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
    // Until an action is spent, one of your own pieces still waiting to go is a change of
    // mind, not a target. Verb-first still aims at an ally: `arming` above takes the click.
    if (u && !locked && u.side === b.pending && !b.activated.includes(u.id)) { pickUnit(u, false); return; }
    aimAt({ kind: 'unit', id: e.id }, cell, u?.name ?? e.id);
  }
  // A wall has no cell of its own; its popup opens over the first of the two it divides.
  function onEdge(e: BoardEventOf<'edge'>) {
    if (pending || aim || arming || castPick) { stepBack(); return; }
    aimAt({ kind: 'wall', id: e.edge }, e.edge.split('|')[0], e.edge.replace('|', ' / '));
  }

  /** The ring is the menu while it is open: the board answers nothing (`frozen`), and a press
   * anywhere off the ring closes it and does nothing else. */
  function onWindowPointerDown(e: PointerEvent) {
    if (!radial && !castPick) return;
    if (e.target instanceof Element && e.target.closest('.radial')) return;
    radial = null;
    castPick = null;
  }

  /** `centre` is off when the pick came off the board: the piece is already under the pointer,
   * and moving the map out from under a click loses the ground the player was reading. */
  function pickUnit(u: Unit, centre = true) {
    if (locked && u.id !== b.active) return;
    if (u.status !== 'active' || u.side !== b.pending || b.activated.includes(u.id)) return;
    selectUnit(u.id);
    if (centre) boardRef?.centerOn(notation(u.square));
  }

  const status = (u: Unit) => [
    isRouted(u) ? 'routed' : isShaken(u) ? 'shaken' : '',
    u.guard ? `${rungOf('guard', u.guard.rung).label.toLowerCase()} +${u.guard.defence} Defence` : '',
    u.rooted ? 'rooted' : '',
    u.exposed ? 'exposed' : '',
    u.defense.bonus ? `defended +${u.defense.bonus}` : '',
    u.offense.bonus ? `offense +${u.offense.bonus}` : '',
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
      {#if left > 0}<ActionCost n={left} size="1.05em" />{:else}<span class="muted">no actions left</span>{/if}
    </span>
  </div>
{/snippet}

{#snippet popupFoot(confirm: () => void)}
  <div class="popup-foot">
    <span class="muted">
      Spends {cost} of {left}{cost >= left ? ' — ends the turn' : ''}
    </span>
    <button onclick={stepBack}>Cancel</button>
    <button class="primary" onclick={confirm}>Confirm</button>
  </div>
{/snippet}

{#snippet result()}
  <div class="scrim">
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
  </div>
{/snippet}

<svelte:window onkeydown={onKey} onpointerdown={onWindowPointerDown} />

<AppShell leftTitle="Orders" leftWidth={24} rightTitle="Battle log" rightWidth={21} modal={b.phase === 'ended' ? result : undefined}>
  {#snippet top()}
    <TopBar>
      {#snippet status()}
        <strong>Round {b.round} / 6</strong>
        <span class={b.pending === 'attacker' ? 'side-att' : 'side-def'}>{b.pending}</span>
        {#if active}<span class="muted">· {active.name}{locked ? ' is committed' : ''}</span>
        {:else}<span class="muted">· choose an army</span>{/if}
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
    {#if b.phase === 'battle'}
      <ArmyReel
        units={roster}
        activated={b.activated}
        selected={active?.id ?? null}
        {locked}
        hovered={hoveredPiece}
        pick={pickUnit}
        hover={(id) => { hoveredCard = id; }}
      />
    {/if}
  {/snippet}

  {#snippet map()}
    <div class="mapwrap" class:aiming={arming !== null}>
    <PixiBoard
      bind:this={boardRef}
      board={b.board}
      {tokens}
      mode="battle"
      fill
      frozen={radial !== null || castPick !== null}
      {highlights}
      dragPath={previewPath}
      barred={blockedCell}
      {anchored}
      {shot}
      {cast}
      selected={selectedHex}
      draggable={active?.id ?? null}
      onhover={(e) => { hoveredCell = e.cell; }}
      oncell={active ? onCell : undefined}
      ontoken={onToken}
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
    {#if castPick && anchor && castRadialItems.length}
      <RadialMenu x={anchor.x} y={anchor.y} hole={anchorR} items={castRadialItems} pick={pickCastTree} back={stepBack} />
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
              <span class="row-cost"><ActionCost n={row.kind === 'withdraw' ? 1 : row.kind === 'move' ? Math.max(0, row.actions) : row.actions} /></span>
            </span>
            <span class="muted">{rowDetail(row)}</span>
          </button>
          {#if i === pending.index && row.kind === 'withdraw' && act?.withdraw && active}
            {@const w = act.withdraw}
            {@const needs = withdrawNeeds(active, w, row.cell)}
            {@const distance = withdrawDistance(row.cell)}
            <div class="popup-escapes">
              {#each w.escapes as e (e.unit)}
                <p class="escape">
                  <span class="escape-name">{e.name}</span>
                  <span class="muted">DC {e.dc} · d20+{w.modifier}</span>
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
            {#if w.extra > 0}
              <div class="popup-dials">
                <div class="dial">
                  <button class="dial-step" disabled={distance <= needs} aria-label="less" onclick={() => { runDistance = Math.max(needs, distance - 1); }}>−</button>
                  <span class="dial-n">{distance}</span>
                  <button class="dial-step" disabled={distance >= w.extra} aria-label="more" onclick={() => { runDistance = Math.min(w.extra, distance + 1); }}>+</button>
                  <span class="dial-buys">run another {active.speed / CELL_FEET} square{active.speed > CELL_FEET ? 's' : ''} for <ActionCost n={1} /> each</span>
                </div>
                <p class="muted rung-detail">Runs up to {((1 + distance) * active.speed) / CELL_FEET} squares{needs > 0 ? ` · ${row.cell} needs ${needs}` : ''}</p>
              </div>
            {/if}
          {/if}
          {#if i === pending.index && row.kind === 'charge' && active}
            <div class="rung-chips">
              {#each FIGHT_RUNGS as g (g)}
                {@const total = chargeCost(row, g)}
                {@const can = total !== null && total <= active.actions}
                <button
                  class="rung-chip"
                  class:on={chargeRung === g}
                  disabled={!can}
                  title={total === null ? 'out of reach' : !can ? `needs ${total} actions` : ''}
                  onclick={() => { if (pending) pending = { ...pending, rung: g }; }}
                >
                  {rungOf('fight', g).label}
                  {#if total !== null}<ActionCost n={total} />{/if}
                </button>
              {/each}
            </div>
          {/if}
        {/each}
        {@render popupFoot(commit)}
      </BoardPopup>
    {/if}
    {#if aim && aimGroup && active && !pending}
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
        <!-- The ladder, priced. A rung is taken on touch: the glyph is the whole bargain. -->
        {#each aimRungs as opt, i (opt.rung)}
          <button class="popup-row rung-row" class:on={i === aim.index} class:dim={!opt.legal} disabled={!opt.legal} onclick={() => aimChoose(i)}>
            <span class="popup-verb">
              <span class="row-cost" class:over={(opt.cost ?? 0) > purse}><ActionCost n={opt.cost ?? 0} size="1.15em" /></span>
              {opt.label}
              {#if !opt.legal && opt.reason}<span class="reason">{opt.reason}</span>{/if}
            </span>
            <span class="muted">{opt.detail}</span>
          </button>
        {/each}
        {#if aimGroup.offer.type === 'cast' && active.castPool > 0}
          <p class="popup-onward">Your own <ActionCost n={active.castPool} /> for casting go first.</p>
        {/if}
      </BoardPopup>
    {/if}
  {/snippet}

  {#snippet left()}
    {#if active && act}
      <div class="orders-head">
        <h3 class={active.side === 'attacker' ? 'side-att' : 'side-def'}>{active.name}</h3>
        <span class="muted">{active.side} · {notation(active.square)}</span>
      </div>
      <div class="row action-pips">
        {#if active.actions > 0}<ActionCost n={active.actions} size="1.3em" />{/if}
        <span class="muted">{active.actions} of {ACTIONS_PER_ACTIVATION} left{active.castPool ? ` · ${active.castPool} more for casting` : ''}</span>
      </div>
      <p class="cost-key">
        <ActionCost n={1} /> the rung at your grade. Each rung above it costs <ActionCost n={1} /> more,
        and nothing is rolled for it. One attack an activation.
      </p>

      <table class="stats"><tbody>
        <tr><td>Strike</td><td class="stat">{active.stats.strike === null ? '—' : '+' + active.stats.strike}</td><td>Volley</td><td class="stat">{active.stats.volley === null ? '—' : `+${active.stats.volley} · ${['—', 'short', 'medium', 'long', 'extreme'][Math.max(0, reachOf(b, active))]}`}</td></tr>
        <tr><td>Defence</td><td class="stat">{active.stats.defence}</td><td>Will</td><td class="stat">+{active.stats.will}</td></tr>
        <tr><td>Disorder</td><td class="stat">{active.disorder}/{active.quality}</td><td>Level DC</td><td class="stat">{levelDc(active.level)}</td></tr>
        <tr><td>Move</td><td class="stat">{active.speed} ft{act.feet ? ` (+${act.feet} banked)` : ''}</td><td>Engaged</td><td>{engagedEnemies(b, active).length}</td></tr>
        <tr><td>Grades</td><td colspan="3">Fight {active.grades.fight} · Shoot {active.grades.shoot} · Guard {active.grades.guard} · Rally {active.grades.rally}</td></tr>
        {#if active.tactics.length}<tr><td>Tactics</td><td colspan="3">{active.tactics.join(', ')}</td></tr>{/if}
        {#if status(active)}<tr><td>Status</td><td colspan="3">{status(active)}</td></tr>{/if}
      </tbody></table>

      <!-- Move opens with the selection rather than staying pinned: its bands are the same
           ones the board washes, and the rows track a live drag both ways. -->
      <div class="move-card">
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
              <span class="move-row-label"><ActionCost n={n} size="1.1em" /></span>
              <span class="muted">{moveBands[n].length} cell{moveBands[n].length === 1 ? '' : 's'} reachable</span>
            </div>
          {/each}
        </div>
        {/if}
        {/if}
      </div>

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
        <p class="muted">Nothing else to do here — end the turn.</p>
      {:else}
        <p class="muted hint">Touch a piece for what you can do to it, or drag your own to move.</p>
      {/if}

      <button class="end-turn" onclick={() => endActivation()}>End turn</button>
    {:else}
      <p class="muted">Pick an army off the army reel above, or touch one of your own pieces on the board.</p>
    {/if}
  {/snippet}

  {#snippet right()}
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
    bottom: calc(var(--inset-bottom, 0px) + .85rem);
    left: calc(var(--inset-left, 0px) + .85rem);
    display: flex; gap: .6rem; align-items: center;
    padding: .35rem .7rem; border-radius: 8px; font-size: .85rem;
    background: var(--card); border: 1px solid var(--rule); box-shadow: 0 2px 8px rgba(0, 0, 0, .25);
    pointer-events: none;
  }
  .drag-hud.stuck { border-color: var(--bad); }
  .popup-head { display: flex; justify-content: space-between; align-items: center; gap: .5rem; padding: .1rem 1.3rem .3rem .4rem; font-weight: 600; color: var(--muted); }
  .popup-actions { display: flex; align-items: center; color: var(--accent); }
  .popup-row {
    display: flex; flex-direction: column; gap: .1rem; width: 100%;
    padding: .35rem .5rem; border: 1px solid transparent; border-radius: 7px;
    background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer;
  }
  .popup-row:hover:not(:disabled) { background: var(--band); }
  .popup-row.on { border-color: var(--accent); background: var(--band); }
  .popup-row.dim { opacity: .5; cursor: default; }
  .popup-verb { display: flex; align-items: center; gap: .45rem; font-weight: 600; }
  /* The price sits first on a rung row, in the accent, so the ladder reads as ◆ ◆◆ ◆◆◆ down
     the left edge before any word is read. */
  .row-cost { display: inline-flex; align-items: center; min-width: 2.4rem; color: var(--accent); }
  .row-cost.over { color: var(--muted); }
  .rung-row .popup-verb { gap: .3rem; }
  .reason { margin-left: auto; font-size: .7rem; font-weight: 400; color: var(--muted); }
  .rung-chips { display: flex; gap: .3rem; padding: .1rem .5rem .3rem 1rem; }
  .rung-chip {
    display: flex; gap: .3rem; align-items: center;
    padding: .1rem .45rem; border: 1px solid var(--rule); border-radius: 999px;
    background: transparent; color: var(--ink); font: inherit; font-size: .78rem; cursor: pointer;
  }
  .rung-chip.on { border-color: var(--accent); background: var(--band); }
  .rung-chip:disabled { opacity: .4; cursor: default; }
  .popup-foot { display: flex; gap: .5rem; align-items: center; padding: .3rem .5rem 0; border-top: 1px solid var(--rule); margin-top: .3rem; }
  .popup-foot .muted { margin-right: auto; }
  .popup-foot button { font-size: .8rem; padding: .15rem .5rem; }

  .scrim {
    position: absolute; inset: 0; display: grid; place-items: center; padding: 1rem;
    background: color-mix(in srgb, var(--paper) 70%, transparent); backdrop-filter: blur(3px);
  }
  .scrim .result { max-width: 34rem; max-height: 100%; overflow: auto; }

  .orders-head { display: flex; align-items: baseline; gap: .5rem; }
  .orders-head h3 { margin: 0; }
  .orders-head .muted { font-size: .78rem; }

  .action-pips { align-items: center; gap: .45rem; margin: .3rem 0 .1rem; color: var(--accent); }
  .end-turn { width: 100%; margin-top: auto; }

  .cost-key { margin: .2rem 0 .5rem; font-size: .76rem; color: var(--muted); line-height: 1.7; }

  .move-card h3 { margin: 0; font-size: inherit; }
  .move-head {
    display: flex; align-items: baseline; gap: .4rem; width: 100%;
    margin: 0 0 .4rem; padding: 0; border: 0; background: none;
    color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .move-rows { display: flex; flex-direction: column; gap: .25rem; }
  .move-row {
    display: flex; justify-content: space-between; align-items: center; gap: .5rem;
    padding: .3rem .55rem; border-radius: 6px; background: var(--band);
  }
  .move-note .row-prop { vertical-align: -.35rem; margin-right: .2rem; }
  .move-note { margin: 0; padding: .45rem .55rem; border-radius: 6px; border-left: 4px solid var(--bad); background: var(--band); line-height: 1.45; }
  .move-row.current { outline: 2px solid var(--accent); outline-offset: -1px; }
  .move-row-label { display: inline-flex; align-items: center; min-width: 3rem; color: var(--ink); }

  .hint { font-size: .8rem; }

  .popup-onward { margin: .3rem .5rem 0; padding-top: .3rem; border-top: 1px solid var(--rule); font-size: .74rem; color: var(--muted); }
  .popup-dials { display: flex; flex-direction: column; gap: .2rem; padding: .1rem .5rem .2rem 1rem; }

  .rung-detail { margin: .1rem 0; }
  .popup-escapes { padding: .1rem .5rem .2rem 1rem; font-size: .8rem; }

  .dial { display: flex; align-items: center; gap: .3rem; margin-top: .25rem; font-size: .8rem; }
  .dial-step {
    width: 1.35rem; height: 1.35rem; padding: 0; line-height: 1;
    border: 1px solid var(--rule); border-radius: 4px; background: var(--card); color: var(--ink); cursor: pointer;
  }
  .dial-step:disabled { opacity: .35; cursor: default; }
  .dial-n { min-width: .8rem; text-align: center; font-weight: 600; }
  .dial-buys { color: var(--muted); }

  .escape { display: flex; flex-wrap: wrap; align-items: baseline; gap: .35rem; margin: .15rem 0; font-size: .82rem; }
  .escape-name { font-weight: 600; }
  .tag { padding: .02rem .35rem; border-radius: 999px; border: 1px solid var(--bad); color: var(--bad); font-size: .7rem; }
</style>
