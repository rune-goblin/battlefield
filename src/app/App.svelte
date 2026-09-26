<script lang="ts">
  import TextureLab from './TextureLab.svelte';
  import { textureLab } from './texture-lab.svelte.js';
  import BoardSetup from './BoardSetup.svelte';
  import Paint from './Paint.svelte';
  import Place from './Place.svelte';
  import Sides from './Sides.svelte';
  import Summary from './Summary.svelte';
  import Battle from './Battle.svelte';
  import { game, gmUserId, presentation, viewerId } from './game.svelte.js';
  import { nav, STAGE_SIDE } from './navigation.svelte.js';
  import { provideNotifications } from './notification-context.js';
  import Notifications from './Notifications.svelte';
  import { setAppRoot } from './app-root.js';
  import PixiBoard from './PixiBoard.svelte';
  import { AppShell } from './shell/index.js';
  import { stage } from './stage-view.svelte.js';
  import { connectAuthority } from './authority.svelte.js';
  import { followArt } from './art-preload.js';
  import { visibleRect } from './shell/layout.svelte.js';
  import { selectionCss } from '../board/index.js';

  let viewportWidth = $state(window.innerWidth);
  let viewportHeight = $state(window.innerHeight);

  const notifications = provideNotifications();
  presentation.connectNotices(notifications, { get userId() { return viewerId(); }, get isGm() { return gmUserId() === viewerId(); } });
  connectAuthority(notifications);
  followArt();

  // proto: `?vfx` opens the spell-effect gallery instead of the game, so an effect can be
  // tuned and screenshotted without playing a battle up to a cast. Works in a dev build only.
  const vfxGallery = import.meta.env.DEV && new URLSearchParams(location.search).has('vfx') ? import('./VfxGallery.svelte') : null;

  const lab = $derived((import.meta.env.DEV && textureLab.open) || !!vfxGallery);
  const view = $derived(stage.view);

  // The board outlives a stage, and a burst or popup from the last one would play on over
  // the next.
  $effect(() => { void nav.stage; stage.board?.clearEffects(); });

  function appRoot(el: HTMLElement) {
    setAppRoot(el);
    return () => setAppRoot(null);
  }
</script>

<svelte:window bind:innerWidth={viewportWidth} bind:innerHeight={viewportHeight} />

<!-- App owns the one AppShell and the one PixiBoard, so the GL context and every uploaded
     texture outlive a stage switch. A stage renders nothing of its own: it presents its
     panels, board props and handlers through `stage-view`. The root is what the app's CSS
     hangs off and what tells a key press inside the app from one outside it. -->
<div class="battlefield-root" style={selectionCss} {@attach appRoot}>
  {#if import.meta.env.DEV && textureLab.open}
    <TextureLab />
  {:else if vfxGallery}
    {#await vfxGallery then { default: VfxGallery }}
      <VfxGallery />
    {/await}
  {:else if nav.stage === 'battle' && game.battle}
    <Battle />
  {:else if STAGE_SIDE[nav.stage] && game.setup.board}
    <Place side={STAGE_SIDE[nav.stage]!} pieces="units" />
  {:else if nav.stage === 'siege' && game.setup.board}
    <Place pieces="engines" />
  {:else if nav.stage === 'sides' && game.setup.board}
    <Sides />
  {:else if nav.stage === 'summary' && game.setup.board}
    <Summary />
  {:else if nav.stage === 'paint' && game.setup.board}
    <Paint />
  {:else}
    <BoardSetup />
  {/if}

  <!-- After the stages on purpose: effects run in template order, so a stage switch has
       presented the next view before the shell and the board read it. Ahead of them, the
       board would read the outgoing stage's getters against state that is already gone. -->
  {#if !lab && view}
    <AppShell
      leftTitle={view.leftTitle} rightTitle={view.rightTitle} leftWidth={view.leftWidth} rightWidth={view.rightWidth}
      top={view.top} bottom={view.bottom} left={view.left} leftHead={view.leftHead} right={view.right} rail={view.rail}
      pin={view.pin} float={view.float} modal={view.modal}
    >
      {#snippet map()}
        <div class="mapwrap" class:aiming={view.aiming}><PixiBoard bind:this={stage.board} fill {...view.board}
          frameWithin={nav.stage === 'battle' ? null : visibleRect(viewportWidth, viewportHeight)} /></div>
      {/snippet}
    </AppShell>
  {/if}

  <Notifications />
</div>

<style>
  .mapwrap { width: 100%; height: 100%; }
  .mapwrap.aiming { cursor: crosshair; }
</style>
