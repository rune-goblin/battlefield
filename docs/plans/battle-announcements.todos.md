# Battle announcements

- Show the current round on entering the battle view and whenever its day or round changes.
  The centered title enters, holds, and exits over 2.8 seconds.
- Show Attacker or Defender beneath the unit cards for two seconds at each activation
  boundary. Include the activation count so consecutive activations by the same side
  still announce the handover. Selecting a card or spending an action never replays it.
- Let the reel’s actual height position the side label, including enlarged selected cards.
- Keep both overlays transparent to pointer input. Use polite live regions and replace
  motion with a stationary announcement when reduced motion is requested.
- Use the existing CSS animation approach for this small presentation change. No timers,
  animation dependency, or engine changes are needed. Keyed elements cancel old animations
  when the state changes or the battle view closes.
- Verification: Vite build passes, type checks report zero errors, and 529 tests pass
  (one existing skip). The existing TextureLab warning remains. Browser screenshots
  confirm the Defender handover beneath the cards, Round 2 centered on the screen,
  the Attacker label at the round boundary, and both announcements clearing afterward.
  Ran the preview in a separate local battle, then closed its tab and server.

## 2026-09-19 revision

- The round title rises from 75% scale and 28px below center, holds, then sinks and fades.
  It runs 3.6 seconds. Its size dropped from a 5rem ceiling to 2.8rem.
- Both announcements lost their backing gradient, pill, and drop shadow. A paper-coloured
  text stroke carries legibility over the map.
- The side label reads "Attackers" or "Defenders" and wipes in from left to right beneath
  the cards over 2.4 seconds.
- Judgment call: at the first activation of a round (`activated.length === 0`) the side label
  waits 2.4 seconds, so it appears as the round title begins to sink at 2.5 seconds.
  Later activations in the round show it immediately.
- Judgment call: chose "Attackers" over "Attackers move". The label sits under that side's
  cards, so the verb adds nothing.
- Verification: Vite build passes. No screenshot taken.
