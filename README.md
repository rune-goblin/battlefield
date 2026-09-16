# Battlefield

A fast abstract battle game for armies. A hexagon of sixty-one hexes, three actions, four wounds. Play it hot-seat in a browser, or on paper with a d20.

- **Play:** `npm install && npm run dev`
- **Rules:** [`public/rules.html`](public/rules.html), served at `/rules.html` in the app — the single source of truth, design notes and sources included
- **Adapter contract:** [`docs/adapter-contract.md`](docs/adapter-contract.md) — the seam a troop sheet or a kingdom feeds a battle through, and reads the result back from
- **The PIXI board:** [`docs/pixi-board.md`](docs/pixi-board.md) — the board library's API, its grid abstraction (square and hex), and how to mount it somewhere else (Foundry, Reignmaker)
- **History:** [`docs/plans/`](docs/plans) — the wave plans and the judgment calls behind them. History, not rules.

## Terrain texture lab

Run `npm run dev`, then use **Terrain texture lab** in the map controls or open `/?textures`.
Click a sample hex or a terrain palette button to select its group. The right panel offers
texture thumbnails and a scale slider. Scale measures image width in hex pitches; adjacent
hexes share a continuous polygon mask and texture origin. Forests add 3–8 tree sprites per
hex by default, with minimum and maximum sliders from 0 to 20 and a button to turn trees off.

The lab saves preferences in browser storage and uses its own sample board. **Game board**
returns to the current game. The lab is available during development only.

Add JPG, PNG, or WebP images under `public/art/terrain/textures/<group>/` and restart the dev
server to refresh the catalog. Groups are `plains`, `forest`, `swamp`, `water`, `hills`,
`mountain`, and `settlement`. Shallows share the water library. Settlement uses a plain fill
until its folder contains art.

## The game in one paragraph

Each army is a unit on a hexagon of sixty-one hexes. The sides alternate, and an activation is three actions with one attack. Activities cost one, two or three actions; extra commitment buys +2 per action, up to +4, on attacks and recovery rolls or a Controlling spell's DC. Players trade accuracy against special effects, spell coverage, movement and defence. Press forces the target to roll its wound save twice and keep the worse. Four wounds destroy a unit; three disorder fill its morale track and rout it. At one or two disorder it retains its ordinary activities, with −1 to rolls and Defence per point. Rally and Healing restore order. The battle ends when one side has nothing standing, or at dusk after six rounds.

## Layout

```
src/engine   pure TypeScript rules: level tables, unit cards, checks, the battle state machine, a sample
             roster, and the Grid abstraction (square/hex) the board and the rules both read
src/board    the PIXI board: layers, tokens, pointer interaction; pixi.js only, no Svelte — see docs/pixi-board.md
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
docs         the adapter contract and the board's API/mount doc; docs/plans holds the wave
             plans and their judgment calls, which are history rather than rules
dev/foundry-mount  a prototype page (`npx vite`, not part of the production build) proving the
             board mounts into a stage this code doesn't own — see docs/pixi-board.md
```

`npm test` runs the engine specs. `npm run check` type-checks the app and compiles the engine with no DOM types to keep it portable.

## Lineage

The numbers follow the [Pathfinder Second Edition](https://paizo.com/pathfinder) creature tables and the Kingmaker war rules, so a published troop is a fully specified unit card. The engine has no dependency on [Foundry VTT](https://foundryvtt.com) or on [Reignmaker](https://github.com/motionproto/pf2e-reignmaker), the kingdom-management module this game was designed for; both attach through the contract in `docs/adapter-contract.md`. Design influences: *Dragon Rampant* and *One Page Rules*.

`src/board/` renders on `pixi.js@7.4.3`, pinned to Foundry v14's own bundled runtime so board code moves between this repo and a Reignmaker/Foundry module without a version port; a handful of pieces (`LayerManager`, `MapTextUtils`, the terrain palette, the token sprite-cache and paint-commit patterns) are lifted from Reignmaker's own map code. See `docs/pixi-board.md`.

## Art

Game-piece art under `public/art/` comes from [`rune-goblin/pf2e-trooper`](https://github.com/rune-goblin/pf2e-trooper), Mark's own module; its `LICENSE` covers the module's code (MIT) and is silent on the art in `assets/`, which is his own generated work, so it is committed here rather than fetched at build time. The two generic fallback tokens (`army-infantry.webp`, `army-cavalry.webp`) come from [`pf2e-reignmaker`](https://github.com/motionproto/pf2e-reignmaker), also Mark's.

## License

MIT. Pathfinder is a trademark of Paizo Inc.; this project uses the ORC-licensed rules content only.
