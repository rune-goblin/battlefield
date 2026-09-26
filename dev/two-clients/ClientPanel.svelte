<script lang="ts">
  import { onMount } from 'svelte';
  import { isRouted, notation, type Board } from '../../src/engine/index.js';
  import type { EngineTokenModel, TokenModel, TokenPick, UnitTokenModel } from '../../src/board/index.js';
  import PixiBoard from '../../src/app/PixiBoard.svelte';
  import { commandReporter } from '../../src/app/command-notices.js';
  import { createNotificationService, type Notification } from '../../src/app/notifications.js';
  import { createPresentation } from '../../src/app/presentation.js';
  import type { ClientStore } from '../../src/runtime/reconcile.js';
  import type { MemoryLink } from '../../src/adapters/memory/memoryTransport.js';

  interface Props { store: ClientStore; link: MemoryLink; title: string }
  const { store, link, title }: Props = $props();

  // svelte-ignore state_referenced_locally (the panel binds to one store for its life; the seed is that store's first record)
  const { session: seed, userId } = store;
  let session = $state(seed);
  let boardRef = $state<PixiBoard>();

  const notifications = createNotificationService();
  let notices = $state<readonly Notification[]>([]);
  notifications.subscribe((list) => { notices = list; });

  const presentation = createPresentation(seed);
  presentation.connectNotices(notifications, { userId, isGm: false });
  // proto: only the route and the burst play here — enough to show the same action landing on
  // both boards. The ring-flash and the resolved markers/arrows are Battle.svelte's own local
  // state, not part of `PresentationSink`, and this page has no target-marker overlay to feed.
  onMount(() => presentation.connect({
    route: (unit, cells) => boardRef?.setRoute(unit, cells),
    flash: () => {},
    burst: (cell, tree, from) => boardRef?.burst(cell, tree, from),
    resolved: () => {},
  }));
  $effect(() => store.subscribe((next) => { presentation.observe(next); session = next; }));

  const run = commandReporter(notifications);

  let delay = $state(false);
  let drop = $state(false);
  $effect(() => {
    link.faults.delay = delay;
    link.faults.drop = drop ? () => true : undefined;
  });

  const battle = $derived(session.battle);
  const board = $derived<Board | null>(battle?.board ?? null);

  /** Mirrors `Battle.svelte`'s own `pickOn`: which of the pending side's pieces are still
   * theirs to choose, while the choice is open. */
  function pickOn(u: { id: string; side: string; status: string }): TokenPick | null {
    if (!battle || battle.active || u.side !== battle.pending) return null;
    return battle.activated.includes(u.id) ? 'spent' : 'ready';
  }

  const tokens = $derived.by<TokenModel[]>(() => (battle ? [
    ...battle.units.filter((u) => u.status === 'active').map((u): UnitTokenModel => ({
      kind: 'unit', id: u.id, side: u.side, name: u.name, role: u.role, level: u.level,
      cell: notation(u.square), wounds: u.wounds, disorder: u.disorder, routed: isRouted(u),
      engine: u.engines.find((e) => e.status === 'crewed')?.name ?? null,
      verdict: null, statuses: [], pick: pickOn(u), ring: battle.active === u.id ? 'active' : null,
    })),
    ...battle.engines.map((e): EngineTokenModel =>
      ({ kind: 'engine', id: e.id, side: e.side, name: e.name, cell: notation(e.square), ring: null })),
  ] : []));

  const isTurn = $derived(session.turn === userId);
  const active = $derived(battle?.active ? battle.units.find((u) => u.id === battle.active) ?? null : null);
  const roster = $derived(battle
    ? battle.units.filter((u) => u.side === battle.pending && u.status === 'active' && !battle.activated.includes(u.id))
    : []);

  function select(unitId: string): void { void run(store.submit({ type: 'activation.select', unitId })); }
  function guard(): void {
    if (!active) return;
    void run(store.submit({ type: 'action.resolve', action: { type: 'guard', activity: 1, unit: active.id } }));
  }
  function endActivation(): void {
    if (!active) return;
    void run(store.submit({ type: 'activation.end', unitId: active.id }));
  }
</script>

<section class="panel">
  <header>
    <h2>{title}</h2>
    <p>viewer <code>{userId}</code> &middot; revision {session.revision} &middot; turn {session.turn ?? '—'}</p>
  </header>

  <div class="board"><PixiBoard bind:this={boardRef} {board} {tokens} /></div>

  <div class="link-controls">
    <label><input type="checkbox" bind:checked={delay} /> Delay deliveries</label>
    <button type="button" onclick={() => link.flush()}>Release held</button>
    <label><input type="checkbox" bind:checked={drop} /> Drop deliveries</label>
  </div>

  {#if battle}
    <div class="turn">
      {#if !isTurn}
        <p>Waiting on {session.turn ?? 'the table'}.</p>
      {:else if !active}
        <p>Your turn — pick a unit:</p>
        <ul class="roster">
          {#each roster as u (u.id)}
            <li><button type="button" onclick={() => select(u.id)}>{u.name}</button></li>
          {/each}
        </ul>
      {:else}
        <p>Acting: {active.name}</p>
        <button type="button" onclick={guard}>Guard</button>
        <button type="button" onclick={endActivation}>End activation</button>
      {/if}
    </div>
  {/if}

  <ul class="notices">
    {#each notices as n (n.id)}
      <li data-tone={n.tone}><strong>{n.title}</strong> {n.message}</li>
    {/each}
  </ul>
</section>

<style>
  .panel { display: flex; flex-direction: column; gap: .6rem; padding: .8rem; border: 1px solid #445066; border-radius: 6px; background: #171b23; color: #d8dbe2; font-family: system-ui, sans-serif; }
  header h2 { margin: 0; font-size: 1rem; }
  header p { margin: .2rem 0 0; font-size: .8rem; color: #9aa3b5; }
  .board { width: 420px; max-width: 100%; }
  .link-controls { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; font-size: .8rem; }
  .turn { font-size: .85rem; }
  .roster { display: flex; flex-wrap: wrap; gap: .4rem; list-style: none; margin: .3rem 0 0; padding: 0; }
  .notices { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .3rem; font-size: .8rem; }
  .notices li { padding: .35rem .5rem; border-radius: 4px; background: #232838; }
  .notices li[data-tone='error'] { background: #4a2430; }
  .notices li[data-tone='warning'] { background: #4a3c24; }
</style>
