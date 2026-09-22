# Performance review

Reviewed placement and battle input, route planning, Svelte-to-Pixi updates, terrain rendering, animation loops, and session persistence. The fixes below remove repeated work on interactive paths. Operation-count tests establish the reductions; this review does not claim a frame-rate improvement from a hardware profile.

## Fixes

| Priority | Finding | Change and evidence |
| --- | --- | --- |
| High | Every pointer movement triggered battle preview logic, including path searches, target selection, and notification updates. | `Interaction.ts` emits a preview when the cell or boundary-exit state changes. The miniature still receives every pointer position. A regression test sends 100 moves within one cell: 100 miniature updates, one preview event. Drop coordinates, cancellation, and fleeing through the edge retain their behavior. |
| High | Movement and charge routes searched the same reachable area twice. Melee candidates could repeat a successful charge search three times. | `battle.ts` reuses each reach map to reconstruct its route. Movement and charge regression tests each require one search. Melee candidates reuse the search that selected their landing cell. Existing terrain, engagement, flight, charge, and action-budget tests pass. |
| Medium | Every committed battle action cloned the whole setup, including its board and troop sheets, then discarded some of the copy. Deployment also copied terrain it had not changed. | `setup-copy.ts` keeps an independent UI copy and copies only branches whose source references changed. Tests confirm zero clones for 100 repeated reads of an unchanged setup and one clone for a troop-only change. Terrain edits, imported records, settings, undo, and isolation from the authoritative record have coverage. |
| Medium | Terrain settings triggered an immediate map bake followed by another bake when an already-satisfied loading promise resolved. Late callbacks could also draw textured terrain while the illustrated map was active. | `TerrainLayer.setAppearance` reports whether new textures arrived. The board repeats the bake only for new assets belonging to the current appearance, while the textured map is active. Tests cover warm assets, settings-only edits, superseded requests, and failed loads. |

The preceding placement fix also keeps selection stable during pointer movement and skips unchanged highlight sets. This review retains that behavior.

## Remaining profiling targets

1. **Idle rendering and shadows.** `BoardApp.ts` renders through Pixi's continuous ticker; `TokenLayer.ts` ticks every token and applies a shared shadow filter. Animation needs these updates while pieces move, pulse, or react. Measure GPU time and idle frame cost before introducing an idle scheduler; that change must cover every animation source and the Foundry ticker.
2. **Target-overlay tracking.** `TargetMarkers.svelte` calculates anchors and serializes their display data every animation frame while markers exist. It already skips unchanged DOM updates. A board-transform revision could let it skip the calculations too. Measure the largest spell target sets before adding that cross-layer API.
3. **Remote record identity.** The setup-copy optimization benefits records that preserve unchanged object references. A full record arriving over the network has new references and still requires copying. A protocol-level revision or structural-sharing layer could preserve identity; local caching alone cannot safely infer unchanged remote data.
4. **Growing save records.** Browser and Foundry repositories serialize the complete session for each committed command. Large battle histories may make those writes costly. Saving before publication gives the command its durability guarantee. Measure large records and storage latency before changing this ordering or storage format.

The pathfinder sorts its frontier, but supported boards are small. Removing duplicate searches gives a clear reduction without changing tie-breaking or introducing a heap. Archive and outcome operations run on explicit commands rather than pointer movement and have lower priority for interactive latency.

## Verification

- Full suite: 739 tests passed, one skipped.
- Type checks and production build passed with existing Svelte and bundle-size warnings.
- Browser checks covered troop placement, battle startup, a drag preview, movement confirmation, undo, and both map styles. No browser errors appeared.
- Foundry multiplayer timing and GPU frame-time profiling remain outside this pass.
