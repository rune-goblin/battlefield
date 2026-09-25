<script lang="ts">
  import type { Unit, HealingChoice, HealingCondition } from '../engine/index.js';
  let { units, renewal, choices = $bindable({}) }: { units: Unit[]; renewal: boolean; choices?: Record<string, HealingChoice> } = $props();
  const labels: Record<HealingCondition, string> = { pinned: 'Pinned', rooted: 'Rooted', suppressed: 'Suppressed', exposed: 'Exposed', frightened: 'Frightened', persistent: 'Persistent damage' };
  const conditions = (unit: Unit): HealingCondition[] => (Object.keys(labels) as HealingCondition[]).filter(condition => ({ pinned: !!unit.pinnedBy, rooted: unit.rooted > 0, suppressed: !!unit.suppressedBy, exposed: unit.exposed, frightened: unit.frightened, persistent: !!unit.persistent })[condition]);
  function choose(unit: Unit, slot: number, value: string) {
    const current = choices[unit.id] ?? { conditions: conditions(unit).slice(0, renewal ? 2 : 1) };
    const selected = [...current.conditions];
    if (value === 'health' || value === '') selected.splice(slot);
    else { selected[slot] = value as HealingCondition; if (selected[1] === selected[0]) selected.splice(1); }
    choices = { ...choices, [unit.id]: { conditions: selected, extraHealth: value === 'health' } };
  }
</script>
<fieldset>
  <legend>Recovery priorities</legend>
  <p>{renewal ? 'A success clears your first choice; a critical success also clears your second.' : 'On a critical success, clear a condition or restore 1 extra Health.'}</p>
  {#each units as unit (unit.id)}
    {@const eligible = conditions(unit)}
    {@const selected = choices[unit.id]}
    <label>{unit.name}
      <select aria-label={`${unit.name} first recovery`} value={selected ? selected.extraHealth ? 'health' : selected.conditions[0] ?? '' : eligible[0] ?? (renewal ? '' : 'health')} onchange={event => choose(unit, 0, event.currentTarget.value)}>
        {#each eligible as condition}<option value={condition}>{labels[condition]}</option>{/each}
        {#if !renewal}<option value="health">Restore 1 extra Health</option>{:else}<option value="">Clear no condition</option>{/if}
      </select>
    </label>
    {#if renewal && eligible.length > 1 && (selected ? selected.conditions.length > 0 : true)}
      <label>Second condition
        <select aria-label={`${unit.name} second recovery`} value={selected ? selected.conditions[1] ?? '' : eligible[1]} onchange={event => choose(unit, 1, event.currentTarget.value)}>
          {#each eligible.filter(c => c !== (selected?.conditions[0] ?? eligible[0])) as condition}<option value={condition}>{labels[condition]}</option>{/each}
          <option value="">Clear no second condition</option>
        </select>
      </label>
    {/if}
  {/each}
</fieldset>
<style>
fieldset { margin:.6rem .3rem; padding:.5rem; border:1px solid var(--rule); border-radius:8px; }
legend { font-weight:600; } p { font-size: var(--type-small); color:var(--muted); } label { display:flex; gap:.5rem; justify-content:space-between; margin:.4rem 0; }
select { max-width:65%; background:var(--card); color:var(--ink); font:inherit; }
</style>
