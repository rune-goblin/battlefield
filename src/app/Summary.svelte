<script lang="ts">
  import { fortification, SIDES, type Side } from '../engine/index.js';
  import type { TokenModel } from '../board/index.js';
  import { gameMap } from './map-style.svelte.js';
  import { MapControls, TopBar } from './shell/index.js';
  import { presentStage, stage } from './stage-view.svelte.js';
  import WizardRail from './WizardRail.svelte';
  import WizardSteps from './WizardSteps.svelte';
  import ConnectionWarning from './ConnectionWarning.svelte';
  import { declaredReady, game, sideReady, tableUsers } from './game.svelte.js';
  import { engineUnder } from '../services/ArmyPreparationService.js';
  import { goToStage, stageReason, type SetupStage } from './navigation.svelte.js';

  const board = $derived(game.setup.board!);
  const spec = $derived(game.setup.spec);

  const SIDE_STEP: Record<Side, SetupStage> = { attacker: 'attackers', defender: 'defenders' };
  const SIDE_TITLE: Record<Side, string> = { attacker: 'Attacking army', defender: 'Defending army' };

  const armies = $derived(SIDES.map((side) => {
    const units = game.setup.units.filter((u) => u.side === side);
    const engines = game.setup.emplacements.filter((e) => e.square !== null && units.some((u) => u.square === e.square));
    const unplaced = units.filter((u) => u.square === null).length;
    return {
      side, units, engines, unplaced,
      levels: units.reduce((sum, u) => sum + u.card.level, 0),
      problem: !units.length ? 'This army has no units.' : unplaced ? `${unplaced} still off the board.` : null,
    };
  }));

  // An engine no unit stands on belongs to neither army yet.
  const freeEngines = $derived(game.setup.emplacements.filter((e) => !armies.some((a) => a.engines.includes(e))));

  const userName = (id: string) => tableUsers().find((u) => u.id === id)?.name ?? id;
  const seats = (side: Side) => game.control.seats[side].map(userName).join(', ') || 'the GM';

  const field = $derived([
    ['Ground', spec.base],
    ['Grid', `${spec.grid ?? 'hex'} · ${({ 15: 'field', 11: 'large', 9: 'original' } as const)[spec.size ?? 15]}`],
    ['Feature', spec.feature ?? 'none'],
    ['Construction', spec.construction ? `${fortification(spec.construction.tier).name} · tier ${spec.construction.tier}` : 'none'],
    ['Day length', `${game.setup.roundsPerDay ?? 6} rounds`],
    ['Seed', String(spec.seed)],
  ]);

  const tokens = $derived<TokenModel[]>([
    ...game.setup.units.flatMap((u) => u.square ? [{
      kind: 'unit' as const, id: u.id, side: u.side, name: u.card.name, role: u.card.role, level: u.card.level,
      cell: u.square, wounds: 0, disorder: 0, engine: (engineUnder(game.setup, u) ?? u.engines[0])?.name ?? null, verdict: null, statuses: [], pick: null, ring: null,
    }] : []),
    ...game.setup.emplacements.flatMap((e) => e.square && !game.setup.units.some((u) => u.square === e.square) ? [{
      kind: 'engine' as const, id: e.id, side: e.side, name: e.name, cell: e.square, ring: null,
    }] : []),
  ]);

  presentStage({
    leftTitle: 'Review and begin', leftWidth: 30,
    get top() { return top; }, get rail() { return rail; }, get leftHead() { return steps; }, get float() { return float; }, get left() { return left; },
    get board() {
      return { board, tokens, terrainAppearance: gameMap.terrainAppearance, inkMap: gameMap.inkMap };
    },
  });
</script>

