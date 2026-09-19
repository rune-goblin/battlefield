<script lang="ts">
  import type { Side } from '../engine/index.js';
  import type { ControlAssignment, GmSide } from '../runtime/control.js';
  import { commandReporter } from './command-notices.js';
  import { assignSeating, game, reassignTurn, tableUsers } from './game.svelte.js';
  import { useNotifications } from './notification-context.js';
  import { viewer } from './viewer.svelte.js';

  const run = commandReporter(useNotifications());

  const control = $derived(game.control);
  // The record's seating is what the host's roster was last fitted to, so a new record is the
  // moment to read the roster again.
  const users = $derived.by(() => { void game.control; return tableUsers(); });
  const named = (id: string): string => users.find((u) => u.id === id)?.name ?? id;
  const away = (id: string): boolean => users.some((u) => u.id === id && !u.online);

  const SIDES: Side[] = ['attacker', 'defender'];
  const GM_SIDES: GmSide[] = ['attacker', 'defender', 'both'];
  // proto: the seat wording is reserved for review with the rest of the player-facing text.
  const GM_PLAYS: Record<GmSide, string> = {
    attacker: 'The GM plays the attackers',
    defender: 'The GM plays the defenders',
    both: 'The GM plays both armies',
  };
  const byHand = $derived(viewer.isGm && control.mode === 'manual');

  const pending = $derived(game.battle?.phase === 'battle' ? game.battle.pending : null);
  const handsTo = (side: Side, userId: string): boolean =>
    viewer.isGm && side === pending && userId !== game.turn && !away(userId);

  const seatsNow = (): Record<Side, string[]> =>
    ({ attacker: [...control.seats.attacker], defender: [...control.seats.defender] });

  const send = (next: Partial<ControlAssignment>) => run(assignSeating({
    mode: control.mode, gmSide: control.gmSide, seats: seatsNow(), ...next,
  }));

  const other = (side: Side): Side => (side === 'attacker' ? 'defender' : 'attacker');

  /** One user sits on one side at a time, so seating them here takes them off the other. */
  function seat(side: Side, userId: string) {
    if (!userId) return;
    const seats = seatsNow();
    seats[side] = [...seats[side], userId];
    seats[other(side)] = seats[other(side)].filter((u) => u !== userId);
    return send({ mode: 'manual', seats });
  }

  function unseat(side: Side, userId: string) {
    const seats = seatsNow();
    seats[side] = seats[side].filter((u) => u !== userId);
    return send({ mode: 'manual', seats });
  }

  function shift(side: Side, index: number, by: number) {
    const seats = seatsNow();
    const to = index + by;
    if (to < 0 || to >= seats[side].length) return;
    const [user] = seats[side].splice(index, 1);
    seats[side].splice(to, 0, user);
    return send({ mode: 'manual', seats });
  }

  const unseated = (side: Side) => users.filter((u) => !control.seats[side].includes(u.id));
  let picked = $state<Record<Side, string>>({ attacker: '', defender: '' });
  let open = $state(false);
</script>

<div class="seating">
  <button onclick={() => (open = !open)} aria-expanded={open}>Seating</button>
  {#if open}
    <div class="panel">
      {#if viewer.isGm}
        <div class="modes">
          {#each GM_SIDES as choice (choice)}
            <button
              class:selected={control.mode === 'auto' && control.gmSide === choice}
              aria-pressed={control.mode === 'auto' && control.gmSide === choice}
              onclick={() => void send({ mode: 'auto', gmSide: choice })}
            >{GM_PLAYS[choice]}</button>
          {/each}
        </div>
        <p class="muted">
          {#if control.mode === 'manual'}
            The seats below are set by hand.
          {:else if control.gmSide === 'both'}
            The GM plays both armies and every player watches.
          {:else}
            The GM plays one army and every player takes the other.
          {/if}
        </p>
      {/if}

      {#each SIDES as side (side)}
        <div class="army" class:att={side === 'attacker'}>
          <h4>{side === 'attacker' ? 'Attackers' : 'Defenders'}</h4>
          <ol>
            {#each control.seats[side] as userId, i (userId)}
              <li>
                {#if handsTo(side, userId)}
                  <button class="who pass" onclick={() => void run(reassignTurn(userId))} title="Hand the turn to {named(userId)}">{named(userId)}</button>
                {:else}
                  <span class="who" class:away={away(userId)} class:holder={userId === game.turn}>{named(userId)}{away(userId) ? ' · away' : ''}{userId === game.turn ? ' · playing' : ''}</span>
                {/if}
                {#if byHand}
                  <span class="order">
                    <button disabled={i === 0} onclick={() => void shift(side, i, -1)} aria-label="Act earlier">↑</button>
                    <button disabled={i === control.seats[side].length - 1} onclick={() => void shift(side, i, 1)} aria-label="Act later">↓</button>
                    <button onclick={() => void unseat(side, userId)} aria-label="Take the seat back">×</button>
                  </span>
                {/if}
              </li>
            {:else}
              <li class="muted">Nobody — the GM plays this army.</li>
            {/each}
          </ol>
          {#if byHand}
            <div class="add">
              <select bind:value={picked[side]}>
                <option value="">Seat someone…</option>
                {#each unseated(side) as u (u.id)}<option value={u.id}>{u.name}</option>{/each}
              </select>
              <button disabled={!picked[side]} onclick={() => { void seat(side, picked[side]); picked[side] = ''; }}>Seat</button>
            </div>
          {/if}
        </div>
      {/each}
      <p class="muted">Each army's activations pass down its list in turn. A seat whose player is away is skipped.</p>
      {#if viewer.isGm && pending}
        <p class="muted">Click a name in the army now playing to hand that player the turn.</p>
      {/if}

      {#if viewer.isGm && control.mode === 'auto'}
        <button class="hand" onclick={() => void send({ mode: 'manual' })}>Seat players by hand</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .seating { position: relative; }
  .panel {
    position: absolute; right: 0; top: calc(100% + .3rem); z-index: 10; width: 20rem;
    display: flex; flex-direction: column; gap: .5rem; padding: .6rem;
    background: var(--card); border: 1px solid var(--rule); border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, .25); font-size: .85rem;
  }
  .hand { align-self: flex-start; }
  h4 { margin: 0 0 .2rem; font-size: .85rem; color: var(--def); }
  .att h4 { color: var(--att); }
  .modes { display: flex; flex-direction: column; gap: .3rem; }
  button.selected { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--card)); }
  .muted { color: var(--muted); margin: 0; font-size: .78rem; }
  ol { list-style: none; margin: 0 0 .3rem; padding: 0; display: flex; flex-direction: column; gap: .2rem; }
  li { display: flex; align-items: center; justify-content: space-between; gap: .4rem; }
  .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who.away { color: var(--muted); opacity: .55; font-style: italic; }
  .who.holder { font-weight: 600; color: var(--accent); }
  .who.pass { padding: 0 .35rem; text-align: left; }
  .order { display: flex; gap: .15rem; flex: none; }
  .order button { padding: 0 .35rem; font-size: .78rem; }
  .add { display: flex; gap: .3rem; }
  .add select { flex: 1; min-width: 0; }
</style>
