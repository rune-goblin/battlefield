<script lang="ts">
  import type { Side } from '../engine/index.js';
  import type { ControlAssignment } from '../runtime/control.js';
  import { commandReporter } from './command-notices.js';
  import { assignSeating, game, tableUsers } from './game.svelte.js';
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
  // proto: the seat wording is reserved for review with the rest of the player-facing text.
  const armyWord = (side: Side): string => (side === 'attacker' ? 'attacking army' : 'defending army');

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
</script>

{#if viewer.isGm}
  <div class="seating">
    <h3>Seating</h3>
    <div class="modes">
      <button class:selected={control.mode === 'auto'} aria-pressed={control.mode === 'auto'} onclick={() => void send({ mode: 'auto' })}>
        The GM takes one army
      </button>
      <button class:selected={control.mode === 'manual'} aria-pressed={control.mode === 'manual'} onclick={() => void send({ mode: 'manual' })}>
        Seat players by hand
      </button>
    </div>

    {#if control.mode === 'auto'}
      <p class="muted">The GM plays one army and every other player takes the other.</p>
      <div class="modes">
        {#each SIDES as side (side)}
          <button class:selected={control.gmSide === side} aria-pressed={control.gmSide === side} onclick={() => void send({ gmSide: side })}>
            The GM plays the {armyWord(side)}
          </button>
        {/each}
      </div>
    {/if}

    {#each SIDES as side (side)}
      <div class="army" class:att={side === 'attacker'}>
        <h4>{side === 'attacker' ? 'Attackers' : 'Defenders'}</h4>
        <ol>
          {#each control.seats[side] as userId, i (userId)}
            <li>
              <span class="who" class:away={away(userId)}>{named(userId)}{away(userId) ? ' · away' : ''}</span>
              <span class="order">
                <button disabled={i === 0} onclick={() => void shift(side, i, -1)} aria-label="Act earlier">↑</button>
                <button disabled={i === control.seats[side].length - 1} onclick={() => void shift(side, i, 1)} aria-label="Act later">↓</button>
                <button onclick={() => void unseat(side, userId)} aria-label="Take the seat back">×</button>
              </span>
            </li>
          {:else}
            <li class="muted">Nobody — the GM plays this army.</li>
          {/each}
        </ol>
        <div class="add">
          <select bind:value={picked[side]}>
            <option value="">Seat someone…</option>
            {#each unseated(side) as u (u.id)}<option value={u.id}>{u.name}</option>{/each}
          </select>
          <button disabled={!picked[side]} onclick={() => { void seat(side, picked[side]); picked[side] = ''; }}>Seat</button>
        </div>
      </div>
    {/each}
    <p class="muted">Each army's activations pass down its list in turn. A seat whose player is away is skipped.</p>
  </div>
{/if}

<style>
  .seating { display: flex; flex-direction: column; gap: .4rem; margin-top: .8rem; padding: .6rem; background: var(--card); border: 1px solid var(--rule); border-radius: 8px; font-size: .85rem; }
  h3 { margin: 0; font-size: .95rem; }
  h4 { margin: 0 0 .2rem; font-size: .85rem; color: var(--def); }
  .att h4 { color: var(--att); }
  .modes { display: flex; gap: .3rem; flex-wrap: wrap; }
  .modes button { flex: 1; min-width: 8rem; }
  button.selected { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--card)); }
  .muted { color: var(--muted); margin: 0; font-size: .78rem; }
  ol { list-style: none; margin: 0 0 .3rem; padding: 0; display: flex; flex-direction: column; gap: .2rem; }
  li { display: flex; align-items: center; justify-content: space-between; gap: .4rem; }
  .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who.away { color: var(--muted); }
  .order { display: flex; gap: .15rem; flex: none; }
  .order button { padding: 0 .35rem; font-size: .78rem; }
  .add { display: flex; gap: .3rem; }
  .add select { flex: 1; min-width: 0; }
</style>
