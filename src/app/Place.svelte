<script lang="ts">
  import type { Side, UnitCard } from '../engine/index.js';
  import { engineArtUrl, troopArtUrl } from '../board/index.js';
  import { gameMap } from './map-style.svelte.js';
  import { MapControls, TopBar } from './shell/index.js';
  import { presentStage, stage } from './stage-view.svelte.js';
  import WizardRail from './WizardRail.svelte';
  import WizardSteps from './WizardSteps.svelte';
  import TroopPicker from './TroopPicker.svelte';
  import Modal from './Modal.svelte';
  import { ARMY_TITLE, sideColour } from './presentation.js';
  import * as store from './game.svelte.js';
  import { resetToExample } from './navigation.svelte.js';
  import type { PieceRef } from '../runtime/commands.js';
  import { onDestroy } from 'svelte';
  import { useNotifications } from './notification-context.js';
  import { createPlaceController } from './place-controller.svelte.js';

  interface Props {
    /** The army step's side. The siege step has none: an engine belongs to whoever stands on it. */
    side?: Side;
    pieces: 'units' | 'engines';
  }
  let { side: stepSide, pieces }: Props = $props();

  const c = createPlaceController(
    { ...store, gameMap, resetToExample, notifications: useNotifications() },
    { get side() { return stepSide; }, get pieces() { return pieces; } },
  );
  onDestroy(c.close);

  function onTrayDragStart(p: PieceRef, e: DragEvent) {
    e.dataTransfer?.setData('text/plain', p.id);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      // Dragging the icon carries the miniature already; dragging the rest of the row would
      // otherwise carry a snapshot of the whole card.
      const icon = (e.currentTarget as HTMLElement).querySelector('img');
      if (icon && e.target !== icon) e.dataTransfer.setDragImage(icon, icon.width / 2, icon.height / 2);
    }
    c.liftFromTray(p);
  }

  presentStage({
    get leftTitle() { return c.siege ? 'Siege engines' : ARMY_TITLE[c.side]; },
    leftWidth: 26,
    get top() { return top; }, get rail() { return rail; }, get leftHead() { return steps; }, get modal() { return modal; }, get float() { return float; }, get left() { return left; },
    get board() { return c.board; },
  });
</script>

