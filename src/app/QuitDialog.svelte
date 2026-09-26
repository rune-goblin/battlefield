<script lang="ts">
  import { quitGame, saveBattle } from './game.svelte.js';
  import { useNotifications } from './notification-context.js';
  import Modal from './Modal.svelte';

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

<Modal title="Save before quitting?" alert {close}>
  <p>This game has changes that are not saved.</p>
  <!-- svelte-ignore a11y_autofocus -->
  <input placeholder="Name this save" bind:value={name} disabled={busy} autofocus
    onkeydown={(e) => e.key === 'Enter' && void quit(true)} />
  {#snippet actions()}
    <button onclick={close} disabled={busy}>Cancel</button>
    <button onclick={() => void quit(false)} disabled={busy}>Quit without saving</button>
    <button class="primary" onclick={() => void quit(true)} disabled={busy}>Save and quit</button>
  {/snippet}
</Modal>

<style>
  input { width: 100%; }
</style>
