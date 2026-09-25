<script lang="ts">
  import { wallsFor, isRouted, notation, canFocus, type ActivityIndex, type ActivityOption, type Tree, gateReason, fortification, siegeReason, engineKind, engineSpeed, engineLoadSteps, engineLoadProgress, engineLoading, CELL_FEET } from '../../engine/index.js';
  import { offerReason } from './action-menu.js';
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

{#if c.meleeTarget && c.cellOf(c.meleeTarget)}
  <MeleeChoices cell={c.cellOf(c.meleeTarget)!} plans={c.meleeOptions.get(c.meleeTarget) ?? []} selected={c.meleeSelected}
    screenOf={(cell) => stage.board?.screenOf(cell) ?? null} radiusOf={(cell) => stage.board?.cellRadius(cell) ?? null} choose={c.chooseMelee}
    hover={(kind) => { c.meleeHover = kind; }} />
{/if}
<TargetMarkers targets={c.targetMarkers} screenOf={(cell) => stage.board?.screenOf(cell) ?? null}
  opacity={c.targetingService?.placement ? 0.75 : 1}
  cellRadius={(cell) => stage.board?.cellRadius(cell) ?? null} selected={c.targetingChoice?.id ?? null}
  hover={c.hoverTargetMarker} choose={c.chooseTargetMarker} />
<TargetMarkers targets={c.resolvedMarkers} screenOf={(cell) => stage.board?.screenOf(cell) ?? null}
  cellRadius={(cell) => stage.board?.cellRadius(cell) ?? null} selected={null} resolved
  hover={() => {}} choose={() => {}} />
{#if c.gateOpen && c.active}
  <BoardPopup cell={notation(c.active.square)} close={() => { c.gateOpen = false; }} appearance="rally">
    <strong>Gates</strong>
    <p class="muted">Operate from the interior hex while free of enemy contact. Either army can use the mechanism.</p>
    {#each c.nearbyGates as [key, wall] (key)}
      {@const reason = gateReason(c.b, c.active, key)}
      <button class="popup-row" disabled={!c.myTurn || c.gateBusy || !!reason} title={reason ?? 'Operate gate'} onclick={() => c.operateGate(key)}>
        <span class="popup-verb"><GateStatus open={wall.gate!.open} /> {wall.gate?.open ? 'Close' : 'Open'} gate <ActionCost n={1} /></span>
        <span class="muted">{key.replace('|', ' / ')} · {fortification(wall.tier).name} · {wall.remaining}/{wall.boxes} · hardness {fortification(wall.tier).hardness} · interior {wallsFor(c.b.board).insideOf(key)}{reason ? ` · ${reason}` : ''}</span>
      </button>
    {/each}
  </BoardPopup>
{/if}
{#if c.siegeOpen && c.active && c.siegeEngine}
  <BoardPopup cell={notation(c.active.square)} close={c.cancelAction}>
    {@render popupHead(`${c.actionsLeft} ${c.actionsLeft === 1 ? 'action' : 'actions'} left`)}
    <div class="siege-heading">
      <img src={engineArtUrl(c.siegeEngine.name) ?? actionIconUrl('shoot')} alt="" />
      <div><strong>{c.siegeEngine.name}</strong><div class="muted">{c.siegeEngine.hauling ? 'Hauling' : engineSpeed(c.siegeEngine) === 0 ? 'Fixed emplacement' : 'In this hex'}</div></div>
    </div>
    {#if c.siegeEquipment.length > 1}
      <div class="siege-selector" aria-label="Siege engines">
        {#each c.siegeEquipment as engine (engine.id)}
          <button class:on={engine.id === c.siegeEngine.id} onclick={() => { c.siegeSelected = engine.id; }}>{engine.name}</button>
        {/each}
      </div>
    {/if}
    <p class="popup-escapes" aria-live="polite">
      {#if engineKind(c.siegeEngine) === 'ram'}Ram · attacks adjacent walls
      {:else}{engineLoading(c.siegeEngine).label}{/if}
      {#if engineSpeed(c.siegeEngine) !== 0} · {Math.min(c.active.speed, c.active.movementRates?.land ?? c.active.speed, engineSpeed(c.siegeEngine) ?? c.active.speed) / CELL_FEET} hexes per Move while hauling{/if}
    </p>
    {#if engineLoadSteps(c.siegeEngine) > 0}
      {@const reason = siegeReason(c.b, c.active, c.siegeEngine, 'load')}
      {@const remaining = engineLoadSteps(c.siegeEngine) - engineLoadProgress(c.siegeEngine)}
      <button class="popup-row" disabled={c.siegeBusy || !!reason} title={reason ?? 'Reload the engine'} onclick={() => c.operateSiege('load')}>
        <span class="popup-verb">Load <ActionCost n={1} /></span>
        <span class="muted">{reason ?? `${remaining} loading ${remaining === 1 ? 'action' : 'actions'} left`}</span>
      </button>
    {/if}
    {@const attackReason = siegeReason(c.b, c.active, c.siegeEngine, 'attack') ?? (c.siegeOffer ? offerReason(c.siegeOffer) : 'No target in range')}
    <button class="popup-row" disabled={c.siegeBusy || !!attackReason} title={attackReason ?? 'Choose an attack and target'} onclick={() => c.operateSiege('attack')}>
      <span class="popup-verb">Attack</span><span class="muted">{attackReason ?? (engineKind(c.siegeEngine) === 'ram' ? 'Ram an adjacent wall' : 'Choose an attack behavior and target')}</span>
    </button>
    {#if c.siegeEngine.hauling}
      <button class="popup-row" disabled={c.siegeBusy} onclick={() => c.operateSiege('release')}>
        <span class="popup-verb">Release siege engine</span><span class="muted">Free · leave it in this hex · restore {c.active.speed / CELL_FEET} hexes per Move</span>
      </button>
    {:else}
      {@const reason = siegeReason(c.b, c.active, c.siegeEngine, 'haul')}
      <button class="popup-row" disabled={c.siegeBusy || !!reason} title={reason ?? 'Attach the engine, then move your unit'} onclick={() => c.operateSiege('haul')}>
        <span class="popup-verb">Haul siege engine <ActionCost n={1} /></span><span class="muted">{reason ?? 'Attach the engine, then move your unit'}</span>
      </button>
    {/if}
  </BoardPopup>
{/if}
{#if c.activityPick && c.pickerOffer && c.active}
  <BoardPopup cell={notation(c.active.square)} close={c.cancelAction} appearance={c.pickerOffer.type === 'shoot' ? 'shoot' : c.pickerOffer.type === 'cast' ? 'cast' : 'rally'}>
    {@render pickerHead(c.pickerOffer.label, c.pickerOffer.type === 'shoot' ? 'shoot' : c.pickerOffer.type === 'cast' ? 'cast' : 'rally', c.pickerOffer.spell)}
    {@render activityRows(c.pickerOffer.activities, c.pickerActivity?.index ?? null, c.choosePickerActivity)}
    {#if c.pickerActivity}
      {#if canFocus(c.pickerOffer.type, c.pickerOffer.spell) && (c.pickerOffer.type !== 'cast' || (c.pickerActivity.cost ?? 3) < 3)}
        <CommitmentPicker base={c.pickerActivity.cost ?? c.pickerActivity.index} available={c.pickerOffer.type === 'cast' ? Math.min(3, c.actionsLeft) : c.actionsLeft} bind:value={c.focus} effect={c.pickerOffer.spell === 'controlling' ? 'to spell DC' : 'on the roll'} />
      {/if}
      <p class="popup-escapes" aria-live="polite">
        {#if !c.pickerActivity.needsTarget}Ready to confirm.
        {:else if c.pickerService?.placement}{c.activityPick.selected.length % 2 ? 'Choose a destination hex.' : c.activityPick.selected.length === 2 && c.pickerActivity.index === 4 ? 'Confirm one transfer, or choose a second unit and its destination.' : 'Choose a unit to transfer.'}
        {:else if c.pickerOffer.spell === 'healing' && c.pickerActivity.index === 4}Choose yourself or one adjacent ally.
        {:else if c.pickerOffer.spell === 'healing' && c.pickerActivity.index > 1}Choose up to {c.pickerActivity.index === 4 ? 1 : c.pickerActivity.index} units on the board. {c.activityPick.selected.length} selected.
        {:else}Choose a target on the board.{/if}
      </p>
      {#if c.pickerActivity.needsTarget}
      {#key `${c.pickerOffer.spell}:${c.pickerActivity.index}`}
        <TargetChoices targets={c.pickerCandidates} selected={c.activityPick.target ?? null}
          choose={c.choosePickerTarget} hover={c.hoverTargetMarker} cells={c.targetCells} label={`${c.pickerOffer.label} targets`} />
      {/key}
      {/if}
      {#if c.pickerOffer.spell === 'healing' && c.activityPick.target}
        <HealingChoices units={c.b.units.filter(u => c.activityPick?.target?.split('+').includes(u.id))} renewal={c.pickerActivity.index === 4} bind:choices={c.healingChoices} />
      {/if}
      {#if c.activityPick.selected.length}<button onclick={c.resetPickerTargets}>Reset targets</button>{/if}
    {:else}
      <p class="popup-escapes">Choose an activity.</p>
    {/if}
    <div class="popup-foot">
      {#if c.pickerActivity}<span class="muted">Spends {(c.pickerActivity.cost ?? 0) + c.focus} of {c.actionsLeft}</span>{/if}
      <button onclick={c.cancelAction}>Cancel</button>
      <button class="primary" disabled={!c.pickerActivity?.legal || (c.pickerActivity.needsTarget && !c.activityPick.target)} onclick={c.confirmPicker}>Confirm</button>
    </div>
  </BoardPopup>
{/if}
{#if c.blastOpen && c.blastOffer && c.active}
  <BoardPopup cell={notation(c.active.square)} close={c.cancelAction} appearance="cast">
    {@render pickerHead('Blast', 'cast', 'blast')}
    {@render activityRows(c.blastOffer.activities, c.blastLevel, c.chooseBlastLevel)}
    {#if c.blastActivity}
      {#if (c.blastActivity.cost ?? 3) < 3}<CommitmentPicker base={c.blastActivity.cost ?? c.blastActivity.index} available={Math.min(3, c.actionsLeft)} bind:value={c.focus} effect="on the spell attack" />{/if}
      <p class="popup-escapes" aria-live="polite">
        {#if c.blastLevel === 1}Choose an enemy hex.
        {:else if c.blastLevel === 2}Choose a two-hex line on the board.
        {:else if c.blastLevel === 3}Choose a three-hex corner on the board.
        {:else}Choose an area on the board or from the list.{/if}
      </p>
      {#key c.blastLevel}
        <TargetChoices targets={c.blastCandidates} selected={c.blastTarget} choose={c.chooseBlastTarget}
          hover={c.hoverTargetMarker} cells={c.targetCells} label="Blast targets" />
      {/key}
      {#if c.blastCell}<button onclick={c.showAllBlastTargets}>Show all targets</button>{/if}
      <div class="popup-foot">
        <button onclick={c.cancelAction}>Cancel</button>
        <button class="primary" disabled={!c.blastActivity.legal || !c.blastSelection} onclick={c.confirmBlast}>Cast {c.blastActivity.label} · {(c.blastActivity.cost ?? 0) + c.focus} action{(c.blastActivity.cost ?? 0) + c.focus === 1 ? '' : 's'}</button>
      </div>
    {:else}
      <p class="popup-escapes">Choose a spell.</p>
    {/if}
  </BoardPopup>
{/if}
{#if c.radial && c.anchor && c.radialItems.length}
  <RadialMenu x={c.anchor.x} y={c.anchor.y} hole={c.anchorR} items={c.radialItems} pick={c.pickProp} />
{/if}
{#if c.castPick && c.anchor && c.castRadialItems.length}
  <RadialMenu x={c.anchor.x} y={c.anchor.y} hole={c.anchorR} items={c.castRadialItems} pick={c.pickCastTree} back={c.stepBack} />
{/if}
{#if c.drag && !c.blockedNotice}
  <div class="drag-hud">
    <strong>{c.rowLabel(c.drag)}</strong>
    <span class="muted">{c.drag.cell} — {c.rowDetail(c.drag)}</span>
  </div>
{:else if c.dragTarget?.attack && !c.blockedNotice}
  <div class="drag-hud">
    <strong>Attack {c.enemyName(c.dragTarget.id)}</strong>
    <span class="muted">Release to choose a Melee activity · from 1 action</span>
  </div>
{/if}
{#if c.pending}
  <BoardPopup cell={c.pending.cell} close={c.cancelAction}>
    {@render popupHead(c.pending.cell)}
    {#each c.pending.rows as row, i (c.rowKey(row))}
      <button class="popup-row" class:on={i === c.pending.index} onclick={() => c.choose(i)}>
        <span class="popup-verb">
          {#if row.kind === 'charge' || row.kind === 'advance'}<img class="row-prop" src={actionIconUrl(row.kind === 'charge' || row.plan.kind === 'charge' ? 'charge' : 'attack')} alt="" />{/if}
          {c.rowLabel(row)}
          <span class="row-cost"><ActionCost n={i === c.pending.index ? c.dropCost(row) : row.kind === 'step' ? 1 : row.actions} /></span>
        </span>
        <span class="muted">
          {#if i === c.pending.index && row.kind === 'advance'}{c.actionCost(row.plan.moveActions)} to move + {c.actions(c.chargeActivity + (row.plan.kind === 'charge' ? 1 : 0) + c.focus)} to {row.plan.kind === 'charge' ? 'charge' : 'attack'}
          {:else if i === c.pending.index && row.kind === 'charge'}{c.actions(c.dropCost(row))}, melee included
          {:else}{c.rowDetail(row)}{/if}
        </span>
      </button>
      {#if i === c.pending.index && row.kind === 'flee'}
        <p class="muted activity-detail popup-escapes">
          Leave through {row.cell}. Morale: d20 {row.modifier >= 0 ? '+' : '−'}{Math.abs(row.modifier)} against DC {row.dc}.
          The unit escapes either way. Success sends it to camp without morale loss; failure routes it and removes it from the end-of-day survivors.
          {#if c.active && isRouted(c.active)}This unit is already routed and stays routed after leaving.{/if}
        </p>
      {/if}
      {#if i === c.pending.index && row.kind === 'move' && c.act?.escape}
        {@const w = c.act.escape}
        <div class="popup-escapes">
          {#each w.holders as h (h.unit)}
            <p class="escape">
              <span class="escape-name">{h.name}</span>
              <span class="muted">DC {h.dc}{h.pinning ? ' · pinning' : ''}</span>
              {#if h.follows}<span class="tag">gives no retreat — follows you</span>{/if}
            </p>
          {/each}
          <p class="muted activity-detail">
            One roll, d20{w.modifier < 0 ? '−' : '+'}{Math.abs(w.modifier)}, read against each DC. Fall short of any and you stay, spending one action;
            a holder you critically fail against also attacks free. A Step to open ground needs no roll.
          </p>
        </div>
      {/if}
      {#if i === c.pending.index && (row.kind === 'charge' || row.kind === 'advance') && c.active}
        {@const charging = row.kind === 'charge' || row.plan.kind === 'charge'}
        <p class="muted activity-detail popup-escapes">
          {#if row.kind === 'advance'}Move to {row.plan.via}, then {charging ? 'charge' : 'attack'} from there. {row.actions} actions total for the basic attack. {/if}
          {#if charging}
            {(row.kind === 'advance' ? row.plan.bonus > 0 : row.runUp) ? '+2 on the attack for the run-up.' : 'No run-up: the charge ends within 3 hexes of its start, so the attack takes no bonus.'}
          {:else}Attack uses the normal melee rules.{/if}
        </p>
        <div class="activity-chips">
          {#each charging ? c.CHARGE_ACTIVITIES : c.ACTIVITIES as g (g)}
            {@const total = c.chargeCost(row, g)}
            {@const can = total <= c.active.actions}
            <button
              class="activity-chip"
              class:on={c.chargeActivity === g}
              disabled={!can}
              title={can ? '' : `needs ${total} actions`}
              onclick={() => c.chooseDropActivity(g)}
            >
              {charging ? c.CHARGES[g - 1] : ['Strike', 'Press', 'Overrun'][g - 1]}
              <ActionCost n={total} />
            </button>
          {/each}
        </div>
        <CommitmentPicker base={c.chargeCost(row, c.chargeActivity)} available={c.actionsLeft} bind:value={c.focus} effect={charging ? 'on the attack, in addition to any run-up bonus' : 'on the attack'} />
      {/if}
    {/each}
    {@render popupFoot(c.commit, c.picked?.kind === 'flee' ? 'Confirm flee' : c.picked?.kind === 'charge' || (c.picked?.kind === 'advance' && c.picked.plan.kind === 'charge') ? 'Confirm charge' : c.picked?.kind === 'advance' ? 'Confirm attack' : 'Confirm')}
  </BoardPopup>
{/if}
{#if c.aim && c.aimGroup && c.active && !c.pending}
  <BoardPopup cell={c.aim.cell} close={c.cancelAction} appearance={c.aimGroup.offer.type === 'shoot' || c.aimGroup.offer.type === 'cast' || c.aimGroup.offer.type === 'rally' ? c.aimGroup.offer.type : 'default'}>
    {#if c.aimGroup.offer.type === 'shoot' || c.aimGroup.offer.type === 'cast' || c.aimGroup.offer.type === 'rally'}
      {@render pickerHead(c.aim.label, c.aimGroup.offer.type, c.aimGroup.offer.spell, !!c.aimGroup.offer.ability)}
    {:else}{@render popupHead(c.aim.label)}{/if}
    {#if c.aim.groups.length > 1}
    <div class="verb-row">
      {#each c.aim.groups as g, gi (c.offerKey(g.offer))}
        {@const icon = targetingIcon(g.offer)}
        <button class="verb-tile" class:on={gi === c.aim.group} onclick={() => c.aimVerb(gi)}>
          {#if icon}<img src={targetIconUrl(icon)} alt="" />{/if}
          <span>{g.offer.label}</span>
        </button>
        {/each}
    </div>
    {/if}
    {@render activityRows(c.aimActivities, c.aimed?.index ?? null, (index) => c.aimChoose(c.aimActivities.findIndex((opt) => opt.index === index)))}
    {#if c.aimed?.legal}
      {#if canFocus(c.aimGroup.offer.type, c.aimGroup.offer.spell) && c.aimGroup.offer.spell !== 'blast'}
        <CommitmentPicker base={c.aimed.cost ?? c.aimed.index} available={c.aimGroup.offer.type === 'cast' ? Math.min(3, c.actionsLeft) : c.actionsLeft} bind:value={c.focus} effect={c.aimGroup.offer.spell === 'controlling' ? 'to spell DC' : 'on the roll'} />
      {/if}
      {@render popupFoot(c.takeAim, c.aimGroup.offer.type === 'fight' ? 'Confirm attack' : 'Confirm')}
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
  .picker-emblem img { width: 2.8rem; height: 2.8rem; object-fit: contain; filter: drop-shadow(0 2px 3px #0004); }
  .picker-heading-text { display: flex; flex-direction: column; min-width: 0; }
  .picker-heading-text strong { font-size: 1.15rem; line-height: 1.2; }
  .picker-kicker { color: var(--accent); font-size: .72rem; font-weight: 700; margin-bottom: .25rem; }
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
    background: transparent; color: var(--ink); font: inherit; font-size: .78rem; cursor: pointer;
  }
  .activity-chip.on { border-color: var(--accent); background: var(--band); }
  .activity-chip:disabled { opacity: .4; cursor: default; }
  .popup-foot { display: flex; gap: .5rem; align-items: center; padding: .3rem .5rem 0; border-top: 1px solid var(--rule); margin-top: .3rem; }
  .popup-foot .muted { margin-right: auto; }
  .popup-foot button { font-size: .8rem; padding: .15rem .5rem; }
  .activity-detail { margin: .1rem 0; }
  .popup-escapes { padding: .1rem .5rem .2rem 1rem; font-size: .8rem; }
  .escape { display: flex; flex-wrap: wrap; align-items: baseline; gap: .35rem; margin: .15rem 0; font-size: .82rem; }
  .escape-name { font-weight: 600; }
  .tag { padding: .02rem .35rem; border-radius: 999px; border: 1px solid var(--bad); color: var(--bad); font-size: .7rem; }
</style>
