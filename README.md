# Battlefield

A fast abstract battle game for armies. Eight by eight, three actions, four wounds. Play it hot-seat in a browser, or on paper with a d20 and a chessboard.

- **Play:** `npm install && npm run dev`
- **Rules:** [`public/rules.html`](public/rules.html), served at `/rules.html` in the app
- **Design notes:** [`docs/design.md`](docs/design.md) — the reasoning, the sources, the open questions
- **Adapters:** [`docs/adapters.md`](docs/adapters.md) — how a troop sheet or a kingdom feeds a battle and reads the result

## The game in one paragraph

Each army is a unit on a chessboard: the attacker deploys on ranks 1–3, the defender on 6–8, and the board between them is generated from the hex's terrain and painted by the GM. On its turn a unit takes three actions and has one reaction: advance, withdraw, strike, volley, brace or rally, with Pathfinder's multiple attack penalty on the second and third attack. Forest hides, swamp slows, water blocks, high ground commands, walls hold. Every roll is a d20 check against a DC using numbers derived from a unit's level and type (infantry or cavalry; siege engines ride with a unit). Hits deal wounds, one or two at a time; four wounds destroy a unit. Taking wounds forces morale checks; failing them makes a unit shaken, and a unit shaken three times routs. The battle ends when one side has nothing standing, or at dusk after six rounds.

## Layout

```
src/engine   pure TypeScript rules: level tables, unit cards, checks, the battle state machine, a sample roster
src/app      Svelte 5 hot-seat client: setup, board, action panel, log; state persists in localStorage
src/tests    vitest specs for the engine
data/troops  the 38 Reignmaker troop actors; `npm run import:troops` regenerates src/engine/combatants.ts from them
data/siege-weapons  pf2e-trooper's 59 siege weapons; `npm run import:engines` regenerates src/engine/engines.ts
scripts      import:official reads a local PF2e system checkout (PF2E_SOURCE=.../packs/pf2e) and regenerates src/engine/official.ts, numbers only
public       the rules document
docs         design notes and the adapter contract
```

`npm test` runs the engine specs. `npm run check` type-checks the app and compiles the engine with no DOM types to keep it portable.

## Lineage

The numbers follow the [Pathfinder Second Edition](https://paizo.com/pathfinder) creature tables and the Kingmaker war rules, so a published troop is a fully specified unit card. The engine has no dependency on [Foundry VTT](https://foundryvtt.com) or on [Reignmaker](https://github.com/motionproto/pf2e-reignmaker), the kingdom-management module this game was designed for; both attach through the contract in `docs/adapters.md`. Design influences: *Dragon Rampant* and *One Page Rules*.

## License

MIT. Pathfinder is a trademark of Paizo Inc.; this project uses the ORC-licensed rules content only.
