<script lang="ts">
  import { SIDES, type Side } from '../engine/index.js';
  import PixiBoard from './PixiBoard.svelte';
  import { gameMap } from './map-style.svelte.js';
  import { AppShell, MapControls, TopBar } from './shell/index.js';
  import WizardRail from './WizardRail.svelte';
  import { commandReporter } from './command-notices.js';
  import { game, setUnitSide, swapSides } from './game.svelte.js';
  import { useNotifications } from './notification-context.js';
  import { viewer } from './viewer.svelte.js';

  const run = commandReporter(useNotifications());
  const board = $derived(game.setup.board!);

  const SIDE_TITLE: Record<Side, string> = { attacker: 'Attacking army', defender: 'Defending army' };
  const other = (side: Side): Side => (side === 'attacker' ? 'defender' : 'attacker');

  // proto: the wording for a unit nobody imported is reserved for review.
  const UNBANNERED = 'Added by hand';

  const armies = $derived(SIDES.map((side) => {
    const units = game.setup.units.filter((u) => u.side === side);
    const factions = [...new Set(units.map((u) => u.faction ?? UNBANNERED))];
    return {
      side,
      engines: game.setup.emplacements.filter((e) => e.side === side).length,
      levels: units.reduce((sum, u) => sum + u.card.level, 0),
      groups: factions.map((faction) => ({ faction, units: units.filter((u) => (u.faction ?? UNBANNERED) === faction) })),
      count: units.length,
    };
  }));

  const placed = $derived(game.setup.units.some((u) => u.square !== null) || game.setup.emplacements.some((e) => e.square !== null));

  let boardRef = $state<PixiBoard>();
</script>

<AppShell leftTitle="Sides" leftWidth={30}>
  {#snippet top()}
    <TopBar>
      {#snippet status()}
        {#if viewer.isGm}
          Confirm who attacks and who defends. A unit that changes army leaves the board.
        {:else}
          The GM is confirming who attacks and who defends.
        {/if}
      {/snippet}
    </TopBar>
  {/snippet}

  {#snippet rail()}<WizardRail />{/snippet}

  {#snippet map()}
    <PixiBoard shared bind:this={boardRef} {board} tokens={[]} fill
      terrainAppearance={gameMap.terrainAppearance} inkMap={gameMap.inkMap} />
  {/snippet}

  {#snippet float()}<MapControls board={boardRef} />{/snippet}

  {#snippet left()}
    {#if viewer.isGm}
      <section class="card swap">
        <button onclick={() => void run(swapSides())}>⇄ Swap the two armies</button>
        {#if placed}<p class="muted">Pieces already on the board return to the reserve.</p>{/if}
      </section>
    {/if}

    {#each armies as army (army.side)}
      <section class="card army" style:--side={army.side === 'attacker' ? 'var(--att)' : 'var(--def)'}>
        <header><h3>{SIDE_TITLE[army.side]}</h3></header>
        <p class="line">
          {army.count} {army.count === 1 ? 'unit' : 'units'} · {army.levels} levels{army.engines ? ` · ${army.engines} emplaced ${army.engines === 1 ? 'engine' : 'engines'}` : ''}
        </p>
        {#each army.groups as group (group.faction)}
          <h4>{group.faction}</h4>
          <ul>
            {#each group.units as u (u.id)}
              <li>
                <span class="name">{u.card.name}</span>
                <span class="meta">L{u.card.level} {u.card.role}</span>
                {#if viewer.isGm}
                  <button class="move" onclick={() => void run(setUnitSide(u.id, other(army.side)))}
                    title="Move to the {SIDE_TITLE[other(army.side)].toLowerCase()}">
                    {army.side === 'attacker' ? '↓' : '↑'}
                  </button>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="problem">This army has no units.</p>
        {/each}
      </section>
    {/each}
  {/snippet}
</AppShell>

<style>
  section header { display: flex; align-items: baseline; gap: .5rem; }
  section h3 { flex: 1; margin: 0; }
  .army { border-left: 4px solid var(--side); }
  .army h3 { color: var(--side); }
  .swap button { width: 100%; }
  .muted { margin: .4rem 0 0; font-size: .78rem; color: var(--muted); }

  h4 { margin: .6rem 0 0; font-size: .62rem; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
  .line { margin: .3rem 0 0; font-size: .85rem; color: var(--muted); }
  .problem { margin: .4rem 0 0; font-size: .85rem; color: var(--bad); font-weight: 600; }

  ul { list-style: none; margin: .25rem 0 0; padding: 0; }
  li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: .6rem; align-items: center; padding: .22rem 0; border-top: 1px solid color-mix(in srgb, var(--rule) 55%, transparent); font-size: .9rem; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font-size: .75rem; color: var(--muted); white-space: nowrap; }
  .move { padding: 0 .45rem; font-size: .85rem; }
</style>
