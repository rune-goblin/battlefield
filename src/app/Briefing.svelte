<script lang="ts">
  import ArmyCard from './ArmyCard.svelte';
  import { briefingOf } from './briefing.js';
  import { game, tableUsers } from './game.svelte.js';
  import { gameMap } from './map-style.svelte.js';
  import { startFromBriefing } from './navigation.svelte.js';
  import { useNotifications } from './notification-context.js';
  import { battleTokens, setupTokens } from './presentation.js';
  import { MapControls, TopBar } from './shell/index.js';
  import { presentStage, stage } from './stage-view.svelte.js';

  const notifications = useNotifications();
  const briefing = $derived(briefingOf(game, tableUsers()));
  const board = $derived(game.battle?.board ?? game.setup.board!);
  const tokens = $derived(game.battle ? battleTokens(game.battle) : setupTokens(game.setup));

  let starting = $state(false);
  async function start() {
    starting = true;
    try {
      await startFromBriefing();
    } catch (error) {
      notifications.show({
        id: 'briefing-start', tone: 'error', title: 'The table was not called',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      starting = false;
    }
  }

  presentStage({
    leftTitle: 'Briefing', leftWidth: 30,
    get top() { return top; }, get leftHead() { return head; }, get float() { return float; }, get left() { return left; },
    get board() {
      return { board, tokens, terrainAppearance: gameMap.terrainAppearance, inkMap: gameMap.inkMap };
    },
  });
</script>

{#snippet top()}
  <TopBar>
    {#snippet status()}The players see this battle once you start it.{/snippet}
  </TopBar>
{/snippet}

{#snippet head()}
  <div class="head">
    <button class="primary" disabled={starting} onclick={() => void start()}>Start</button>
  </div>
{/snippet}

{#snippet float()}<MapControls board={stage.board} />{/snippet}

{#snippet left()}
  <section class="card briefing">
    <h3>{briefing.site === null ? 'A battle' : `Hex ${briefing.site}`}</h3>
    <p class="standing">{briefing.standing}</p>
  </section>

  {#each briefing.armies as army (army.side)}
    <ArmyCard side={army.side}>
      <p class="line">{army.line} · played by {army.seats}</p>
      {#each army.factions as faction (faction.name)}
        <h4>{faction.name}</h4>
        <ul>
          {#each faction.units as u (u.id)}
            <li>
              <span class="name">{u.name}</span>
              <span class="meta">{u.meta}</span>
              <span class="state">{u.state ?? ''}</span>
            </li>
          {/each}
        </ul>
      {/each}
    </ArmyCard>
  {/each}
{/snippet}

<style>
  .head { display: flex; }
  .head button { flex: 1; min-width: 0; padding: .35rem .5rem; }

  .briefing h3 { margin: 0; }
  .standing { margin: .3rem 0 0; font-size: var(--type-body); }

  h4 { margin: .6rem 0 0; font-size: var(--type-body); font-weight: 600; color: var(--ink-2); }
  .state { font-size: var(--type-small); color: var(--bad); font-style: italic; white-space: nowrap; }
</style>