{#snippet grip(label: string)}
  <span class="grip" role="presentation" title={`Drag ${label} onto the board`}></span>
{/snippet}

{#snippet statBlock(card: UnitCard)}
  <dl class="stats">
    {#each c.statRows(card) as s (s.label)}
      <div class="statcell" title={s.note}>
        <dt>{s.label}</dt>
        <dd>{s.value}</dd>
      </div>
    {/each}
  </dl>
{/snippet}

{#snippet sheetLines(card: UnitCard)}
  {@const sh = c.sheet(card)}
  {#if sh.movement}<p class="line">{sh.movement}</p>{/if}
  {#if sh.abilities.length || sh.review.length}
    <div class="abilities" aria-label="Troop abilities">
      {#if sh.abilities.length}<p class="caption">Abilities</p>{/if}
      {#each sh.abilities as ability, i (i)}
        <details>
          <summary onclick={(ev) => ev.stopPropagation()}>{ability.summary}</summary>
          <p>{ability.description}</p>
        </details>
      {/each}
      {#if sh.review.length}
        <p class="caption">Not implemented yet</p>
        {#each sh.review as note, i (i)}
          <details class="unplayed">
            <summary onclick={(ev) => ev.stopPropagation()}>{note.label}</summary>
            <p>{note.effect}</p>
          </details>
        {/each}
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet engineOptions()}
  {#each c.engineChoices as e (e.name)}<option value={e.name}>{e.label}</option>{/each}
{/snippet}

{#snippet top()}
  <TopBar>
    {#snippet status()}
      {#if c.unplaced}
        <strong>{c.unplaced}</strong> still to place — drag one onto a lit square, or press Place.
      {:else}
        {c.siege && !c.myEngines.length ? 'Siege engines are optional. Add one, or go on to the armies.' : 'Every piece is placed. Drag a token — or its card — to move it.'}
      {/if}
    {/snippet}
  </TopBar>
{/snippet}

{#snippet rail()}<WizardRail />{/snippet}

{#snippet steps()}<WizardSteps />{/snippet}

{#snippet modal()}
  {#if c.picking}<TroopPicker side={c.side} held={c.held} add={(card) => void c.add(card)} close={() => (c.picking = false)} />{/if}
  {#if c.haulEngine && c.haulUnit}
    {@const haulEngine = c.haulEngine}
    {@const haulUnit = c.haulUnit}
    <Modal title="{haulUnit.card.name} stands on the {haulEngine.name}" layer="stage" width="26rem" tone={sideColour(haulUnit.side)}>
      <p>The unit works the engine from this square. Hauling takes the engine along when the unit moves, at the slower of the two speeds.</p>
      {#snippet actions()}
        <button class="primary" onclick={() => void c.answerHaul(true)}>Haul it</button>
        <button onclick={() => void c.answerHaul(false)}>Work it in place</button>
      {/snippet}
    </Modal>
  {/if}
{/snippet}

{#snippet float()}
  <MapControls
    board={stage.board}
    army={c.armyCells}
    armyLabel={c.siege ? 'Frame the engines' : `Frame the ${c.sideWord} force`}
  />
{/snippet}

{#snippet left()}
  {#if c.siege}
    <div class="card">
      <div class="row">
        <select bind:value={c.engineName}>{@render engineOptions()}</select>
        <button onclick={c.addEngine}>Add engine</button>
      </div>
      <p class="muted">
        Occupy an engine’s hex to claim and operate it immediately. An empty engine hex
        changes hands at round end if only the opposing army stands beside it.
      </p>
    </div>
  {:else}
    <div class="card">
      <div class="row">
        <button class="primary" onclick={() => (c.picking = true)}>Choose troops…</button>
        <button onclick={c.generate}>Generate the {c.sideWord} army</button>
      </div>
      <p class="muted">Put a unit on an engine to claim and work it; an engine that can move may be hauled.</p>
    </div>
  {/if}

  {#if c.siege}
    <h3 class="listhead">Engines</h3>
  {:else}
    <h3 class="listhead {c.side === 'attacker' ? 'side-att' : 'side-def'}">{c.side === 'attacker' ? 'Attackers' : 'Defenders'}</h3>
  {/if}
  <div class="unitlist" style:--side={c.siege ? 'var(--muted)' : sideColour(c.side)}>
    {#each c.mine as u (u.id)}
      {@const p = { kind: 'unit' as const, id: u.id }}
      {@const under = c.workedEngine(u)}
      <div
        class="piece"
        data-selected={c.isSelected('unit', u.id)}
        aria-pressed={c.isSelected('unit', u.id)}
        class:down={!!u.square}
        class:lift={c.isLifted('unit', u.id)}
        role="button"
        tabindex="0"
        draggable="true"
        ondragstart={(e) => onTrayDragStart(p, e)}
        ondragend={c.onTrayDragEnd}
        onclick={() => c.select(p)}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.select(p); } }}
      >
        <div class="head">
          {@render grip(u.card.name)}
          <div class="title">
            <h4 class="name">{u.card.name}</h4>
            <p class="meta">{u.card.role}{u.card.tactics?.length ? ' · ' + u.card.tactics.join(' · ') : ''}</p>
          </div>
          <button class="kill" onclick={(ev) => { ev.stopPropagation(); c.drop(p); }} title="Take out of the force" aria-label="Remove {u.card.name}">×</button>
        </div>

        {@render statBlock(u.card)}

        <div class="plate">
          <div class="portrait">
            <img src={troopArtUrl(u.card.name, u.card.role)} alt="" />
            <span class="level">{u.card.level}</span>
          </div>
          {#if u.square}
            <button class="deploy set" onclick={(ev) => { ev.stopPropagation(); c.unplace(p); }} title="Take it off the board">{u.square}<span class="undo">↩</span></button>
          {:else}
            <button class="deploy" disabled={!c.canAutoPlace(p)} onclick={(ev) => { ev.stopPropagation(); c.placeAuto(p); }} title={`Put it on the board · ${c.deployNote(u)}`}>Place</button>
          {/if}
        </div>

        <div class="details">
          {@render sheetLines(u.card)}
          {#each u.engines as e (e.id)}
            <p class="line">⚙ {e.name} rides along</p>
          {/each}
          {#if under}
            <p class="line">
              ⚙ {under.hauled ? 'Hauls' : 'Works'} the {under.name}
              {#if c.mayHaul(under)}
                <button class="inline" onclick={(ev) => { ev.stopPropagation(); void c.toggleHauling(under); }}>{under.hauled ? 'Work it in place' : 'Haul it'}</button>
              {/if}
            </p>
          {/if}
        </div>
      </div>
    {:else}
      {#if !c.siege}<p class="muted">No units yet. Choose troops, or generate an army.</p>{/if}
    {/each}

    {#each c.myEngines as e (e.id)}
      {@const card = c.engineCard(e.name)}
      {@const art = engineArtUrl(e.name)}
      {@const p = { kind: 'engine' as const, id: e.id }}
      <div
        class="piece engine"
        data-selected={c.isSelected('engine', e.id)}
        aria-pressed={c.isSelected('engine', e.id)}
        class:down={!!e.square}
        class:lift={c.isLifted('engine', e.id)}
        role="button"
        tabindex="0"
        draggable="true"
        ondragstart={(ev) => onTrayDragStart(p, ev)}
        ondragend={c.onTrayDragEnd}
        onclick={() => c.select(p)}
        onkeydown={(ev) => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); c.select(p); } }}
      >
        <div class="head">
          {@render grip(e.name)}
          <div class="title">
            <h4 class="name">{e.name}</h4>
            <p class="meta">emplacement{card ? ` · ${card.kind}` : ''}</p>
          </div>
          <button class="kill" onclick={(ev) => { ev.stopPropagation(); c.drop(p); }} title="Take out of the force" aria-label="Remove {e.name}">×</button>
        </div>

        {#if card}
          <dl class="stats">
            <div class="statcell"><dt>Launch</dt><dd>+{card.launch}</dd></div>
            <div class="statcell"><dt>Def</dt><dd>{card.defence}</dd></div>
            <div class="statcell"><dt>Reach</dt><dd>{card.reach ?? '—'}</dd></div>
          </dl>
        {/if}

        <div class="plate">
          <div class="portrait">
            {#if art}<img src={art} alt="" />{:else}<span class="cog">⚙</span>{/if}
            {#if card}<span class="level">{card.level}</span>{/if}
          </div>
          {#if e.square}
            <button class="deploy set" onclick={(ev) => { ev.stopPropagation(); c.unplace(p); }} title="Take it off the board">{e.square}<span class="undo">↩</span></button>
          {:else}
            <button class="deploy" disabled={!c.canAutoPlace(p)} onclick={(ev) => { ev.stopPropagation(); c.placeAuto(p); }} title="Put it on the board">Place</button>
          {/if}
        </div>

        <div class="details">
          {#if card && card.loadSteps !== 0}
            <label title="Start the battle loaded">
              <input type="checkbox" checked={e.loaded !== false} aria-label="{e.name} loaded"
                onchange={(ev) => void c.setLoaded(e.id, ev.currentTarget.checked)} />
              Loaded
            </label>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <div class="row">
    <button onclick={() => void c.resetToExample()}>Reset to the example</button>
  </div>
{/snippet}

<style>
  /* The longest engine name is wider than the dock, and a select sizes to its longest option. */
  .listhead { margin: .4rem 0 0; font-size: var(--type-body); }
  .card .row select { flex: 1 1 10rem; min-width: 0; }

  /* The card. A piece off the board is a card still in hand: dashed edge, hatched paper. Put
     it down and the card goes solid, with its square stamped under the portrait. */
  .piece {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 4.9rem;
    grid-template-areas: 'head head' 'stats plate' 'details details';
    column-gap: .65rem;
    padding: .5rem .6rem .45rem .75rem;
    background-color: color-mix(in srgb, var(--side) 22%, var(--card));
    background-image: linear-gradient(to right, color-mix(in srgb, var(--side) 16%, transparent), transparent 60%);
    border: 1px solid color-mix(in srgb, var(--side) 55%, var(--rule));
    border-radius: 8px;
    cursor: grab;
    transition: border-color .15s, box-shadow .15s, opacity .15s;
  }
  .piece::before {
    content: '';
    position: absolute;
    inset: -1px auto -1px -1px;
    width: 4px;
    border-radius: 8px 0 0 8px;
    background: var(--side);
  }
  .piece:not(.down) {
    border-style: dashed;
    background-image:
      repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in srgb, var(--side) 12%, transparent) 7px 8px),
      linear-gradient(to right, color-mix(in srgb, var(--side) 16%, transparent), transparent 60%);
  }
  .piece:hover { border-color: var(--hi); }
  .piece.lift { opacity: .4; }
  .piece:active { cursor: grabbing; }

  /* An emplacement's rail is broken: it holds a square rather than marching off one. */
  .piece.engine::before { background: repeating-linear-gradient(to bottom, var(--side) 0 5px, transparent 5px 9px); }

  .head { grid-area: head; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: .4rem; }
  .unitlist { gap: .5rem; --hi: color-mix(in srgb, var(--side) 65%, var(--ink)); }
  .grip {
    display: block;
    width: .6rem; height: 1.05rem; margin-top: .15rem; align-self: start;
    background-image: radial-gradient(currentColor .9px, transparent 1px);
    background-size: .3rem .3rem;
    color: var(--muted);
    cursor: grab;
  }
  .piece:hover .grip { color: var(--hi); }
  .name { margin: 0; font-size: var(--type-1); font-weight: 700; line-height: var(--leading-heading); }
  .meta { margin: .1rem 0 0; font-size: var(--type-small); color: var(--muted); }
  .abilities { display: grid; gap: .15rem; margin-top: .45rem; }
  .caption { margin: 0; font-size: var(--type-small); color: var(--muted); }
  .abilities details { font-size: var(--type-body); line-height: var(--leading-compact); }
  .abilities summary { cursor: pointer; font-weight: 600; color: var(--ink); }
  .abilities .unplayed summary { color: var(--ink-2); }
  .abilities .caption:not(:first-child) { margin-top: .4rem; }
  .abilities details p { margin: .15rem 0 .35rem .9rem; color: var(--ink-2); }

  .stats { grid-area: stats; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .3rem .4rem; margin: .5rem 0 0; }
  .statcell { min-width: 0; border-left: 1px solid color-mix(in srgb, var(--side) 60%, transparent); padding-left: .35rem; }
  .statcell dt { font-size: var(--type-small); color: var(--muted); }
  .statcell dd { margin: 0; font-size: var(--type-1); font-weight: 700; line-height: var(--leading-compact); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .plate { grid-area: plate; display: flex; flex-direction: column; gap: .3rem; margin-top: .5rem; }
  /* The miniature stands on the card itself: the art is cut out, so a plate behind it would
     only put a box round a piece that has none on the board. */
  .portrait { position: relative; aspect-ratio: 1; display: grid; place-items: center; }
  .portrait img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .portrait .cog { font-size: var(--type-5); color: var(--muted); }
  .level {
    position: absolute; top: 0; right: 0; min-width: 1.15rem; padding: .05rem .2rem;
    font-size: var(--type-label); font-weight: 700; text-align: center; font-variant-numeric: tabular-nums;
    color: var(--paper); background: var(--side); border-radius: 4px;
  }
  .deploy { width: 100%; padding: .25rem .1rem; font-size: var(--type-small); border-radius: 5px; font-variant-numeric: tabular-nums; }
  .deploy:not(.set) { color: var(--hi); border-color: var(--hi); font-weight: 600; }
  .deploy:hover:not(:disabled) { border-color: var(--hi); }
  .deploy.set { color: var(--muted); }
  .undo { margin-left: .25rem; opacity: .35; }
  .deploy.set:hover .undo { opacity: 1; }

  .details { grid-area: details; margin-top: .5rem; padding-top: .35rem; border-top: 1px solid color-mix(in srgb, var(--side) 55%, transparent); }
  .details:not(:has(*)) { display: none; }
  .details > :first-child { margin-top: 0; }
  .line { margin: 0; font-size: var(--type-body); line-height: var(--leading-compact); color: var(--ink-2); font-variant-numeric: tabular-nums; }


  .kill { min-width: 1.5rem; min-height: 1.5rem; border: 0; background: none; color: var(--muted); padding: 0; font-size: var(--type-2); line-height: 1; }
  .kill:hover:not(:disabled) { color: var(--bad); opacity: 1; border-color: transparent; }
  .line .inline { font-size: var(--type-small); padding: .05rem .4rem; margin-left: .3rem; }
</style>
