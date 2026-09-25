# Troop ability evidence

The [balance and naming review](../../docs/reviews/troop-abilities/balance-review.md) assesses every current template. Display names describe effects; serialized IDs remain stable.

This directory preserves the 2026-09-23 source review. Start with the [review and standards](../../docs/reviews/troop-abilities/README.md) or the [complete troop inventory](../../docs/reviews/troop-abilities/inventory.md). The [implementation guide](../../docs/reviews/troop-abilities/implementation.md) describes the executable shared abilities and portable assignments.

The current proposal is the [assignable catalogue](../../docs/reviews/troop-abilities/catalogue.md). `catalogue.json` defines 16 shared abilities and seven future reaction patterns as design data. `catalogue-examples.json` connects signature mechanics from the broader creature review to those templates. These examples audit the design; source identities never select runtime effects.

`scripts/compile-troop-ability-patterns.mjs` compiles the reviewed snapshots into mechanical recognition patterns. Static and live imports use those patterns through the same adapter. The 16 shared engine effects execute validated assignments; unresolved source mechanics and reactions remain review notes. Evidence files preserve the broader proposals as historical records.

`troop-classifications.json` classifies all 193 selected library troops, seven source alternatives, and 1,384 reviewed source features. It records proposed templates, further candidates, intentional omissions, unresolved prerequisites, and separate reactions. `classification-policy.json` maps the existing human review families to the smaller catalogue; it is an editorial policy, not a recognizer for new actor prose. Run `node scripts/classify-troop-catalogue.mjs` to verify and regenerate the data and [per-troop review](../../docs/reviews/troop-abilities/troop-classification.md). This script never changes playable cards.

`reignmaker-sources.json` preserves 97 registry definitions, six doctrine grants, the training ladder, and relevant source code with file hashes. `reignmaker-mappings.json` records a proposed abstraction, baseline treatment, intentional omission, deferred decision, or future reaction for every definition. ReignMaker supplies additional evidence rather than an exhaustive specification.

Run `node scripts/audit-reignmaker-abilities.mjs` to verify evidence, references, training grants, and coverage and to render the catalogue table and ReignMaker mapping. Refresh the local source snapshot with `node scripts/audit-reignmaker-abilities.mjs --refresh /path/to/pf2e-reignmaker`; changed definitions require a fresh review before validation passes. Neither audit changes playable cards or the source checkout.

`sources.json` contains 200 source actors, including seven alternatives that the current imports suppress. It stores original item data, readable action text, localizations, source IDs, hashes, and publication metadata. `reviews.json` records proposals for all 1,384 action items. `coverage.json` records validation counts. These files do not enable gameplay effects.

The records distinguish original source content from proposed Battlefield conversions. Preserve item IDs and hashes when editing a review. Refreshing evidence does not approve a new interpretation. Render and verify with `node scripts/audit-troop-abilities.mjs`; refresh from a PF2e repository with `node scripts/audit-troop-abilities.mjs --refresh /path/to/pf2e`.

Pathfinder source text retains its original publication and licensing metadata; the repository's MIT license grants no rights to Paizo content. See [the repository license](../../LICENSE). PF2e glossary text comes from the pinned system checkout. ReignMaker source items come from `data/troops`. The snapshot preserves each actor's `system.details.publication` record rather than assigning a blanket license to mixed sources.
