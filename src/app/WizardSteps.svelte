<script lang="ts">
  import { back, forward, nav, STEPS } from './navigation.svelte.js';
  import { useNotifications } from './notification-context.js';
  import { commandReporter } from './command-notices.js';

  const run = commandReporter(useNotifications());

  const step = $derived(forward());
  const current = $derived(STEPS.findIndex((s) => s.id === nav.stage));

  async function advance() {
    const pending = step.go();
    if (pending) await run(pending);
  }
</script>

<div class="steps">
  <button onclick={back} disabled={current === 0}>Back</button>
  <button class="primary" disabled={!step.enabled} onclick={() => void advance()}>{step.label}</button>
</div>

<style>
  .steps { display: flex; gap: .4rem; }
  .steps button { flex: 1; min-width: 0; padding: .35rem .5rem; }
  .steps .primary { flex: 2; }
</style>
