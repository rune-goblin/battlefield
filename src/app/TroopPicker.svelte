<script lang="ts">
  import { abilityName, abilitySummary, deriveStats, type Side, type UnitCard } from '../engine/index.js';
  import { troopArtUrl } from '../board/index.js';
  import { allTroops, campaignTroops, type TroopEntry } from './troop-library.svelte.js';

  interface Props {
    side: Side;
    /** How many of each card the force already holds, by card name. */
    held: Record<string, number>;
    add: (card: UnitCard) => void;
    close: () => void;
  }
  let { side, held, add, close }: Props = $props();

  // Read once per opening: a module enabled since the last one is found, and the rows hold
  // still while the player sorts them.
  let listId = $state('all');
  const campaign = campaignTroops();
  let all = $state.raw<TroopEntry[] | null>(null);
  void allTroops().then((entries) => { all = entries; });

  // A published card has a source and no faction; a campaign's army has a faction, and the
  // campaign says which factions exist.
  interface List { id: string; label: string; entries: TroopEntry[]; group: 'source' | 'faction'; groups: string[] }
  const lists = $derived<List[]>([
    { id: 'all', label: 'All armies', entries: all ?? [], group: 'source', groups: [...new Set((all ?? []).map((e) => e.source))].sort() },
    ...(campaign ? [{ id: 'campaign', label: campaign.label, entries: campaign.entries, group: 'faction' as const, groups: campaign.factions }] : []),
  ]);
  const list = $derived(lists.find((l) => l.id === listId) ?? lists[0]);
  const groupWord = $derived(list.group === 'source' ? 'source' : 'faction');
  const groupOf = (entry: TroopEntry): string => (list.group === 'source' ? entry.source : entry.faction ?? '');

  type SortKey = 'name' | 'group' | 'level' | 'role' | 'strike' | 'volley' | 'defence';
  const columns = $derived<{ key: SortKey; label: string; numeric?: boolean }[]>([
    { key: 'name', label: 'Troop' }, { key: 'group', label: groupWord },
    { key: 'level', label: 'Level', numeric: true }, { key: 'role', label: 'Role' },
    { key: 'strike', label: 'Melee', numeric: true }, { key: 'volley', label: 'Shoot', numeric: true },
    { key: 'defence', label: 'Def', numeric: true },
  ]);

  let search = $state('');
  let group = $state('');
  let role = $state('');
  let ranged = $state(false);
  let sortKey = $state<SortKey>('level');
  let ascending = $state(true);

  // A troop listed off a compendium index states a name and a level; its role and stats stay
  // blank until it is added, and sort below every row that states them.
  let loaded = $state.raw<Record<string, UnitCard>>({});
  let failed = $state<Record<string, string>>({});

  const rows = $derived(list.entries.map((entry) => {
    const card = entry.card ?? loaded[entry.id] ?? null;
    const stats = card && deriveStats(card);
    return { entry, card, stats, sort: {
      name: entry.name.toLowerCase(), group: groupOf(entry).toLowerCase(), level: entry.level,
      role: card?.role ?? '~', strike: stats?.strike ?? -Infinity, volley: stats?.volley ?? -Infinity, defence: stats?.defence ?? -Infinity,
    } satisfies Record<SortKey, string | number> };
  }));

  async function addEntry(entry: TroopEntry) {
    try {
      const card = entry.card ?? loaded[entry.id] ?? await entry.load!();
      if (!entry.card) loaded = { ...loaded, [entry.id]: card };
      add(card);
    } catch (error) {
      failed[entry.id] = error instanceof Error ? error.message : String(error);
    }
  }
  $effect(() => { if (group && !list.groups.includes(group)) group = ''; });

  const shown = $derived.by(() => {
    const q = search.trim().toLowerCase();
    const direction = ascending ? 1 : -1;
    return rows
      .filter((r) => (!q || r.sort.name.includes(q) || r.sort.group.includes(q))
        && (!group || groupOf(r.entry) === group)
        && (!role || r.card?.role === role)
        && (!ranged || (r.stats?.volley ?? null) !== null))
      .sort((a, b) => {
        const x = a.sort[sortKey], y = b.sort[sortKey];
        return (x < y ? -1 : x > y ? 1 : a.sort.name.localeCompare(b.sort.name)) * direction;
      });
  });

  function sortBy(key: SortKey) {
    if (sortKey === key) ascending = !ascending;
    else { sortKey = key; ascending = true; }
  }

  const signed = (n: number | null) => n === null ? '—' : `${n < 0 ? '−' : '+'}${Math.abs(n)}`;
  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
