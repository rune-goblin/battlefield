<script lang="ts">
  import { game } from './game.svelte.js';
  import { useNotifications } from './notification-context.js';
  import { createTableSiteMenu } from './site-menu.svelte.js';
  import Popover from './Popover.svelte';
  import SitePrompts from './SitePrompts.svelte';

  const menu = createTableSiteMenu(useNotifications());

  let open = $state(false);
  const finalized = $derived(game.stage === 'finalized');

  const pick = (action: () => unknown) => { open = false; void action(); };
</script>

<Popover label="Battle" bind:open>
  {#if !finalized}
    <button disabled={menu.busy} onclick={() => pick(menu.save)} title="Write this battle to its hex">Save</button>
  {/if}
  <button disabled={menu.busy} onclick={() => pick(menu.requestClose)} title="End the session for every player and leave the battle at its hex">Close</button>
  {#if !finalized && game.battle}
    <button disabled={menu.busy} onclick={() => pick(menu.requestEnd)} title="Resolve the battle and send the result to the campaign">End battle</button>
  {/if}
</Popover>

<SitePrompts {menu} />
