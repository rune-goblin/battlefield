<script lang="ts">
  import { notation, type ActivityIndex, type ActivityOption, type Tree } from '../../engine/index.js';
  import { signed } from '../presentation.js';
  import { engineArtUrl, actionIconUrl, castIconUrl, targetIconUrl } from '../../board/index.js';
  import ActivityChoices from './ActivityChoices.svelte';
  import TargetChoices from './TargetChoices.svelte';
  import ActionCost from '../ActionCost.svelte';
  import ActionBudget from '../ActionBudget.svelte';
  import HealingChoices from '../HealingChoices.svelte';
  import CommitmentPicker from '../CommitmentPicker.svelte';
  import BoardPopup from '../BoardPopup.svelte';
  import GateStatus from '../GateStatus.svelte';
  import { stage } from '../stage-view.svelte.js';
  import RadialMenu from '../RadialMenu.svelte';
  import TargetMarkers from '../TargetMarkers.svelte';
  import { targetingIcon } from '../targeting.js';
  import MeleeChoices from '../MeleeChoices.svelte';
  import type { BattleController } from './battle-controller.svelte.js';

  let { c }: { c: BattleController } = $props();
</script>

{#snippet popupHead(label: string)}
  <div class="popup-head">
    <span>{label}</span>
    <span class="popup-actions" title="Actions left this activation">
      <ActionBudget remaining={c.actionsLeft} bonus={c.active?.haste ? 1 : 0} size="1.25rem" />
    </span>
  </div>
{/snippet}

{#snippet pickerHead(label: string, treatment: 'cast' | 'rally' | 'shoot', tree: Tree | null = null, ability = false)}
  <div class="picker-heading" class:cast-heading={treatment === 'cast'} class:rally-heading={treatment === 'rally'} class:shoot-heading={treatment === 'shoot'}>
    <span class="picker-emblem" aria-hidden="true">
      <img src={tree ? castIconUrl(tree) : actionIconUrl(treatment)} alt="" />
    </span>
    <span class="picker-heading-text"><span class="picker-kicker">{ability ? 'Ability' : treatment === 'cast' ? 'Cast' : treatment === 'rally' ? 'Command' : 'Ranged attack'}</span><strong>{label}</strong></span>
    <span class="picker-budget" title="Actions left this activation"><ActionBudget remaining={c.actionsLeft} bonus={c.active?.haste ? 1 : 0} size="1.25rem" /></span>
  </div>
{/snippet}

{#snippet activityRows(options: ActivityOption[], selected: ActivityIndex | null, chooseActivity: (index: ActivityIndex) => void)}
  <ActivityChoices {options} {selected} choose={chooseActivity} />
{/snippet}

{#snippet popupFoot(confirm: () => void, label = 'Confirm')}
  <div class="popup-foot">
    <span class="muted">
      Spends {c.cost} of {c.actionsLeft}{c.cost >= c.actionsLeft ? ' — ends the turn' : ''}
    </span>
    <button onclick={c.cancelAction}>Cancel</button>
    <button class="primary" onclick={confirm}>{label}</button>
  </div>
{/snippet}

{#if c.drag.meleeTarget && c.cellOf(c.drag.meleeTarget)}
  <MeleeChoices cell={c.cellOf(c.drag.meleeTarget)!} plans={c.drag.meleeOptions.get(c.drag.meleeTarget) ?? []} selected={c.drag.meleeSelected}
    screenOf={(cell) => stage.board?.screenOf(cell) ?? null} radiusOf={(cell) => stage.board?.cellRadius(cell) ?? null} choose={c.drag.chooseMelee}
    hover={(kind) => { c.drag.meleeHover = kind; }} />
{/if}
<TargetMarkers targets={c.picker.targetMarkers} screenOf={(cell) => stage.board?.screenOf(cell) ?? null}
  opacity={c.picker.targetingService?.placement ? 0.75 : 1}
  cellRadius={(cell) => stage.board?.cellRadius(cell) ?? null} selected={c.picker.targetingChoice?.id ?? null}
  hover={c.picker.hoverTargetMarker} choose={c.picker.chooseTargetMarker} />
<TargetMarkers targets={c.picker.resolvedMarkers} screenOf={(cell) => stage.board?.screenOf(cell) ?? null}
  cellRadius={(cell) => stage.board?.cellRadius(cell) ?? null} selected={null} resolved
  hover={() => {}} choose={() => {}} />
{#if c.gateOpen && c.active}
  <BoardPopup cell={notation(c.active.square)} close={() => { c.gateOpen = false; }} appearance="rally">
    <strong>Gates</strong>
    <p class="muted">Operate from the interior hex while free of enemy contact. Either army can use the mechanism.</p>
    {#each c.gates as gate (gate.key)}
      <button class="popup-row" disabled={!c.myTurn || c.gateBusy || !!gate.reason} title={gate.reason ?? 'Operate gate'} onclick={() => c.operateGate(gate.key)}>
        <span class="popup-verb"><GateStatus open={gate.open} /> {gate.open ? 'Close' : 'Open'} gate <ActionCost n={1} /></span>
        <span class="muted">{gate.detail}{gate.reason ? ` · ${gate.reason}` : ''}</span>
      </button>
    {/each}
  </BoardPopup>
{/if}
{#if c.siegeOpen && c.active && c.siegeEngine && c.siegePanel}
  {@const panel = c.siegePanel}
  <BoardPopup cell={notation(c.active.square)} close={c.cancelAction}>
    {@render popupHead(`${c.actionsLeft} ${c.actionsLeft === 1 ? 'action' : 'actions'} left`)}
    <div class="siege-heading">
      <img src={engineArtUrl(c.siegeEngine.name) ?? actionIconUrl('shoot')} alt="" />
      <div><strong>{c.siegeEngine.name}</strong><div class="muted">{c.siegeEngine.hauling ? 'Hauling' : panel.fixed ? 'Fixed emplacement' : 'In this hex'}</div></div>
    </div>
    {#if c.siegeEquipment.length > 1}
      <div class="siege-selector" aria-label="Siege engines">
        {#each c.siegeEquipment as engine (engine.id)}
          <button class:on={engine.id === c.siegeEngine.id} onclick={() => { c.siegeSelected = engine.id; }}>{engine.name}</button>
        {/each}
      </div>
    {/if}
    <p class="popup-escapes" aria-live="polite">
      {#if panel.isRam}Ram · attacks adjacent walls
      {:else}{panel.loadingLabel}{/if}
      {#if !panel.fixed} · {panel.haulHexes} hexes per Move while hauling{/if}
    </p>
    {#if panel.loads}
      <button class="popup-row" disabled={c.siegeBusy || !!panel.loadReason} title={panel.loadReason ?? 'Reload the engine'} onclick={() => c.operateSiege('load')}>
        <span class="popup-verb">Load <ActionCost n={1} /></span>
        <span class="muted">{panel.loadReason ?? `${panel.loadRemaining} loading ${panel.loadRemaining === 1 ? 'action' : 'actions'} left`}</span>
      </button>
    {/if}
    <button class="popup-row" disabled={c.siegeBusy || !!panel.attackReason} title={panel.attackReason ?? 'Choose an attack and target'} onclick={() => c.operateSiege('attack')}>
      <span class="popup-verb">Attack</span><span class="muted">{panel.attackReason ?? (panel.isRam ? 'Ram an adjacent wall' : 'Choose an attack behavior and target')}</span>
    </button>
    {#if c.siegeEngine.hauling}
      <button class="popup-row" disabled={c.siegeBusy} onclick={() => c.operateSiege('release')}>
        <span class="popup-verb">Release siege engine</span><span class="muted">Free · leave it in this hex · restore {panel.releaseHexes} hexes per Move</span>
      </button>
    {:else}
      <button class="popup-row" disabled={c.siegeBusy || !!panel.haulReason} title={panel.haulReason ?? 'Attach the engine, then move your unit'} onclick={() => c.operateSiege('haul')}>
        <span class="popup-verb">Haul siege engine <ActionCost n={1} /></span><span class="muted">{panel.haulReason ?? 'Attach the engine, then move your unit'}</span>
      </button>
    {/if}
  </BoardPopup>
{/if}
{#if c.picker.activityPick && c.picker.pickerOffer && c.active}
  <BoardPopup cell={notation(c.active.square)} close={c.cancelAction} appearance={c.picker.pickerOffer.type === 'shoot' ? 'shoot' : c.picker.pickerOffer.type === 'cast' ? 'cast' : 'rally'}>
    {@render pickerHead(c.picker.pickerOffer.label, c.picker.pickerOffer.type === 'shoot' ? 'shoot' : c.picker.pickerOffer.type === 'cast' ? 'cast' : 'rally', c.picker.pickerOffer.spell)}
    {@render activityRows(c.picker.pickerOffer.activities, c.picker.pickerActivity?.index ?? null, c.picker.choosePickerActivity)}
    {#if c.picker.pickerActivity}
      {#if c.picker.pickerCommitment}
        <CommitmentPicker base={c.picker.pickerCommitment.base} available={c.picker.pickerCommitment.available} bind:value={c.focus} effect={c.picker.pickerOffer.spell === 'controlling' ? 'to spell DC' : 'on the roll'} />
      {/if}
      <p class="popup-escapes" aria-live="polite">{c.picker.pickerHint}</p>
      {#if c.picker.pickerActivity.needsTarget}
      {#key `${c.picker.pickerOffer.spell}:${c.picker.pickerActivity.index}`}
        <TargetChoices targets={c.picker.pickerCandidates} selected={c.picker.activityPick.target ?? null}
          choose={c.picker.choosePickerTarget} hover={c.picker.hoverTargetMarker} cells={c.picker.targetCells} label={`${c.picker.pickerOffer.label} targets`} />
      {/key}
      {/if}
      {#if c.picker.pickerOffer.spell === 'healing' && c.picker.activityPick.target}
        <HealingChoices units={c.picker.healingRecipients} renewal={c.picker.pickerActivity.index === 4} bind:choices={c.picker.healingChoices} />
      {/if}
      {#if c.picker.activityPick.selected.length}<button onclick={c.picker.resetPickerTargets}>Reset targets</button>{/if}
    {:else}
      <p class="popup-escapes">Choose an activity.</p>
    {/if}
    <div class="popup-foot">
      {#if c.picker.pickerActivity}<span class="muted">Spends {(c.picker.pickerActivity.cost ?? 0) + c.focus} of {c.actionsLeft}</span>{/if}
      <button onclick={c.cancelAction}>Cancel</button>
      <button class="primary" disabled={!c.picker.pickerActivity?.legal || (c.picker.pickerActivity.needsTarget && !c.picker.activityPick.target)} onclick={c.picker.confirmPicker}>Confirm</button>
    </div>
  </BoardPopup>
{/if}
{#if c.picker.blastOpen && c.picker.blastOffer && c.active}
  <BoardPopup cell={notation(c.active.square)} close={c.cancelAction} appearance="cast">
    {@render pickerHead('Blast', 'cast', 'blast')}
    {@render activityRows(c.picker.blastOffer.activities, c.picker.blastLevel, c.picker.chooseBlastLevel)}
    {#if c.picker.blastActivity}
      {#if c.picker.blastCommitment}<CommitmentPicker base={c.picker.blastCommitment.base} available={c.picker.blastCommitment.available} bind:value={c.focus} effect="on the spell attack" />{/if}
      <p class="popup-escapes" aria-live="polite">
        {#if c.picker.blastLevel === 1}Choose an enemy hex.
        {:else if c.picker.blastLevel === 2}Choose a two-hex line on the board.
        {:else if c.picker.blastLevel === 3}Choose a three-hex corner on the board.
        {:else}Choose an area on the board or from the list.{/if}
      </p>
      {#key c.picker.blastLevel}
        <TargetChoices targets={c.picker.blastCandidates} selected={c.picker.blastTarget} choose={c.picker.chooseBlastTarget}
          hover={c.picker.hoverTargetMarker} cells={c.picker.targetCells} label="Blast targets" />
      {/key}
      {#if c.picker.blastCell}<button onclick={c.picker.showAllBlastTargets}>Show all targets</button>{/if}
      <div class="popup-foot">
        <button onclick={c.cancelAction}>Cancel</button>
        <button class="primary" disabled={!c.picker.blastActivity.legal || !c.picker.blastSelection} onclick={c.picker.confirmBlast}>Cast {c.picker.blastActivity.label} · {(c.picker.blastActivity.cost ?? 0) + c.focus} action{(c.picker.blastActivity.cost ?? 0) + c.focus === 1 ? '' : 's'}</button>
      </div>
    {:else}
      <p class="popup-escapes">Choose a spell.</p>
    {/if}
  </BoardPopup>
{/if}
{#if c.ring.radial && c.ring.anchor && c.ring.radialItems.length}
  <RadialMenu x={c.ring.anchor.x} y={c.ring.anchor.y} hole={c.ring.anchorR} items={c.ring.radialItems} pick={c.ring.pickProp} />
{/if}
{#if c.ring.castPick && c.ring.anchor && c.ring.castRadialItems.length}
  <RadialMenu x={c.ring.anchor.x} y={c.ring.anchor.y} hole={c.ring.anchorR} items={c.ring.castRadialItems} pick={c.ring.pickCastTree} back={c.stepBack} />
{/if}
{#if c.drag.live && !c.drag.blockedNotice}
  <div class="drag-hud">
    <strong>{c.drag.rowLabel(c.drag.live)}</strong>
    <span class="muted">{c.drag.live.cell} — {c.drag.rowDetail(c.drag.live)}</span>
  </div>
{:else if c.drag.dragTarget?.attack && !c.drag.blockedNotice}
  <div class="drag-hud">
    <strong>Attack {c.drag.enemyName(c.drag.dragTarget.id)}</strong>
    <span class="muted">Release to choose a Melee activity · from 1 action</span>
  </div>
{/if}
{#if c.drag.pending}
  <BoardPopup cell={c.drag.pending.cell} close={c.cancelAction}>
    {@render popupHead(c.drag.pending.cell)}
    {#each c.drag.pending.rows as row, i (c.drag.rowKey(row))}
      <button class="popup-row" class:on={i === c.drag.pending.index} onclick={() => c.drag.choose(i)}>
        <span class="popup-verb">
          {#if row.kind === 'charge' || row.kind === 'advance'}<img class="row-prop" src={actionIconUrl(row.kind === 'charge' || row.plan.kind === 'charge' ? 'charge' : 'attack')} alt="" />{/if}
          {c.drag.rowLabel(row)}
          <span class="row-cost"><ActionCost n={i === c.drag.pending.index ? c.drag.dropCost(row) : row.kind === 'step' ? 1 : row.actions} /></span>
        </span>
        <span class="muted">
          {#if i === c.drag.pending.index && row.kind === 'advance'}{c.drag.actionCost(row.plan.moveActions)} to move + {c.drag.actions(c.drag.finishActions(row))} to {row.plan.kind === 'charge' ? 'charge' : 'attack'}
          {:else if i === c.drag.pending.index && row.kind === 'charge'}{c.drag.actions(c.drag.dropCost(row))}, melee included
          {:else}{c.drag.rowDetail(row)}{/if}
        </span>
      </button>
      {#if i === c.drag.pending.index && row.kind === 'flee'}
        <p class="muted activity-detail popup-escapes">
          Leave through {row.cell}. Morale: d20 {signed(row.modifier)} against DC {row.dc}.
          The unit escapes either way. Success sends it to camp without morale loss; failure routes it and removes it from the end-of-day survivors.
          {#if c.activeRouted}This unit is already routed and stays routed after leaving.{/if}
        </p>
      {/if}
      {#if i === c.drag.pending.index && row.kind === 'move' && c.act?.escape}
        {@const w = c.act.escape}
        <div class="popup-escapes">
          {#each w.holders as h (h.unit)}
            <p class="escape">
              <span class="escape-name">{h.name}</span>
              <span class="muted">DC {h.dc}{h.pinning ? ' · pinning' : ''}</span>
            </p>
          {/each}
          <p class="muted activity-detail">
            One roll, d20{signed(w.modifier)}, read against each DC. Fall short of any and you stay, spending one action;
            a holder you critically fail against also attacks free. A Step to open ground needs no roll.
          </p>
        </div>
      {/if}
      {#if i === c.drag.pending.index && (row.kind === 'charge' || row.kind === 'advance') && c.active}
        {@const charging = row.kind === 'charge' || row.plan.kind === 'charge'}
        <p class="muted activity-detail popup-escapes">
          {#if row.kind === 'advance'}Move to {row.plan.via}, then {charging ? 'charge' : 'attack'} from there. {row.actions} actions total for the basic attack. {/if}
          {#if charging}
            {(row.kind === 'advance' ? row.plan.bonus > 0 : row.runUp) ? '+2 on the attack for the run-up.' : 'No run-up: the charge ends within 3 hexes of its start, so the attack takes no bonus.'}
          {:else}Attack uses the normal melee rules.{/if}
        </p>
        <div class="activity-chips">
          {#each c.drag.finishesFor(row) as finish (finish.activity)}
            <button
              class="activity-chip"
              class:on={c.drag.chargeActivity === finish.activity}
              disabled={!finish.legal}
              title={finish.legal ? '' : `needs ${finish.cost} actions`}
              onclick={() => c.drag.chooseDropActivity(finish.activity)}
            >
              {finish.label}
              <ActionCost n={finish.cost} />
            </button>
          {/each}
        </div>
        <CommitmentPicker base={c.drag.chosenFinish(row)?.cost ?? 0} available={c.actionsLeft} bind:value={c.focus} effect={charging ? 'on the attack, in addition to any run-up bonus' : 'on the attack'} />
      {/if}
    {/each}
    {@render popupFoot(c.drag.commit, c.drag.picked?.kind === 'flee' ? 'Confirm flee' : c.drag.picked?.kind === 'charge' || (c.drag.picked?.kind === 'advance' && c.drag.picked.plan.kind === 'charge') ? 'Confirm charge' : c.drag.picked?.kind === 'advance' ? 'Confirm attack' : 'Confirm')}
  </BoardPopup>
{/if}
{#if c.picker.aim && c.picker.aimGroup && c.active && !c.drag.pending}
  <BoardPopup cell={c.picker.aim.cell} close={c.cancelAction} appearance={c.picker.aimGroup.offer.type === 'shoot' || c.picker.aimGroup.offer.type === 'cast' || c.picker.aimGroup.offer.type === 'rally' ? c.picker.aimGroup.offer.type : 'default'}>
    {#if c.picker.aimGroup.offer.type === 'shoot' || c.picker.aimGroup.offer.type === 'cast' || c.picker.aimGroup.offer.type === 'rally'}
      {@render pickerHead(c.picker.aim.label, c.picker.aimGroup.offer.type, c.picker.aimGroup.offer.spell, !!c.picker.aimGroup.offer.ability)}
    {:else}{@render popupHead(c.picker.aim.label)}{/if}
    {#if c.picker.aim.groups.length > 1}
    <div class="verb-row">
      {#each c.picker.aim.groups as g, gi (c.picker.offerKey(g.offer))}
        {@const icon = targetingIcon(g.offer)}
        <button class="verb-tile" class:on={gi === c.picker.aim.group} onclick={() => c.picker.aimVerb(gi)}>
          {#if icon}<img src={targetIconUrl(icon)} alt="" />{/if}
          <span>{g.offer.label}</span>
        </button>
        {/each}
    </div>
    {/if}
    {@render activityRows(c.picker.aimActivities, c.picker.aimed?.index ?? null, (index) => c.picker.aimChoose(c.picker.aimActivities.findIndex((opt) => opt.index === index)))}
    {#if c.picker.aimed?.legal}
      {#if c.picker.aimCommitment}
        <CommitmentPicker base={c.picker.aimCommitment.base} available={c.picker.aimCommitment.available} bind:value={c.focus} effect={c.picker.aimGroup.offer.spell === 'controlling' ? 'to spell DC' : 'on the roll'} />
      {/if}
      {@render popupFoot(c.picker.takeAim, c.picker.aimGroup.offer.type === 'fight' ? 'Confirm attack' : 'Confirm')}
    {/if}
  </BoardPopup>
{/if}

<style>
  .siege-heading { display: flex; align-items: center; gap: .6rem; padding: .4rem 1.5rem .4rem .3rem; }
  .siege-heading img { width: 64px; height: 64px; object-fit: contain; }
  .siege-selector { display: flex; flex-wrap: wrap; gap: .3rem; }
  .verb-row { display: flex; gap: .3rem; padding: .1rem .3rem .35rem; border-bottom: 1px solid var(--rule); margin-bottom: .3rem; }
  .verb-tile {
    display: flex; flex-direction: column; align-items: center; gap: .1rem;
    flex: 1; padding: .2rem; border: 1px solid transparent; border-radius: 8px;
    background: transparent; color: var(--ink); font: inherit; font-size: var(--type-small); font-weight: 600; cursor: pointer;
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
    padding: .35rem .7rem; border-radius: 8px; font-size: var(--type-body);
    background: var(--card); border: 1px solid var(--rule); box-shadow: var(--shadow-1);
    pointer-events: none;
  }
  .popup-head { display: flex; justify-content: space-between; align-items: center; gap: .5rem; padding: .1rem 1.3rem .3rem .4rem; font-weight: 600; color: var(--muted); }
  .popup-actions { display: flex; align-items: center; color: var(--accent); }
  .popup-row {
    display: flex; flex-direction: column; gap: .1rem; width: 100%;
    padding: .35rem .5rem; border: 1px solid transparent; border-radius: 7px;
    background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer;
  }
  .popup-row:hover:not(:disabled) { background: var(--band); }
  .popup-row.on { border-color: var(--accent); background: var(--band); }
  .popup-verb { display: flex; align-items: center; gap: .45rem; font-weight: 600; }
  /* The price sits first on an activity row, in the accent, so the verb reads as ◆ ◆◆ ◆◆◆ down
     the left edge before any word is read. */
  .row-cost { display: inline-flex; align-items: center; min-width: 2.4rem; color: var(--accent); }
  .picker-heading { display: flex; align-items: center; gap: .65rem; padding: .35rem .7rem .5rem; margin-bottom: .35rem; border-bottom: 1px solid var(--rule); }
  .picker-emblem { position: relative; flex: 0 0 3rem; height: 3rem; display: grid; place-items: center; }
  .picker-emblem img { width: 2.8rem; height: 2.8rem; object-fit: contain; filter: drop-shadow(var(--icon-shadow)); }
  .picker-heading-text { display: flex; flex-direction: column; min-width: 0; }
  .picker-heading-text strong { font-size: var(--type-2); line-height: var(--leading-heading); }
  .picker-kicker { color: var(--accent); font-size: var(--type-small); font-weight: 700; margin-bottom: .25rem; }
  .picker-budget { margin-left: auto; align-self: end; color: var(--accent); flex-shrink: 0; }
  .cast-heading { border-bottom-color: color-mix(in srgb, var(--accent) 40%, transparent); }
  .cast-heading .picker-emblem { border: 1px solid var(--accent); border-radius: 50%; box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 10%, transparent); }
  .cast-heading .picker-emblem::before { content: ''; position: absolute; inset: -5px; border: 1px dashed color-mix(in srgb, var(--accent) 45%, transparent); border-radius: 50%; }
  .rally-heading { background: color-mix(in srgb, var(--accent) 9%, transparent); border-bottom: 3px double color-mix(in srgb, var(--accent) 50%, transparent); }
  .rally-heading .picker-emblem { background: color-mix(in srgb, var(--accent) 15%, transparent); height: 3.5rem; clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 84%, 0 100%); padding-bottom: .5rem; }
  .shoot-heading { padding-block: .3rem .6rem; }
  .shoot-heading .picker-emblem { border: 1px solid var(--accent); background: linear-gradient(90deg, transparent 49%, color-mix(in srgb, var(--accent) 25%, transparent) 49% 51%, transparent 51%), linear-gradient(transparent 49%, color-mix(in srgb, var(--accent) 25%, transparent) 49% 51%, transparent 51%); }
  .activity-chips { display: flex; gap: .3rem; padding: .1rem .5rem .3rem 1rem; }
  .activity-chip {
    display: flex; gap: .3rem; align-items: center;
    padding: .1rem .45rem; border: 1px solid var(--rule); border-radius: 999px;
    background: transparent; color: var(--ink); font: inherit; font-size: var(--type-small); cursor: pointer;
  }
  .activity-chip.on { border-color: var(--accent); background: var(--band); }
  .activity-chip:disabled { opacity: .4; cursor: default; }
  .popup-foot { display: flex; gap: .5rem; align-items: center; padding: .3rem .5rem 0; border-top: 1px solid var(--rule); margin-top: .3rem; }
  .popup-foot .muted { margin-right: auto; }
  .popup-foot button { font-size: var(--type-small); padding: .15rem .5rem; }
  .activity-detail { margin: .1rem 0; }
  .popup-escapes { padding: .1rem .5rem .2rem 1rem; font-size: var(--type-small); }
  .escape { display: flex; flex-wrap: wrap; align-items: baseline; gap: .35rem; margin: .15rem 0; font-size: var(--type-small); }
  .escape-name { font-weight: 600; }
</style>
