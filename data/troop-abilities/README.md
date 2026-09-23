# Troop ability evidence

This directory preserves the 2026-09-23 source review. Start with the [review and standards](../../docs/reviews/troop-abilities/README.md) or the [complete troop inventory](../../docs/reviews/troop-abilities/inventory.md).

`sources.json` contains 200 source actors, including seven alternatives that the current imports suppress. It stores original item data, readable action text, localizations, source IDs, hashes, and publication metadata. `reviews.json` records proposals for all 1,384 action items. `coverage.json` records validation counts. These files do not enable gameplay effects.

The records distinguish original source content from proposed Battlefield conversions. Preserve item IDs and hashes when editing a review. Refreshing evidence does not approve a new interpretation. Render and verify with `node scripts/audit-troop-abilities.mjs`; refresh from a PF2e repository with `node scripts/audit-troop-abilities.mjs --refresh /path/to/pf2e`.

Pathfinder source text retains its original publication and licensing metadata; the repository's MIT license grants no rights to Paizo content. See [the repository license](../../LICENSE). PF2e glossary text comes from the pinned system checkout. ReignMaker source items come from `data/troops`. The snapshot preserves each actor's `system.details.publication` record rather than assigning a blanket license to mixed sources.
