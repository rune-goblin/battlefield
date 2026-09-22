<script lang="ts">
  import { wallsFor, castCeiling, defenceOf, escapeModifier, fortitudeModifier, garrisoned, MAX_WOUNDS, movementSpeed, rollBonus, ROUTED_AT, TREE_LABEL,
    shootCeiling, shootFloor, shootRangeLabel, spellAttackModifier, spellDcFor, strikeModifier, willModifier,
    type BattleState, type Unit } from '../../engine/index.js';

  let { battle, unit }: { battle: BattleState; unit: Unit } = $props();
  const fort = $derived(unit.status === 'active' ? wallsFor(battle.board).fortifiedAt(unit.square) : null);
  const signed = (value: number) => `${value < 0 ? '−' : '+'}${Math.abs(value)}`;
  const rollNote = 'Roll 1d20 plus this bonus. Target, height, range and action modifiers apply when choosing an attack.';
  const volley = $derived((unit.stats.volley ?? 0) - unit.disorder + rollBonus(unit) + (garrisoned(battle, unit) ? 1 : 0));
  const spellRanges = $derived(unit.trees.map(tree => `${TREE_LABEL[tree]}: ${castCeiling(battle, tree)} hexes`).join(' · '));
</script>

<section class="unit-sheet" aria-label={`${unit.name} stats`}>
  {#if fort}
    <div class="fortified" title="Cover applies to incoming ranged attacks across an intact, closed wall. Gaps, high-angle attacks and attackers inside bypass that wall. Cover uses the highest bonus, including Guard.">
      <strong>{fort.label}</strong><span>+{fort.cover}{fort.maxCover !== fort.cover ? `–${fort.maxCover}` : ''} ranged cover</span>
    </div>
  {/if}
  <dl class="vitals">
    <div title="Distance gained per Move action"><dt>Move</dt><dd>{movementSpeed(unit)} <small>ft</small></dd></div>
    <div title="Current armor class, including conditions and terrain. Cover against a ranged attacker can add protection."><dt>AC</dt><dd>{defenceOf(battle, unit, null, false)}</dd></div>
    <div title="Health remaining"><dt>Health</dt><dd>{MAX_WOUNDS - unit.wounds}<small>/{MAX_WOUNDS}</small></dd></div>
    <div title="Morale remaining. Lost morale reduces rolls and armor class."><dt>Morale</dt><dd>{Math.max(0, ROUTED_AT - unit.disorder)}<small>/{ROUTED_AT}</small></dd></div>
  </dl>
  <div class="attacks" aria-label="Attack rolls and weapon ranges">
    {#if unit.stats.strike !== null}
      <div class="attack" title={rollNote}><span>Strike</span><strong>{signed(strikeModifier(battle, unit, unit))}</strong><small>Adjacent</small></div>
    {/if}
    {#if unit.stats.volley !== null}
      <div class="attack" title={`${rollNote} ${shootRangeLabel(battle, unit)}`}><span>Volley</span><strong>{signed(volley)}</strong><small>{shootFloor(battle, unit)}–{shootCeiling(battle, unit)} hexes</small></div>
    {/if}
    {#if unit.stats.spellAttack !== null}
      <div class="attack" title={`${rollNote} ${spellRanges}`}><span>Spell attack</span><strong>{signed(spellAttackModifier(unit))}</strong><small>{unit.trees.includes('blast') ? `Blast ${castCeiling(battle, 'blast')} hexes` : 'By spell'}</small></div>
    {/if}
  </div>
  <dl class="checks" aria-label="Saves and basic checks">
    <div title="Fortitude save"><dt>Fort</dt><dd>{signed(fortitudeModifier(unit))}</dd></div>
    <div title="Reflex save and Maneuver checks"><dt>Reflex</dt><dd>{signed(escapeModifier(unit))}</dd></div>
    <div title="Will save and Rally checks"><dt>Will</dt><dd>{signed(willModifier(unit))}</dd></div>
    <div title="Base Perception"><dt>Perception</dt><dd>{signed(unit.stats.perception)}</dd></div>
    {#if unit.stats.spellDc !== null}<div title="DC for enemies resisting this unit's spells"><dt>Spell DC</dt><dd>{spellDcFor(unit)}</dd></div>{/if}
  </dl>
</section>

<style>
  .unit-sheet { display: flex; flex-direction: column; gap: .6rem; margin: .35rem 0 .25rem; }
  .fortified { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .25rem; color: var(--good); font-size: .8rem; padding: .4rem; border: 1px solid var(--rule); border-radius: 5px; }
  dl { margin: 0; }
  dt { color: var(--muted); font-size: .76rem; }
  dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: 650; }
  .vitals { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .35rem; }
  .vitals > div { padding: .35rem .4rem; background: var(--band); border-radius: 5px; }
  .vitals dd { font-size: 1.3rem; line-height: 1.3; }
  small { color: var(--muted); font-size: .76rem; font-weight: 400; }
  .attacks { display: flex; flex-direction: column; gap: .25rem; }
  .attack { display: grid; grid-template-columns: minmax(0, 1fr) 3rem 6.5rem; gap: .4rem; align-items: baseline; font-size: .9rem; }
  .attack strong { font-variant-numeric: tabular-nums; text-align: right; }
  .attack small { text-align: right; }
  .checks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .25rem .8rem; padding-top: .5rem; border-top: 1px solid var(--rule); }
  .checks > div { display: flex; justify-content: space-between; gap: .35rem; align-items: baseline; }
  .checks dd { font-size: .85rem; }
</style>
