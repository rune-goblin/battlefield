<script lang="ts">
  import ClientPanel from './ClientPanel.svelte';
  import { createTable } from './table.js';

  const table = createTable();
</script>

<main>
  <h1>Two clients, one authority</h1>
  <p>
    Alice plays the attacker and Bob the defender, each a <code>ClientStore</code> over the
    in-memory transport of <code>src/adapters/memory/memoryTransport.ts</code>, converging on
    the one authority's committed record. Delay holds a client's deliveries until you release
    them; drop loses them outright, repaired by the next commit that client does see.
  </p>
  <div class="clients">
    <ClientPanel store={table.alice} link={table.aliceLink} title="Alice — attacker" />
    <ClientPanel store={table.bob} link={table.bobLink} title="Bob — defender" />
  </div>
</main>

<style>
  :global(body) { margin: 0; background: #0f1218; color: #d8dbe2; }
  main { padding: 1.2rem; font-family: system-ui, sans-serif; }
  h1 { font-size: 1.2rem; margin: 0 0 .4rem; }
  p { max-width: 52rem; line-height: 1.5; font-size: .85rem; color: #9aa3b5; }
  code { color: #d98b6e; }
  .clients { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 1rem; }
</style>