</script>

<svelte:window onkeydown={onKey} />

<div class="scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
  <div class="picker" role="dialog" aria-modal="true" aria-label="Choose troops" style:--side={side === 'attacker' ? 'var(--att)' : 'var(--def)'}>
    <header>
      <h2>Choose troops for the {side === 'attacker' ? 'attacking' : 'defending'} army</h2>
      <button class="primary" onclick={close}>Done</button>
    </header>

    {#if lists.length > 1}
      <div class="tabs" role="tablist">
        {#each lists as l (l.id)}
          <button role="tab" aria-selected={listId === l.id} class:on={listId === l.id} onclick={() => (listId = l.id)}>
            {l.label} <span class="count">{l.entries.length}</span>
          </button>
        {/each}
      </div>
    {/if}

    <div class="filters">
      <!-- svelte-ignore a11y_autofocus -->
      <input type="search" placeholder="Search by name or {groupWord}" bind:value={search} autofocus />
      <select bind:value={group} aria-label={groupWord}>
        <option value="">Every {groupWord}</option>
        {#each list.groups as g (g)}<option value={g}>{g}</option>{/each}
      </select>
      <select bind:value={role} aria-label="Role">
        <option value="">Every role</option>
        <option value="infantry">Infantry</option>
        <option value="cavalry">Cavalry</option>
      </select>
      <label><input type="checkbox" bind:checked={ranged} /> Has a volley</label>
      <span class="muted tally">{shown.length} of {rows.length}</span>
    </div>

    <div class="scroll">
      <table>
        <thead>
          <tr>
            {#each columns as c (c.key)}
              <th class:num={c.numeric} aria-sort={sortKey === c.key ? (ascending ? 'ascending' : 'descending') : 'none'}>
                <button onclick={() => sortBy(c.key)}>{c.label}<span class="arrow">{sortKey === c.key ? (ascending ? '▲' : '▼') : ''}</span></button>
              </th>
            {/each}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each shown as r (r.entry.id)}
            {@const card = r.card}
            <tr>
              <td class="troop">
                <img src={r.entry.art ?? troopArtUrl(r.entry.name, card?.role ?? 'infantry')} alt="" loading="lazy" />
                <span>
                  <span class="name">{r.entry.name}</span>
                  {#if card?.abilities?.length}<span class="tags" title={card.abilities.map(abilitySummary).join('\n')}>{[...new Set(card.abilities.map(abilityName))].join(' · ')}</span>{/if}
                  {#if card?.tactics?.length || card?.caster}<span class="tags">{[...(card.tactics ?? []), ...(card.caster ? [`${card.tradition ?? ''} caster`.trim()] : [])].join(' · ')}</span>{/if}
                  {#if r.entry.problem ?? failed[r.entry.id]}<span class="tags bad">Cannot be fielded: {r.entry.problem ?? failed[r.entry.id]}</span>{/if}
                </span>
              </td>
              <td>{groupOf(r.entry)}</td>
              <td class="num">{r.entry.level}</td>
              <td>{card?.role ?? '—'}</td>
              <td class="num">{r.stats ? signed(r.stats.strike) : '—'}</td>
              <td class="num">{r.stats?.volley == null ? '—' : `${signed(r.stats.volley)} ${r.stats.reach}`}</td>
              <td class="num">{r.stats?.defence ?? '—'}</td>
              <td class="act">
                {#if held[r.entry.name]}<span class="held" title="Already in this army">×{held[r.entry.name]}</span>{/if}
                <button disabled={!!(r.entry.problem ?? failed[r.entry.id])} onclick={() => void addEntry(r.entry)}>Add</button>
              </td>
            </tr>
          {:else}
            <tr><td colspan={columns.length + 1} class="empty muted">{listId === 'all' && all === null ? 'Reading the troop lists…' : rows.length ? 'No troop matches these filters.' : 'The campaign holds no army yet.'}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

<style>
  .scrim { position: absolute; inset: 0; display: grid; place-items: center; padding: 2rem; background: rgba(0, 0, 0, .45); }
  .picker {
    width: min(64rem, 100%); max-height: 100%; display: flex; flex-direction: column; min-height: 0;
    background: var(--paper); border: 1px solid var(--rule); border-top: 4px solid var(--side);
    border-radius: 10px; box-shadow: 0 12px 40px rgba(0, 0, 0, .45);
  }
  header { display: flex; align-items: center; gap: 1rem; padding: .8rem 1rem .6rem; }
  header h2 { flex: 1; min-width: 0; margin: 0; border: 0; padding: 0; font-size: var(--type-2); line-height: var(--leading-compact); }
  header button { flex: none; }

  .tabs { display: flex; gap: .2rem; padding: 0 1rem; border-bottom: 1px solid var(--rule); }
  .tabs button {
    display: inline-flex; align-items: baseline; gap: .35rem; height: auto; line-height: var(--leading-compact);
    border: 0; border-bottom: 3px solid transparent; border-radius: 0; background: none; color: var(--muted); padding: .35rem .8rem;
  }
  .tabs button.on { color: var(--ink); border-bottom-color: var(--accent); font-weight: 600; }
  .count { font-size: var(--type-small); color: var(--muted); font-weight: 400; }

  .filters { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem .6rem; padding: .6rem 1rem; font-size: var(--type-body); line-height: var(--leading-compact); }
  .filters input[type='search'], .filters select { width: auto; min-width: 0; height: 2.1rem; line-height: var(--leading-compact); padding: .3rem .5rem; }
  .filters input[type='search'] { flex: 1 1 14rem; }
  .filters select { flex: 0 1 13rem; }
  .filters label { flex: none; display: inline-flex; align-items: center; gap: .4rem; white-space: nowrap; }
  .tally { flex: none; margin-left: auto; font-variant-numeric: tabular-nums; }

  .scroll { flex: 1; min-height: 0; overflow: auto; border-top: 1px solid var(--rule); }
  table { width: 100%; margin: 0; border-collapse: collapse; font-size: var(--type-body); line-height: var(--leading-compact); }
  thead th { position: sticky; top: 0; z-index: 1; background: var(--band); text-align: left; padding: 0; border-bottom: 1px solid var(--rule); }
  th button { display: block; width: 100%; height: auto; line-height: var(--leading-compact); border: 0; border-radius: 0; background: none; padding: .35rem .6rem; text-align: inherit; font-size: var(--type-small); font-weight: 600; color: var(--muted); white-space: nowrap; }
  th[aria-sort='ascending'] button, th[aria-sort='descending'] button { color: var(--ink); }
  .arrow { display: inline-block; width: 1em; font-size: var(--type-small); margin-left: .2rem; }
  td { padding: .3rem .6rem; border-bottom: 1px solid color-mix(in srgb, var(--rule) 50%, transparent); vertical-align: middle; }
  tbody tr:hover { background: color-mix(in srgb, var(--side) 9%, transparent); }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  th.num button { text-align: right; }

  .troop { display: flex; align-items: center; gap: .55rem; }
  .troop img { width: 2.2rem; height: 2.2rem; object-fit: contain; flex: none; }
  .name { display: block; font-weight: 600; line-height: var(--leading-heading); }
  .tags { display: block; font-size: var(--type-small); color: var(--muted); }
  .act { text-align: right; white-space: nowrap; }
  .act button { display: inline-block; height: auto; line-height: var(--leading-compact); padding: .15rem .7rem; font-size: var(--type-body); color: var(--side); border-color: var(--side); font-weight: 600; }
  .tags.bad { color: var(--bad); }
  .held { margin-right: .5rem; font-size: var(--type-small); color: var(--muted); font-variant-numeric: tabular-nums; }
  .empty { text-align: center; padding: 2rem; }
</style>
