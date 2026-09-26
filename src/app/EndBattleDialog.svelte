<script lang="ts">
  import { battleUnsaved, saveBattle } from './game.svelte.js';
  import { leaveBattle } from './navigation.svelte.js';
  import { useNotifications } from './notification-context.js';
  import { commandReporter } from './command-notices.js';
  import Modal from './Modal.svelte';

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

<Modal title="End the battle" alert {close}>
  {#if unsaved}
    <p>This battle has moves that are not saved. Ending it closes the battle for every player.</p>
    <input placeholder="Name this save" bind:value={name} disabled={busy} />
  {:else}
    <p>Ending the battle closes it for every player.</p>
  {/if}
  {#snippet actions()}
    <button onclick={close} disabled={busy}>Cancel</button>
    {#if unsaved}
      <button onclick={() => void end(false)} disabled={busy}>End without saving</button>
      <button class="primary" onclick={() => void end(true)} disabled={busy}>Save and end</button>
    {:else}
      <button class="primary" onclick={() => void end(false)} disabled={busy}>End battle</button>
    {/if}
  {/snippet}
</Modal>

<style>
  input { width: 100%; }
</style>
