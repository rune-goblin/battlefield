# Battlefield

## Mode: prototype

We are exploring the board and its rules, not shipping. Until this section is removed:

- Do not write exhaustive tests. Keep `npx vitest run` green; add a test only where a rule
  is unclear enough that a test settles it. No tests for PIXI code.
- Gate work on `npx vite build` and a screenshot, not on the full check/test/review cycle.
- Decide judgment calls yourself and note them in `docs/plans/*.todos.md`.
- Shortcuts are fine; mark them `// proto:` so they can be found later.

## Layout

- `src/engine/` — pure rules, no DOM, no PIXI. `src/board/` — PIXI board, no Svelte.
  `src/app/` — Svelte stages.
- `public/rules.html` is the single source of truth for the rules. There is no second rules
  document: when a rule changes, that file changes with it, and the engine is the arbiter of
  what it says. `docs/adapter-contract.md` is the integration seam and `docs/pixi-board.md` is
  the board library's API — code, not rules.
- `docs/plans/` records how the design got here. Every file in it is history, dated to the wave
  that wrote it, and none of it is authoritative about current rules; the `*.todos.md` files
  hold the judgment calls and the open questions for play.
