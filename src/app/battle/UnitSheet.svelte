<script lang="ts">
  import type { UnitSheetModel } from './unit-sheet.js';

  let { sheet }: { sheet: UnitSheetModel } = $props();
</script>

<section class="unit-sheet" aria-label={sheet.label}>
  {#if sheet.caster}
    <div class="caster" title={sheet.caster.title}>{sheet.caster.label}</div>
  {/if}
  {#if sheet.fortified}
    <div class="fortified" title="Cover applies to incoming ranged attacks across an intact, closed wall. Gaps, high-angle attacks and attackers inside bypass that wall. Cover uses the highest bonus, including Guard.">
      <strong>{sheet.fortified.label}</strong><span>{sheet.fortified.cover}</span>
    </div>
  {/if}
  {#if sheet.abilities.length}
    <div class="movement-source" aria-label="Troop abilities">{#each sheet.abilities as ability, i (i)}<details><summary>{ability.summary}</summary><p>{ability.description}</p></details>{/each}</div>
  {/if}
  {#if sheet.absorbs}<div class="caster">Damage Absorption: absorbs the next 1 damage</div>{/if}
  {#if sheet.review.length}<details><summary>Source ability notes ({sheet.review.length})</summary>{#each sheet.review as note, i (i)}<p><strong>{note.label}</strong>: {note.reason}</p>{/each}</details>{/if}
  <dl class="vitals">
    {#each sheet.vitals as figure (figure.label)}
      <div title={figure.title}><dt>{figure.label}</dt><dd>{figure.value}{#if figure.unit}<small>{figure.unit}</small>{/if}</dd></div>
    {/each}
  </dl>
  {#if sheet.movement}
    <div class="movement-source">{#each sheet.movement as line, i (i)}<span>{line}</span>{/each}</div>
  {/if}
  <div class="attacks" aria-label="Attack rolls and weapon ranges">
    {#each sheet.attacks as attack, i (i)}
      <div class="attack" title={attack.title}><span>{attack.label}</span><strong>{attack.value}</strong><small>{attack.range}</small></div>
    {/each}
  </div>
  <dl class="checks" aria-label="Saves and basic checks">
    {#each sheet.checks as figure (figure.label)}
      <div title={figure.title}><dt>{figure.label}</dt><dd>{figure.value}</dd></div>
    {/each}
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
