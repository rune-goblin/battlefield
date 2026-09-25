<script lang="ts">
  import { battleUnsaved, saveBattle } from './game.svelte.js';
  import { leaveBattle } from './navigation.svelte.js';
  import { useNotifications } from './notification-context.js';
  import { commandReporter } from './command-notices.js';

  let { close }: { close: () => void } = $props();

  const notifications = useNotifications();
  const run = commandReporter(notifications);
  const unsaved = battleUnsaved();
  let name = $state('');
  let busy = $state(false);

  async function end(save: boolean) {
    busy = true;
    try {
      if (save) await saveBattle(name.trim() || new Date().toLocaleString());
      await run(leaveBattle());
      close();
    } catch (error) {
      notifications.show({ id: 'end-battle', title: 'The battle was not saved', message: error instanceof Error ? error.message : String(error), tone: 'error' });
    } finally {
      busy = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') close(); }} />

<div class="scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="end-battle-title">
    <h2 id="end-battle-title">End the battle</h2>
    {#if unsaved}
      <p>This battle has moves that are not saved. Ending it closes the battle for every player.</p>
      <input placeholder="Name this save" bind:value={name} disabled={busy} />
    {:else}
      <p>Ending the battle closes it for every player.</p>
    {/if}
    <div class="buttons">
      <button onclick={close} disabled={busy}>Cancel</button>
      {#if unsaved}
        <button onclick={() => void end(false)} disabled={busy}>End without saving</button>
        <button class="primary" onclick={() => void end(true)} disabled={busy}>Save and end</button>
      {:else}
        <button class="primary" onclick={() => void end(false)} disabled={busy}>End battle</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 1rem;
    background: rgba(0, 0, 0, .55); pointer-events: auto;
  }
  .dialog {
    width: min(28rem, 100%); display: flex; flex-direction: column; gap: .8rem; padding: 1.1rem 1.2rem;
    background: var(--card); border: 1px solid var(--rule); border-top: 3px solid var(--accent);
    border-radius: 10px; box-shadow: 0 12px 40px rgba(0, 0, 0, .45);
  }
  h2 { margin: 0; padding: 0; border: 0; font-size: var(--type-2); line-height: var(--leading-compact); }
  p { margin: 0; line-height: var(--leading-compact); }
  input { width: 100%; }
  .buttons { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .5rem; }
</style>
