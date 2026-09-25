<script lang="ts">
  import { exportSave, importSave, listSaves, removeSave, saveBattle, type ArchiveEntry } from './game.svelte.js';
  import { loadSave } from './navigation.svelte.js';
  import { useNotifications } from './notification-context.js';
  import { commandReporter } from './command-notices.js';
  import { viewer } from './viewer.svelte.js';

  const run = commandReporter(useNotifications());

  let open = $state(false);
  let saves = $state<ArchiveEntry[]>([]);
  let name = $state('');
  let error = $state<string | null>(null);

  async function refresh() {
    saves = await listSaves();
  }

  async function toggle() {
    open = !open;
    if (open) await refresh();
  }

  async function guard(work: () => Promise<unknown>) {
    try {
      await work();
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function doSave() {
    const label = name.trim() || new Date().toLocaleString();
    await guard(async () => { await saveBattle(label); name = ''; await refresh(); });
  }

  // Loading is the one operation here that is a command: it replaces the shared record, so a
  // refusal goes through the app's own command notice rather than this panel's error line.
  async function doLoad(slot: string) {
    await run(loadSave(slot));
    await refresh();
  }

  async function doRemove(slot: string) {
    await guard(async () => { await removeSave(slot); await refresh(); });
  }

  async function doExport(slot: string, label: string) {
    await guard(async () => {
      const data = await exportSave(slot);
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${label.replace(/[^\w-]+/g, '_') || 'battle'}.battlefield.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function pickImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void guard(async () => { await importSave(await file.text()); await refresh(); });
    };
    input.click();
  }

  const when = (savedAt: number) => new Date(savedAt).toLocaleString();
  const progress = (entry: ArchiveEntry) => entry.day === null ? 'Setup' : `Day ${entry.day}${entry.round === null ? '' : ` · round ${entry.round}`}`;
</script>

<div class="saveload">
  <button onclick={() => void toggle()} aria-expanded={open}>Save / Load</button>
  {#if open}
    <div class="panel">
      <div class="row">
        <input placeholder="Name this save" bind:value={name} onkeydown={(e) => e.key === 'Enter' && void doSave()} />
        <button class="primary" onclick={() => void doSave()}>Save</button>
      </div>
      {#if error}<p class="error">{error}</p>{/if}
      <ul>
        {#each saves as entry (entry.slot)}
          <li>
            <div class="meta">
              <span class="name">{entry.name}</span>
              <span class="muted">{progress(entry)} · {when(entry.savedAt)}</span>
            </div>
            <div class="actions">
              <button disabled={!viewer.isGm} onclick={() => void doLoad(entry.slot)}>Load</button>
              <button onclick={() => void doExport(entry.slot, entry.name)}>Export</button>
              <button onclick={() => void doRemove(entry.slot)}>Remove</button>
            </div>
          </li>
        {:else}
          <li class="muted">No saved battles yet.</li>
        {/each}
      </ul>
      <button onclick={pickImport}>Import…</button>
    </div>
  {/if}
</div>

<style>
  .saveload { position: relative; }
  .panel {
    position: absolute; right: 0; top: calc(100% + .3rem); z-index: 10; width: 20rem;
    display: flex; flex-direction: column; gap: .5rem; padding: .6rem;
    background: var(--card); border: 1px solid var(--rule); border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, .25); font-size: var(--type-small);
  }
  .row { display: flex; gap: .4rem; }
  .row input { flex: 1; min-width: 0; }
  .error { color: var(--danger, #c0392b); margin: 0; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .35rem; max-height: 14rem; overflow-y: auto; }
  li { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
  .meta { display: flex; flex-direction: column; min-width: 0; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .muted { color: var(--muted); font-size: var(--type-label); }
  .actions { display: flex; gap: .25rem; flex: none; }
  .actions button { padding: .1rem .4rem; font-size: var(--type-label); }
</style>
