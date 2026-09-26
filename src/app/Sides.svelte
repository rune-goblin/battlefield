<script lang="ts">
  import { opponent, SIDES } from '../engine/index.js';
  import ArmyCard from './ArmyCard.svelte';
  import { ARMY_TITLE } from './presentation.js';
  import { gameMap } from './map-style.svelte.js';
  import { MapControls, TopBar } from './shell/index.js';
  import { presentStage, stage } from './stage-view.svelte.js';
  import WizardRail from './WizardRail.svelte';
  import WizardSteps from './WizardSteps.svelte';
  import { commandReporter } from './command-notices.js';
  import { game, setUnitSide, swapSides } from './game.svelte.js';
  import { useNotifications } from './notification-context.js';
  import { viewer } from './viewer.svelte.js';

  const run = commandReporter(useNotifications());
  const board = $derived(game.setup.board!);

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

  presentStage({
    leftTitle: 'Sides', leftWidth: 30,
    get top() { return top; }, get rail() { return rail; }, get leftHead() { return steps; }, get float() { return float; }, get left() { return left; },
    get board() {
      return { board, terrainAppearance: gameMap.terrainAppearance, inkMap: gameMap.inkMap };
    },
  });
</script>

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

{#snippet steps()}<WizardSteps />{/snippet}

{#snippet float()}<MapControls board={stage.board} />{/snippet}

{#snippet left()}
  {#if viewer.isGm}
    <section class="card swap">
      <button onclick={() => void run(swapSides())}>⇄ Swap the two armies</button>
      {#if placed}<p class="muted">Pieces already on the board return to the reserve.</p>{/if}
    </section>
  {/if}

  {#each armies as army (army.side)}
    <ArmyCard side={army.side}>
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
                <button class="move" onclick={() => void run(setUnitSide(u.id, opponent(army.side)))}
                  title="Move to the {ARMY_TITLE[opponent(army.side)].toLowerCase()}">
                  {army.side === 'attacker' ? '↓' : '↑'}
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="problem">This army has no units.</p>
      {/each}
    </ArmyCard>
  {/each}
{/snippet}

<style>
  .swap button { width: 100%; }
  .muted { margin: .4rem 0 0; font-size: var(--type-small); color: var(--muted); }

  h4 { margin: .6rem 0 0; font-size: var(--type-small); color: var(--muted); font-weight: 600; }
  .move { padding: 0 .45rem; font-size: var(--type-body); }
</style>
