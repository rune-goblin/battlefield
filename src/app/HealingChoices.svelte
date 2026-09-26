<script lang="ts">
  import type { Unit, HealingChoice } from '../engine/index.js';
  import { chooseHealing, healingNote, healingRows } from './healing-choices.js';
  let { units, renewal, choices = $bindable({}) }: { units: Unit[]; renewal: boolean; choices?: Record<string, HealingChoice> } = $props();
  const rows = $derived(healingRows(units, renewal, choices));
  function choose(id: string, slot: number, value: string) {
    const unit = units.find((u) => u.id === id);
    if (unit) choices = chooseHealing(choices, unit, renewal, slot, value);
  }
</script>
<fieldset>
  <legend>Recovery priorities</legend>
  <p>{healingNote(renewal)}</p>
  {#each rows as row (row.id)}
    <label>{row.name}
      <select aria-label={`${row.name} first recovery`} value={row.first.value} onchange={event => choose(row.id, 0, event.currentTarget.value)}>
        {#each row.first.options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
      </select>
    </label>
    {#if row.second}
      <label>Second condition
        <select aria-label={`${row.name} second recovery`} value={row.second.value} onchange={event => choose(row.id, 1, event.currentTarget.value)}>
          {#each row.second.options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
        </select>
      </label>
    {/if}
  {/each}
</fieldset>
<style>
fieldset { margin:.6rem .3rem; padding:.5rem; border:1px solid var(--rule); border-radius:8px; }
legend { font-weight:600; } p { font-size: var(--type-body); color:var(--muted); } label { display:flex; gap:.5rem; justify-content:space-between; margin:.4rem 0; }
select { max-width:65%; background:var(--card); color:var(--ink); font:inherit; }
</style>
