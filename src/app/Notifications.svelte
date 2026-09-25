<script lang="ts">
  import { useNotifications } from './notification-context.js';
  import { ui } from './shell/layout.svelte.js';
  import { actionIconUrl } from '../board/index.js';

  const notifications = useNotifications();
  const symbols = { info: 'i', success: '✓', warning: '!', error: '×' };
</script>

<div class="notifications" aria-label="Notifications"
  style="--left:{ui.chrome.left}px; --right:{ui.chrome.right}px; --bottom:{ui.chrome.bottom}px">
  {#each $notifications as message (message.id)}
    <div class="notification" data-tone={message.tone} role="status">
      {#if message.tone === 'error'}
        <img class="symbol" src={actionIconUrl('no')} alt="" />
      {:else}<span class="symbol" aria-hidden="true">{symbols[message.tone]}</span>{/if}
      <div class="copy"><strong>{message.title}</strong><span>{message.message}</span></div>
      <button aria-label="Dismiss notification" onclick={() => notifications.dismiss(message.id)}>×</button>
    </div>
  {/each}
</div>

<style>
  .notifications { position: fixed; z-index: 20; left: calc(var(--left) + .85rem); bottom: calc(var(--bottom) + .85rem); display: flex; flex-direction: column; gap: .5rem; width: min(32rem, calc(100% - var(--left) - var(--right) - 1.7rem)); max-height: 50vh; overflow-y: auto; pointer-events: none; }
  .notification { display: flex; gap: .6rem; align-items: flex-start; padding: .65rem .8rem; border: 1px solid var(--rule); border-radius: 8px; background: var(--card); color: var(--ink); font-size: var(--type-small); box-shadow: 0 2px 8px rgba(0, 0, 0, .25); }
  .notification[data-tone='error'] { border-color: var(--bad); }
  .notification[data-tone='warning'] { border-color: #b78939; }
  .notification[data-tone='success'] { border-color: #6b9c68; }
  .copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: .3rem; line-height: var(--leading-compact); overflow-wrap: anywhere; }
  .symbol { flex-shrink: 0; width: 1.7rem; height: 1.3rem; object-fit: contain; text-align: center; font-weight: 700; }
  button { pointer-events: auto; flex-shrink: 0; padding: 0 .3rem; color: var(--muted); background: transparent; border: 0; font: inherit; font-size: var(--type-1); cursor: pointer; }
</style>
