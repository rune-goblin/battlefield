# Battle stage: controller and view

Written 2026-09-20. Plan for the last bullet of item 3 in `foundry-seam.todos.md`.

## Principle

A Svelte component renders and forwards events. A controller holds the state machine and every
call into the rules. ReignMaker is the reference: `src/controllers/*Controller.ts` export a
`createXController()` factory, and the component under `src/view/` calls it.

`src/app/Battle.svelte` breaks this. Its script is 1,322 lines: 37 `$state`, 77 `$derived`,
5 `$effect` and 50 functions, all interaction logic. Its template is about 450 lines.

## Target

```
src/app/battle/
  battle-controller.svelte.ts   createBattleController(deps): composes the four below, owns the
                                activation scope, and returns the view model the component reads
  drag-controller.svelte.ts     drag to move: preview path, barred cell, parked drop, melee
                                readings, move bands and their costs
  ring-controller.svelte.ts     the radial menu, arming, the Cast tree ring, step back and cancel
  picker-controller.svelte.ts   activity picker, TargetingService, target markers, spend
  presentation-hooks.ts         route, burst, popup and announcements against `stage.board`
  BattleOrders.svelte           the left dock: markup and styles, props in, events out
  BattlePins.svelte             the pin layer: MeleeChoices, TargetMarkers, BoardPopup
  BattleResult.svelte           the ended-battle modal
src/app/Battle.svelte           creates the controller, calls `presentStage`, holds the snippets
```

A controller is a `.svelte.ts` factory, so it keeps `$state` and `$derived`. It takes its
dependencies as arguments (`game`, `viewer`, the command functions, `notifications`, a
`board()` getter for `stage.board`) and imports no component. A view imports no engine function
that decides anything; formatting helpers are fine.

## Order of work

1. **A net first.** The e2e suite never plays an action, and PIXI code has no unit tests. Add
   `src/tests/e2e/play.spec.ts`: from a started battle, the GM selects a unit from the reel, drags
   it one hex through `page.mouse` at `stage.board.screenOf(cell)`, confirms, then opens the ring
   and spends Guard. Assert the log gained two lines, the console is empty, and the player client
   shows the same unit on the new hex. This also covers the todo's damage-popup check if the
   second action is a Strike on an adjacent enemy; pick a fixture where one is in reach.
2. **Relocate, do not rewrite.** Move the whole script into `createBattleController` unchanged,
   return every name the template reads, and have the template read `c.name`. Gates green, no
   behaviour change. `$effect` stays legal because the factory runs during component init.
3. **Cut by concern.** Lift drag, ring, picker and presentation hooks out of the big controller
   one at a time, each behind the play spec. Shared state (the active unit, `locked`, `myTurn`,
   the activation scope) stays in `battle-controller` and is passed down as getters.
4. **Split the template** into the three view components once the controller's surface is
   settled, so their props are the final names.
5. **Controller tests.** A controller with injected dependencies runs under vitest with no DOM.
   Add tests where a rule of interaction is unclear enough that a test settles it: step-back
   order, a parked drop's readings, what cancels an arm.

## Invariants

- The engine stays the arbiter: `moves`, `charges`, `offers` and `offersAt` are read, never
  recomputed.
- One activation scope releases every timer, notice and popup it opened.
- Board props handed to `presentStage` are `$derived` values, never inline arrays: the board's
  effects rerun on identity.
- The ring keeps six verbs in a fixed order.

## Gates

Each step: `npm run check`, `npx vitest run`, `npx vite build`, `npm run build:foundry`,
`npx playwright test battle play`.

## Later

`Place.svelte` (559 lines) carries deployment logic of the same kind and takes the same
treatment after Battle.
