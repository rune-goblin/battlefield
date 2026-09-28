<script lang="ts">
  import { CLOSE_PROMPT, RULINGS } from './close-prompt.js';
  import { game } from './game.svelte.js';
  import type { SiteMenu } from './site-menu.svelte.js';
  import Modal from './Modal.svelte';

  let { menu }: { menu: SiteMenu } = $props();

  const result = $derived(game.battle?.winner === 'draw' ? 'The battle ended in a draw.'
    : game.battle?.winner ? `The ${game.battle.winner} holds the field.` : 'The battle is over.');
</script>

{#if menu.prompt === 'close' && game.site}
  <Modal title={CLOSE_PROMPT.title(game.site)} alert close={menu.dismiss}>
    <p>{CLOSE_PROMPT.body}</p>
    {#snippet actions()}
      <button onclick={menu.dismiss} disabled={menu.busy}>{CLOSE_PROMPT.cancel}</button>
      <button onclick={() => void menu.closeWith(false)} disabled={menu.busy}>{CLOSE_PROMPT.discard}</button>
      <button class="primary" onclick={() => void menu.closeWith(true)} disabled={menu.busy}>{CLOSE_PROMPT.save}</button>
    {/snippet}
  </Modal>
{:else if menu.prompt === 'end'}
  <Modal title="End the battle" alert close={menu.dismiss}>
    {#if menu.asksRuling}
      <p>The rules have not settled this battle. Rule who holds the field. The result goes to the campaign and the battle leaves the map.</p>
    {:else}
      <p>{result} The result goes to the campaign and the battle leaves the map.</p>
    {/if}
    {#snippet actions()}
      <button onclick={menu.dismiss} disabled={menu.busy}>Cancel</button>
      {#if menu.asksRuling}
        {#each RULINGS as ruling (ruling.winner)}
          <button class="primary" onclick={() => void menu.endWith(ruling.winner)} disabled={menu.busy}>{ruling.label}</button>
        {/each}
      {:else}
        <button class="primary" onclick={() => void menu.endWith()} disabled={menu.busy}>End battle</button>
      {/if}
    {/snippet}
  </Modal>
{/if}
