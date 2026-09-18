<script lang="ts">
  import TextureLab from './TextureLab.svelte';
  import { textureLab } from './texture-lab.svelte.js';
  import BoardSetup from './BoardSetup.svelte';
  import Paint from './Paint.svelte';
  import Place from './Place.svelte';
  import Battle from './Battle.svelte';
  import VfxGallery from './VfxGallery.svelte';
  import { game, gmUserId, presentation, viewerId } from './game.svelte.js';
  import { nav, STAGE_SIDE } from './navigation.svelte.js';
  import { provideNotifications } from './notification-context.js';
  import Notifications from './Notifications.svelte';
  import { setAppRoot } from './app-root.js';

  const notifications = provideNotifications();
  presentation.connectNotices(notifications, { userId: viewerId, get isGm() { return gmUserId() === viewerId; } });

  // proto: `?vfx` opens the spell-effect gallery instead of the game, so an effect can be
  // tuned and screenshotted without playing a battle up to a cast.
  const vfxLab = new URLSearchParams(location.search).has('vfx');

  function appRoot(el: HTMLElement) {
    setAppRoot(el);
    return () => setAppRoot(null);
  }
</script>

<!-- Every stage mounts its own AppShell: the shell is the layout, the stage says what goes in
     its layers. App itself only decides which stage is on. The root around them is what the
     app's CSS hangs off and what tells a key press inside the app from one outside it. -->
<div class="battlefield-root" {@attach appRoot}>
  {#if import.meta.env.DEV && textureLab.open}
    <TextureLab />
  {:else if vfxLab}
    <VfxGallery />
  {:else if nav.stage === 'battle' && game.battle}
    <Battle />
  {:else if STAGE_SIDE[nav.stage] && game.setup.board}
    <Place side={STAGE_SIDE[nav.stage]!} />
  {:else if nav.stage === 'paint' && game.setup.board}
    <Paint />
  {:else}
    <BoardSetup />
  {/if}

  <Notifications />
</div>
