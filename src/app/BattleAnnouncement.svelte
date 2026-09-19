<script lang="ts">
  import type { Side } from '../engine/index.js';

  interface Props {
    text: string;
    cue: string;
    kind: 'round' | 'side';
    side?: Side;
    /** The side label waits for the round title to start leaving. */
    afterRound?: boolean;
  }
  let { text, cue, kind, side, afterRound = false }: Props = $props();
</script>

<!-- A cue changes only at a round or activation boundary. Picking a card and spending
     actions leave this animation alone. CSS owns its lifetime; unmount cancels it. -->
<div class="announcement" class:round={kind === 'round'} class:side={kind === 'side'}
  class:defender={side === 'defender'} class:after-round={afterRound}
  role="status" aria-live="polite" aria-atomic="true">
  {#key cue}
    <div class="message"><span>{text}</span></div>
  {/key}
</div>

<style>
  .announcement { pointer-events: none; user-select: none; text-align: center; }
  .round { position: absolute; inset: 0; display: grid; place-items: center; z-index: 2; }
  .message {
    display: flex; align-items: center; justify-content: center; gap: 1rem;
    width: fit-content; max-width: calc(100% - 2rem); margin-inline: auto;
    color: var(--ink); -webkit-text-stroke: 5px var(--paper); paint-order: stroke fill;
    opacity: 0; visibility: hidden;
  }
  .message::before, .message::after {
    content: ''; flex: 0 1 3rem; width: 3rem; height: 1px;
    background: linear-gradient(90deg, transparent, currentColor);
    opacity: .65;
  }
  .message::after { transform: rotate(180deg); }
  .round .message {
    font-size: clamp(2.4rem, 4.6vw, 4rem); font-weight: 650; letter-spacing: .08em;
    white-space: nowrap;
    animation: round-title 4.2s ease both;
  }
  .side { --turn-colour: var(--att); margin-top: .65rem; }
  .side.defender { --turn-colour: var(--def); }
  .side .message {
    gap: 1rem;
    color: color-mix(in srgb, var(--turn-colour) 75%, var(--ink));
    -webkit-text-stroke-width: 4px;
    font-size: clamp(1.5rem, 2.4vw, 2.1rem); font-weight: 700; letter-spacing: .18em; text-transform: uppercase;
    animation: side-label 4s ease both;
  }
  /* Starts as the 4.2s round title begins its descent at 70%. */
  .side.after-round .message { animation-delay: 2.8s; }
  .side .message::before, .side .message::after { width: 3.5rem; flex-basis: 3.5rem; height: 2px; }
  @keyframes round-title {
    0% { opacity: 0; visibility: visible; transform: translateY(28px) scale(.75); }
    18%, 70% { opacity: 1; visibility: visible; transform: translateY(0) scale(1); }
    99% { opacity: 0; visibility: visible; transform: translateY(22px) scale(.92); }
    100% { opacity: 0; visibility: hidden; transform: translateY(22px) scale(.92); }
  }
  /* The negative insets keep the text stroke inside the clip. */
  @keyframes side-label {
    0% { opacity: 0; visibility: visible; clip-path: inset(-.5rem 100% -.5rem -.5rem); transform: translateX(-24px); }
    15%, 82% { opacity: 1; visibility: visible; clip-path: inset(-.5rem); transform: translateX(0); }
    99% { opacity: 0; visibility: visible; clip-path: inset(-.5rem); transform: translateX(0); }
    100% { opacity: 0; visibility: hidden; clip-path: inset(-.5rem); transform: translateX(0); }
  }
  @keyframes announce-still {
    0%, 90% { opacity: 1; visibility: visible; }
    100% { opacity: 0; visibility: hidden; }
  }
  @media (prefers-reduced-motion: reduce) {
    .round .message, .side .message { animation-name: announce-still; }
  }
</style>
