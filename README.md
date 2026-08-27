# Battlefield

A fast abstract battle game for armies. A hexagon of sixty-one hexes, three actions, four wounds. Play it hot-seat in a browser, or on paper with a d20.

- **Play:** `npm install && npm run dev`
- **Rules:** [`public/rules.html`](public/rules.html), served at `/rules.html` in the app
- **Design notes:** [`docs/design.md`](docs/design.md) — the reasoning, the sources, the open questions
- **Adapters:** [`docs/adapters.md`](docs/adapters.md) — how a troop sheet or a kingdom feeds a battle and reads the result
- **The board:** [`docs/board.md`](docs/board.md) — the PIXI board's API, its grid abstraction (square and hex), and how to mount it somewhere else (Foundry, Reignmaker)

## The game in one paragraph

Each army is a unit on a chessboard: the attacker deploys on ranks 1–3, the defender on 6–8, and the board between them is generated from the hex's terrain and painted by the GM. On its turn a unit takes three actions and has one reaction: advance, withdraw, strike, volley, brace or rally, with Pathfinder's multiple attack penalty on the second and third attack. Forest hides, swamp slows, water blocks, high ground commands, walls hold. Every roll is a d20 check against a DC using numbers derived from a unit's level and type (infantry or cavalry; siege engines ride with a unit). Hits deal wounds, one or two at a time; four wounds destroy a unit. Taking wounds forces morale checks; failing them makes a unit shaken, and a unit shaken three times routs. The battle ends when one side has nothing standing, or at dusk after six rounds.

## Layout

```
src/engine   pure TypeScript rules: level tables, unit cards, checks, the battle state machine, a sample
             roster, and the Grid abstraction (square/hex) the board and the rules both read
src/board    the PIXI board: layers, tokens, pointer interaction; pixi.js only, no Svelte — see docs/board.md
src/app      Svelte 5 hot-seat client: setup, board, action panel, log; state persists in localStorage
src/tests    vitest specs for the engine
data/troops  the 38 Reignmaker troop actors; `npm run import:troops` regenerates src/engine/combatants.ts from them
data/siege-weapons  pf2e-trooper's 59 siege weapons; `npm run import:engines` regenerates src/engine/engines.ts
scripts      import:official reads a local PF2e system checkout (PF2E_SOURCE=.../packs/pf2e) and regenerates src/engine/official.ts, numbers only
public/art   game-piece art for every troop and siege engine, fetched from pf2e-trooper (Mark's
             own repo; art licence covered under "Art" below) by `npm run import:art`, which also
             writes src/engine/art.ts (card name -> path, falling back to Reignmaker's generic
             infantry/cavalry tokens for hand-authored cards) — 17 MB committed, and the same
             amount added to `dist/` by a production build (webp doesn't gzip further)
public       the rules document
docs         design notes, the adapter contract, and the board's API/mount doc
dev/foundry-mount  a prototype page (`npx vite`, not part of the production build) proving the
             board mounts into a stage this code doesn't own — see docs/board.md
```

`npm test` runs the engine specs. `npm run check` type-checks the app and compiles the engine with no DOM types to keep it portable.

## Lineage

The numbers follow the [Pathfinder Second Edition](https://paizo.com/pathfinder) creature tables and the Kingmaker war rules, so a published troop is a fully specified unit card. The engine has no dependency on [Foundry VTT](https://foundryvtt.com) or on [Reignmaker](https://github.com/motionproto/pf2e-reignmaker), the kingdom-management module this game was designed for; both attach through the contract in `docs/adapters.md`. Design influences: *Dragon Rampant* and *One Page Rules*.

`src/board/` renders on `pixi.js@7.4.3`, pinned to Foundry v14's own bundled runtime so board code moves between this repo and a Reignmaker/Foundry module without a version port; a handful of pieces (`LayerManager`, `MapTextUtils`, the terrain palette, the token sprite-cache and paint-commit patterns) are lifted from Reignmaker's own map code. See `docs/board.md`.

## Art

Game-piece art under `public/art/` comes from [`rune-goblin/pf2e-trooper`](https://github.com/rune-goblin/pf2e-trooper), Mark's own module; its `LICENSE` covers the module's code (MIT) and is silent on the art in `assets/`, which is his own generated work, so it is committed here rather than fetched at build time. The two generic fallback tokens (`army-infantry.webp`, `army-cavalry.webp`) come from [`pf2e-reignmaker`](https://github.com/motionproto/pf2e-reignmaker), also Mark's.

## License

MIT. Pathfinder is a trademark of Paizo Inc.; this project uses the ORC-licensed rules content only.
