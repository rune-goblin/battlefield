<script lang="ts">
  import { quitGame, saveBattle } from './game.svelte.js';
  import { useNotifications } from './notification-context.js';

  let { close }: { close: () => void } = $props();

  const notifications = useNotifications();
  let name = $state('');
  let busy = $state(false);

  async function quit(save: boolean) {
    busy = true;
    try {
      if (save) await saveBattle(name.trim() || new Date().toLocaleString());
      close();
      quitGame();
    } catch (error) {
      notifications.show({ id: 'quit', title: 'The game was not saved', message: error instanceof Error ? error.message : String(error), tone: 'error' });
    } finally {
      busy = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') close(); }} />

<div class="scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="quit-title">
    <h2 id="quit-title">Save before quitting?</h2>
    <p>This game has changes that are not saved.</p>
    <!-- svelte-ignore a11y_autofocus -->
    <input placeholder="Name this save" bind:value={name} disabled={busy} autofocus
      onkeydown={(e) => e.key === 'Enter' && void quit(true)} />
    <div class="buttons">
      <button onclick={close} disabled={busy}>Cancel</button>
      <button onclick={() => void quit(false)} disabled={busy}>Quit without saving</button>
      <button class="primary" onclick={() => void quit(true)} disabled={busy}>Save and quit</button>
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
  h2 { margin: 0; padding: 0; border: 0; font-size: 1.15rem; line-height: 1.3; }
  p { margin: 0; line-height: 1.45; }
  input { width: 100%; }
  .buttons { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .5rem; }
</style>
