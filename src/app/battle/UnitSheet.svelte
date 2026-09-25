<script lang="ts">
  import { abilityDescription, abilitySummary, wallsFor, castCeiling, defenceOf, escapeModifier, fortitudeModifier, garrisoned, MAX_WOUNDS, movementSpeed, rollBonus, ROUTED_AT, TREE_LABEL, CELL_FEET, sourceSpeedLabel, movementRateLabel,
    shootCeiling, shootFloor, shootRangeLabel, spellAttackModifier, spellDcFor, strikeModifier, willModifier,
    type BattleState, type Unit } from '../../engine/index.js';

  let { battle, unit }: { battle: BattleState; unit: Unit } = $props();
  const fort = $derived(unit.status === 'active' ? wallsFor(battle.board).fortifiedAt(unit.square) : null);
  const signed = (value: number) => `${value < 0 ? '−' : '+'}${Math.abs(value)}`;
  const rollNote = 'Roll 1d20 plus this bonus. Target, height, range and action modifiers apply when choosing an attack.';
  const volley = $derived((unit.stats.volley ?? 0) - unit.disorder + rollBonus(unit) + (garrisoned(battle, unit) ? 1 : 0));
  const spellRanges = $derived(unit.trees.map(tree => `${TREE_LABEL[tree]}: ${castCeiling(battle, tree)} hexes`).join(' · '));
  const sourceName = (name?: string) => name?.replace(/\s*\[(Battle|Salvo)\]/g, '');
</script>

<section class="unit-sheet" aria-label={`${unit.name} stats`}>
  {#if unit.tradition}
    <div class="caster" title={spellRanges}>{unit.tradition[0].toUpperCase() + unit.tradition.slice(1)} caster</div>
  {/if}
  {#if fort}
    <div class="fortified" title="Cover applies to incoming ranged attacks across an intact, closed wall. Gaps, high-angle attacks and attackers inside bypass that wall. Cover uses the highest bonus, including Guard.">
      <strong>{fort.label}</strong><span>+{fort.cover}{fort.maxCover !== fort.cover ? `–${fort.maxCover}` : ''} ranged cover</span>
    </div>
  {/if}
  {#if unit.abilities?.length}
    <div class="movement-source" aria-label="Troop abilities">{#each unit.abilities as ability}<details><summary>{abilitySummary(ability)}</summary><p>{abilityDescription(ability)}</p></details>{/each}</div>
  {/if}
  {#if unit.abilityState?.buffer}<div class="caster">Damage Absorption: absorbs the next 1 damage</div>{/if}
  {#if unit.abilityReview?.length}<details><summary>Source ability notes ({unit.abilityReview.length})</summary>{#each unit.abilityReview as note}<p><strong>{note.label}</strong>: {note.reason}</p>{/each}</details>{/if}
  <dl class="vitals">
    <div title="Maximum distance per Move; each step uses the fastest legal movement mode."><dt>Move</dt><dd>{movementSpeed(unit) / CELL_FEET} <small>hexes</small></dd></div>
    <div title="Current armor class, including conditions and terrain. Cover against a ranged attacker can add protection."><dt>AC</dt><dd>{defenceOf(battle, unit, null, false)}</dd></div>
    <div title="Health remaining"><dt>Health</dt><dd>{MAX_WOUNDS - unit.wounds}<small>/{MAX_WOUNDS}</small></dd></div>
    <div title="Morale remaining. Lost morale reduces rolls and armor class."><dt>Morale</dt><dd>{Math.max(0, ROUTED_AT - unit.disorder)}<small>/{ROUTED_AT}</small></dd></div>
  </dl>
  {#if unit.sourceSpeed}
    <div class="movement-source"><span>Army Speed: {sourceSpeedLabel(unit.sourceSpeed)}</span>
      {#if unit.movementRates}<span>{movementRateLabel(unit.movementRates)}</span>{/if}
    </div>
  {/if}
  <div class="attacks" aria-label="Attack rolls and weapon ranges">
    {#if unit.stats.strike !== null}
      <div class="attack" title={rollNote}><span>{sourceName(unit.attackSources?.strike) ?? 'Melee'}</span><strong>{signed(strikeModifier(battle, unit, unit))}</strong><small>Adjacent</small></div>
    {/if}
    {#if unit.stats.volley !== null}
      <div class="attack" title={`${rollNote} ${shootRangeLabel(battle, unit)}`}><span>{sourceName(unit.attackSources?.volley) ?? 'Shoot'}</span><strong>{signed(volley)}</strong><small>{shootFloor(battle, unit)}–{shootCeiling(battle, unit)} hexes</small></div>
    {/if}
    {#if unit.stats.spellAttack !== null}
      <div class="attack" title={`${rollNote} ${spellRanges}`}><span>Spell attack</span><strong>{signed(spellAttackModifier(unit))}</strong><small>{unit.trees.includes('blast') ? `Blast ${castCeiling(battle, 'blast')} hexes` : 'By spell'}</small></div>
    {/if}
  </div>
  <dl class="checks" aria-label="Saves and basic checks">
    <div title="Fortitude save"><dt>Fort</dt><dd>{signed(fortitudeModifier(unit))}</dd></div>
    <div title="Reflex save, and the roll to leave a zone of control"><dt>Reflex</dt><dd>{signed(escapeModifier(unit))}</dd></div>
    <div title="Will save and Rally checks"><dt>Will</dt><dd>{signed(willModifier(unit))}</dd></div>
    <div title="Base Perception"><dt>Perception</dt><dd>{signed(unit.stats.perception)}</dd></div>
    {#if unit.stats.spellDc !== null}<div title="DC for enemies resisting this unit's spells"><dt>Spell DC</dt><dd>{spellDcFor(unit)}</dd></div>{/if}
  </dl>
</section>

<style>
  .unit-sheet { display: flex; flex-direction: column; gap: .6rem; margin: .35rem 0 .25rem; }
  .movement-source { display: flex; flex-direction: column; gap: .15rem; font-size: var(--type-small); color: var(--muted); }
  .caster { color: var(--accent); font-size: var(--type-body); font-weight: 600; }
  .fortified { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .25rem; color: var(--good); font-size: var(--type-small); padding: .4rem; border: 1px solid var(--rule); border-radius: 5px; }
  dl { margin: 0; }
  dt { color: var(--muted); font-size: var(--type-small); }
  dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: 600; }
  .vitals { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .35rem; }
  .vitals > div { padding: .35rem .4rem; background: var(--band); border-radius: 5px; }
  .vitals dd { font-size: var(--type-3); line-height: var(--leading-compact); }
  small { color: var(--muted); font-size: var(--type-small); font-weight: 400; }
  .attacks { display: flex; flex-direction: column; gap: .25rem; }
  .attack { display: grid; grid-template-columns: minmax(0, 1fr) 3rem 6.5rem; gap: .4rem; align-items: baseline; font-size: var(--type-body); }
  .attack strong { font-variant-numeric: tabular-nums; text-align: right; }
  .attack small { text-align: right; }
  .checks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .25rem .8rem; padding-top: .5rem; border-top: 1px solid var(--rule); }
  .checks > div { display: flex; justify-content: space-between; gap: .35rem; align-items: baseline; }
  .checks dd { font-size: var(--type-body); }
</style>
