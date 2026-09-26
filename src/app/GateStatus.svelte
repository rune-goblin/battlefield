<script lang="ts">
  import { actionIconUrl } from '../board/index.js';
  let { open }: { open: boolean } = $props();
</script>

<img src={actionIconUrl('gate')} alt={open ? 'Gate open' : 'Gate closed'} />

<style>
  img { width: 2rem; height: 2rem; flex: none; object-fit: contain; vertical-align: middle; }
</style>
