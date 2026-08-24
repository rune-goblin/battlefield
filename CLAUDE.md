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
  `src/app/` — Svelte stages. `docs/design.md` is the rules source; `public/rules.html` is
  the player text; `docs/plans/` holds wave plans.
