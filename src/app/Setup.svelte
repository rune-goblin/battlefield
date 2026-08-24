<script lang="ts">
  import { deriveStats, deployZone, ROLES, ROLE_BLURBS, ROSTER, TACTICS, type Role, type Side, type Tactic, type UnitCard } from '../engine/index.js';
  import { game, resetSetup, saveSetup, startBattle, type SetupUnit } from './game.svelte.js';

  let side: Side = $state('attacker');
  let rosterName = $state(ROSTER[0].name);
  let custom = $state<{ name: string; level: number; role: Role; tactics: Tactic[] }>({ name: 'New Unit', level: 5, role: 'infantry', tactics: [] });

  const zone = (s: Side, card: UnitCard) => deployZone(s, game.setup.terrain, (card.tactics ?? []).includes('ambush'));

  function add(card: UnitCard) {
    const z = zone(side, card);
    game.setup.units.push({ card: structuredClone($state.snapshot(card)), side, step: z[z.length - 1] });
    saveSetup();
  }
  function remove(i: number) { game.setup.units.splice(i, 1); saveSetup(); }
  function fixSteps() {
    for (const u of game.setup.units) {
      const z = zone(u.side, u.card);
      if (!z.includes(u.step)) u.step = z[z.length - 1];
    }
    saveSetup();
  }
  const bySide = (s: Side) => game.setup.units.map((u, i) => ({ u, i })).filter(({ u }) => u.side === s);
  const ready = $derived(bySide('attacker').length > 0 && bySide('defender').length > 0);
  const preview = $derived(deriveStats(custom));
</script>

<div class="grid2">
  <section>
    <h2>The ground</h2>
    <div class="card">
      <div class="row">
        <label><input type="checkbox" bind:checked={game.setup.terrain.cover} onchange={fixSteps}> Cover (forest, hills, town)</label>
        <label><input type="checkbox" bind:checked={game.setup.terrain.rough} onchange={fixSteps}> Rough (swamp, forest)</label>
        <label><input type="checkbox" bind:checked={game.setup.terrain.river} onchange={fixSteps}> River on the attacker's approach</label>
      </div>
      <div class="row" style="margin-top:.5rem">
        <label>Walls
          <select bind:value={game.setup.wallsTier} onchange={saveSetup}>
            <option value={0}>none</option><option value={1}>tier 1 · earthworks</option><option value={2}>tier 2 · wooden</option><option value={3}>tier 3 · stone</option><option value={4}>tier 4 · fortress</option>
          </select>
        </label>
      </div>
    </div>

    <h2>Add units</h2>
    <div class="card">
      <div class="row">
        <label>Side <select bind:value={side}><option value="attacker">Attacker</option><option value="defender">Defender</option></select></label>
      </div>
      <h3>From the roster</h3>
      <div class="row">
        <select bind:value={rosterName}>
          {#each ROSTER as c}<option value={c.name}>{c.name} · L{c.level} {c.role}</option>{/each}
        </select>
        <button onclick={() => add(ROSTER.find((c) => c.name === rosterName)!)}>Add</button>
      </div>
      <h3>Your own</h3>
      <div class="row">
        <input bind:value={custom.name} placeholder="Name" style="width:11rem">
        <label>Level <input type="number" min="1" max="20" bind:value={custom.level} style="width:4.5rem"></label>
        <select bind:value={custom.role}>{#each ROLES as r}<option value={r}>{r}</option>{/each}</select>
      </div>
      <p class="muted">{ROLE_BLURBS[custom.role]}</p>
      <div class="row">
        {#each TACTICS as t}
          <label class="muted"><input type="checkbox" checked={custom.tactics.includes(t)} onchange={(e) => { custom.tactics = (e.currentTarget as HTMLInputElement).checked ? [...custom.tactics, t] : custom.tactics.filter((x) => x !== t); }}>{t}</label>
        {/each}
      </div>
      <table class="stats"><tbody>
        <tr><td>Strike</td><td class="stat">{preview.strike === null ? '—' : `+${preview.strike}`}</td><td>Volley</td><td class="stat">{preview.volley === null ? '—' : `+${preview.volley} (${preview.reach})`}</td></tr>
        <tr><td>Defence</td><td class="stat">{preview.defence}</td><td>Will</td><td class="stat">+{preview.will}</td></tr>
      </tbody></table>
      <button onclick={() => add({ ...custom, tactics: [...custom.tactics] })}>Add {custom.name}</button>
    </div>
  </section>

  <section>
    <h2>The armies</h2>
    {#each ['attacker', 'defender'] as const as s}
      <h3 class={s === 'attacker' ? 'side-att' : 'side-def'}>{s === 'attacker' ? 'Attacker' : 'Defender'}</h3>
      <div class="unitlist">
        {#each bySide(s) as { u, i } (i)}
          {@const st = deriveStats(u.card)}
          <div class="unitrow">
            <div><strong>{u.card.name}</strong> <span class="muted">L{u.card.level} {u.card.role}{u.card.tactics?.length ? ' · ' + u.card.tactics.join(', ') : ''}</span><br>
              <span class="muted stat">Strike {st.strike === null ? '—' : '+' + st.strike} · Volley {st.volley === null ? '—' : '+' + st.volley + ' ' + st.reach} · Def {st.defence} · Will +{st.will}</span></div>
            <label class="muted">step <select bind:value={u.step} onchange={saveSetup}>{#each zone(u.side, u.card) as z}<option value={z}>{z}</option>{/each}</select></label>
            <button onclick={() => remove(i)} title="Remove">×</button>
          </div>
        {:else}
          <p class="muted">No units yet.</p>
        {/each}
      </div>
    {/each}
    <div class="row" style="margin-top:1rem">
      <button class="primary" disabled={!ready} onclick={startBattle}>Begin the battle</button>
      <button onclick={resetSetup}>Reset to the example</button>
    </div>
    <p class="muted">Attackers set up on steps 0–1, defenders on 5–6. Ambush units may start one step further in. Initiative is rolled once at the start.</p>
  </section>
</div>