{#snippet top()}
  <TopBar>
    {#snippet status()}
      {#if SIDES.every((side) => sideReady(side))}
        Both armies stand on the field. Begin the battle when the table is ready.
      {:else}
        An army is still forming up. Finish its step before the battle begins.
      {/if}
    {/snippet}
  </TopBar>
{/snippet}

{#snippet rail()}<WizardRail />{/snippet}

{#snippet steps()}<WizardSteps />{/snippet}

{#snippet float()}<MapControls board={stage.board} />{/snippet}

{#snippet left()}
  <section class="card">
    <header><h3>Battlefield</h3><button class="edit" onclick={() => goToStage('board')}>Edit</button></header>
    <dl>
      {#each field as [term, value] (term)}<div><dt>{term}</dt><dd>{value}</dd></div>{/each}
    </dl>
    <ConnectionWarning {board} edit={() => goToStage('paint')} />
  </section>

  {#each armies as army (army.side)}
    <section class="card army" style:--side={army.side === 'attacker' ? 'var(--att)' : 'var(--def)'}>
      <header>
        <h3>{SIDE_TITLE[army.side]}</h3>
        <button class="edit" disabled={!!stageReason(SIDE_STEP[army.side])}
          title={stageReason(SIDE_STEP[army.side]) ?? undefined}
          onclick={() => goToStage(SIDE_STEP[army.side])}>Edit</button>
      </header>
      <p class="line">
        {army.units.length} {army.units.length === 1 ? 'unit' : 'units'} · {army.levels} levels · played by {seats(army.side)}
        {#if declaredReady(army.side)} · <span class="ready">ready</span>{/if}
      </p>
      {#if army.problem}<p class="problem">{army.problem}</p>{/if}
      <ul>
        {#each army.units as u (u.id)}
          <li>
            <span class="name">{u.card.name}</span>
            <span class="meta">L{u.card.level} {u.card.role}{u.engines.length ? ` · ⚙ ${u.engines.map((e) => e.name).join(', ')}` : ''}</span>
            <span class="cell" class:off={!u.square}>{u.square ?? 'off board'}</span>
          </li>
        {/each}
        {#each army.engines as e (e.id)}
          <li>
            <span class="name">⚙ {e.name}</span>
            <span class="meta">emplacement{e.hauled ? ' · hauled' : ''} <button class="link" onclick={() => goToStage('siege')}>edit</button></span>
            <span class="cell" class:off={!e.square}>{e.square ?? 'off board'}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/each}

  {#if freeEngines.length}
    <section class="card">
      <header>
        <h3>Unclaimed engines</h3>
        <button class="edit" onclick={() => goToStage('siege')}>Edit</button>
      </header>
      <p class="line">The unit deployed beside one claims it; one left off the board stays out of the battle.</p>
      <ul>
        {#each freeEngines as e (e.id)}
          <li>
            <span class="name">⚙ {e.name}</span>
            <span class="meta">emplacement</span>
            <span class="cell" class:off={!e.square}>{e.square ?? 'off board'}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{/snippet}

<style>
  section header { display: flex; align-items: baseline; gap: .5rem; }
  section h3 { flex: 1; margin: 0; }
  .army { border-left: 4px solid var(--side); }
  .army h3 { color: var(--side); }
  .edit { padding: .1rem .6rem; font-size: .8rem; }

  dl { margin: .5rem 0 0; display: grid; grid-template-columns: 1fr 1fr; gap: .35rem .8rem; }
  dt { font-size: .78rem; font-weight: 600; color: var(--muted); }
  dd { margin: 0; font-size: .92rem; }

  .line { margin: .3rem 0 0; font-size: .85rem; color: var(--muted); }
  .ready { color: var(--good); font-weight: 600; }
  .problem { margin: .4rem 0 0; font-size: .85rem; color: var(--bad); font-weight: 600; }

  ul { list-style: none; margin: .5rem 0 0; padding: 0; }
  li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: .6rem; align-items: baseline; padding: .22rem 0; border-top: 1px solid color-mix(in srgb, var(--rule) 55%, transparent); font-size: .9rem; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font-size: .75rem; color: var(--muted); white-space: nowrap; }
  .cell { min-width: 2.6rem; text-align: right; font-variant-numeric: tabular-nums; }
  .cell.off { color: var(--bad); font-style: italic; font-size: .78rem; }
  .link { border: 0; background: none; padding: 0; color: var(--accent); text-decoration: underline; font-size: inherit; }
</style>
