# C2 remediation plan

Written 2026-09-26 against `6850377`. It fixes every finding in [the C2 audit](../c2-audit.md) in nine
waves, and W10 adds one feature. [The todos file](c2-remediation.todos.md) holds the work still open and the questions for play.
`.claude/workflows/c2-remediation.js` runs one wave per invocation.

## Running a wave

```
Workflow  name: c2-remediation   args: { "wave": "W1" }
```

One invocation runs one wave and stops. Between waves the user reads the branch, plays the build,
answers open questions and decides whether to continue. Waves run in order: each assumes the ones
before it have landed.

## Roles

| Role | Model | Agent type | Job |
| --- | --- | --- | --- |
| Overseer | Opus, high effort | general-purpose | Briefs each task against the current code, answers rules questions from `public/rules.html`, triages every blocked or rejected attempt, and writes the ledger. |
| Executor, mechanical | Sonnet | `wave-executor`, `recipe-sweeper` | Deletions, sweeps, helper extraction, token swaps. |
| Executor, design | Opus | `wave-executor`, `svelte:svelte-file-editor` | Rules fixes, new seams, controller splits, migrations. |
| Executor, escalated | Fable | as the task | Takes a task after two failed attempts, or from the start when the overseer judges the design hard. |
| Reviewer | Opus; Fable for escalated tasks | `wave-reviewer` | Reviews each task's commits against its findings and this plan's invariants: APPROVE or BLOCK. |
| Verifier | Sonnet | `test-verifier` | Runs the baseline and the wave gate. |
| Integrator and fixer | Opus; Fable on the third gate round | `wave-executor` | Merges lane branches and repairs gate failures. |

## Wave protocol

1. **Prepare.** The main tree must be clean. It switches to `c2-remediation`, which is created from `master` on the first wave.
2. **Brief and baseline.** Two agents run in parallel:
   - The overseer reads the wave's tasks, their findings and the code as it stands. It writes a brief per task and may skip a finding it finds false or already fixed, with the reason.
     - It may raise a task's model from Sonnet to Opus, or to Fable.
     - It answers rules questions from `public/rules.html`. It records any question the rules leave open.
   - The verifier runs the gate on `c2-remediation` to record the failures that already exist.
3. **Execute.** A wave has one or more stages.
   - **Worktrees:** each lane in a stage gets its own worktree at `../battlefield-wt/<wave>-s<stage>-<lane>` on branch `c2/<wave>-s<stage>-<lane>`, with `node_modules` linked in.
   - **Order:** lanes run in parallel, and tasks within a lane run in order.
   - **Commits:** each executor commits its units with the subject prefix `c2(<task>):`.
   - **Review:** the reviewer checks each task before the next one starts.
4. **Escalate.** A task gets at most three attempts. After a BLOCK or a blocked executor, the overseer chooses one of four actions:
   - **retry** on the same model, with guidance;
   - **upgrade** Sonnet to Opus, or Opus to Fable;
   - **escalate** straight to Fable;
   - **defer** with a recorded question.

   The executor fixes forward on top of its own commits. When a task fails or is deferred, the rest of its lane stops.
5. **Integrate.** The integrator merges each lane only up to the last commit a reviewer approved, and then removes the worktrees. A later stage branches from the merged result.
6. **Gate.** The verifier runs the wave gate against the baseline. Failures go to a fixer: Opus, then Opus, then Fable. After three rounds the wave halts.
7. **Ledger.** The overseer updates the records and commits the result:
   - It marks each audit finding `[done]`, `[partial]`, `[skipped]` or `[deferred]`, with a resolution line.
   - It removes finished items from the todos file and adds open questions.

## Gate

The wave gate is:

```
CI=1 npx vitest run && npm run check && npx vite build && npm run build:foundry
```

CLAUDE.md asks for less than this in prototype mode. The wider gate applies to every wave anyway, because the work is structural and several waves touch `src/runtime/` and `src/services/`.

## Invariants

- **Rules authority.** `public/rules.html` holds the rules and the engine arbitrates them. A fix that changes a rules outcome must match the rules page. When the page is silent, the task is deferred with a question, and nobody guesses.
- **No silent rule changes.** Structural tasks (M1, M5, M7, M11, M12) change no behaviour. Their review diff reads as moves and renames.
- **One executor commits shared state.** No view or controller writes session state. Every save goes through the runtime's executor.
- **Views render.** Controllers hold logic. After W6 no view imports an engine function that decides anything.
- **Tests.** Prototype mode applies: add a test where a rule is unclear enough that a test settles it. Each C2 divergence gets one, and C1 gets one. `src/runtime/` and `src/services/` changes add a direct test for every invariant they set. PIXI code gets no tests.
- **House style.** Comments explain only a non-obvious why. Font sizes use the `--type-*` steps. Nothing uses uppercase transforms or letter-spacing. Shortcuts carry `// proto:`.
- **Saved data.** Every change to a saved shape adds a migration step, and no save is dropped. W1 makes an unreadable save refuse writes, so the schema bumps in W4 and W5 cannot erase data.

## Judgment calls

- **One branch.** All waves land on `c2-remediation`, and executors commit freely there. `master` changes only when the user merges.
- **Branded IDs deferred.** The branded-ID half of m4 is deferred. It touches almost every file for little gain in prototype mode. The `opponent` and `SIDES` half lands in W3.
- **One easing curve.** The easing merge in m3 keeps `Token.ts`'s cubic curve, because the comments say a death plays the same way as a status.
- **`game` keeps its name.** The app store named `game` (tsconfig nit) stays. A per-adapter tsconfig already stops a leaked Foundry global from compiling.
- **The per-adapter tsconfig exists.** W7.7 added it: `tsconfig.json` loads no Foundry types, and `tsconfig.foundry.json` checks the Foundry, pf2e and ReignMaker adapters and the tests that import them.

## Waves

Model and agent entries are defaults; the overseer may raise them. Files name each lane's
territory; lanes in one stage own disjoint files.

### W1 — Live bugs

One stage.

| Task | Lane | Findings | Files | Model | Agent |
| --- | --- | --- | --- | --- | --- |
| W1.1 Safe stores and one archive | A | C1, M10 | `src/adapters/browser/*`, `src/adapters/foundry/{worldArchive,worldSessionRepository,worldSites,host,index}.ts`, new `src/adapters/json-store.ts`, tests | Opus | wave-executor |
| W1.2 Diverged engine rules | B | C2 | `src/engine/battle.ts`, engine tests | Opus | wave-executor |
| W1.3 Engine-owned charge options | B | M3 (charge) | `src/engine/battle.ts`, `src/app/battle/drag-controller.svelte.ts` | Opus | wave-executor |
| W1.4 Report status and signed stats | C | M4 (routed), nit `signed` | `src/app/BattleReport.svelte`, `src/app/TroopPicker.svelte` | Sonnet | svelte-file-editor |
| W1.5 One services session helper | D | m5 | `src/services/*`, services tests | Sonnet | wave-executor |
| W1.6 Board teardown | E | M12 (destroy) | `src/board/index.ts`, `src/board/layers/*` | Sonnet | wave-executor |

### W2 — Dead code, conventions, small duplication

One stage.

| Task | Lane | Findings | Files | Model | Agent |
| --- | --- | --- | --- | --- | --- |
| W2.1 Dead engine code | A | m1, `_rng`, nit `BANDS` | `src/engine/*`, `src/runtime/session.ts` (legacy read only), `src/app/battle/BattlePins.svelte` | Sonnet | wave-executor |
| W2.2 Engine utilities | A | m6 | `src/engine/*` | Sonnet | wave-executor |
| W2.3 One connectivity rule | A | m7 | `src/engine/{board,connectivity}.ts`, `src/app/ConnectionWarning.svelte` | Opus | wave-executor |
| W2.4 Dead board surface and conventions | B | m2, board conventions, nits (zoom, flood fill, cliff) | `src/board/**`, board tests | Sonnet | wave-executor |
| W2.5 App leftovers | C | nit `signed` sweep, unused import, m14, `--danger` | `src/app/{Place,App,SaveLoadPanel}.svelte`, `src/app/battle/{drag,ring}-controller.svelte.ts`, `src/app/battle/UnitSheet.svelte`, `src/app/presentation.ts` | Sonnet | svelte-file-editor |
| W2.6 Foundry adapter duplication | D | foundry nits | `src/adapters/{foundry,reignmaker}/*` | Sonnet | wave-executor |

### W3 — Shared primitives

One stage.

| Task | Lane | Findings | Files | Model | Agent |
| --- | --- | --- | --- | --- | --- |
| W3.1 `opponent` and one `SIDES` | A | m4 (sides) | every site of the side flip and `SIDES` outside `src/board` | Sonnet | recipe-sweeper |
| W3.3 Rooted resists ability push | A | C2 (rooted) | `src/engine/**`, `public/rules.html`, engine tests | Sonnet | wave-executor |
| W3.4 One connectivity rule, if W2.3 did not land | A | m7 | `src/engine/{board,connectivity}.ts`, `src/app/ConnectionWarning.svelte`, `public/rules.html` | Opus | wave-executor |
| W3.2 Hash, PRNG, colour and easing helpers | B | m3 | `src/engine/rng.ts`, `src/board/**`, `src/app/LchColour.svelte` | Sonnet | wave-executor |

### W4 — Engine structure and the migration seam

One stage, one lane.

| Task | Lane | Findings | Files | Model | Agent |
| --- | --- | --- | --- | --- | --- |
| W4.1 Split `battle.ts` | A | M1 | `src/engine/**` | Opus | wave-executor |
| W4.2 Migration seam and schema 2 | A | M8 | `src/engine/**`, `src/runtime/{session,migrate}.ts`, runtime tests | Opus | wave-executor |

### W5 — Engine types

One stage, one lane.

| Task | Lane | Findings | Files | Model | Agent |
| --- | --- | --- | --- | --- | --- |
| W5.1 Condition record | A | M2 | `src/engine/**`, `src/runtime/migrate.ts`, `src/app/status-effects.ts`, `src/app/HealingChoices.svelte` | Opus | wave-executor |
| W5.2 Typed target refs | A | M9 | `src/engine/**`, `src/app/targeting.ts`, `src/app/battle/picker-controller.svelte.ts`, `src/board/layers/*`, `src/runtime/{commands,migrate}.ts` | Opus | wave-executor |

### W6 — Engine answers, thin views

Two stages.

| Task | Stage | Lane | Findings | Files | Model | Agent |
| --- | --- | --- | --- | --- | --- | --- |
| W6.1 Engine answers | 1 | A | M3, M4 (engine side) | `src/engine/**`, engine tests | Opus | wave-executor |
| W6.2 Controllers consume answers | 2 | A | M3, M4 (battle views) | `src/app/battle/**` | Opus | svelte-file-editor |
| W6.3 Report and healing controllers | 2 | B | M4 (report) | `src/app/BattleReport.svelte`, `src/app/HealingChoices.svelte`, new `src/app/battle-report.svelte.ts` | Opus | svelte-file-editor |

W6.1 covers these engine answers:
- `activation()` returns every verb, each with a legal flag and a reason.
- New exports: `recoveryModifier`, `canRecover`, `healableConditions`, `healSlots` and a unit status label.
- A status line built from `statusEffectsOf`.

### W7 — Runtime and services

One stage.

| Task | Lane | Findings | Files | Model | Agent |
| --- | --- | --- | --- | --- | --- |
| W7.1 Command descriptors | A | M5 | `src/runtime/{commands,policy,executeCommand}.ts`, runtime tests | Opus | wave-executor |
| W7.2 Lifecycle into BattleManager | A | M6 | `src/runtime/executeCommand.ts`, `src/services/{BattleManager,ArmyPreparationService}.ts`, tests | Opus | wave-executor |
| W7.3 Break import cycles | A | m8 | `src/runtime/**`, `src/services/**`, `src/board/layers/CombatTextLayer.ts` | Opus | wave-executor |
| W7.4 Seed and ID port | A | m10 | `src/runtime/**`, `src/services/**`, `src/adapters/*/` port bindings, tests | Opus | wave-executor |
| W7.5 One begin command | A | m11 | `src/runtime/commands.ts`, `src/services/BattleManager.ts`, `src/app/navigation.svelte.ts`, tests | Sonnet | wave-executor |
| W7.6 Listener guard and minted IDs | A | m9 (executor), m12 (runtime side) | `src/runtime/{executeCommand,commands}.ts`, tests | Opus | wave-executor |
| W7.7 Host binding and adapter errors | B | m9 (foundry), m13, nit tsconfig | `src/app/{game.svelte,main,launch}.ts`, `src/adapters/foundry/{index,tableCall,host}.ts`, `tsconfig*.json` | Opus | wave-executor |

### W8 — App structure

One stage.

| Task | Lane | Findings | Files | Model | Agent |
| --- | --- | --- | --- | --- | --- |
| W8.1 Controllers without the facade | A | M7 | `src/app/battle/**`, `src/app/Battle.svelte` | Opus | svelte-file-editor |
| W8.2 Place controller | B | m12 | `src/app/Place.svelte`, new `src/app/place-controller.svelte.ts` | Opus | svelte-file-editor |
| W8.3 Shared chrome and token builders | B | M13 | `src/app/*.svelte` outside `battle/`, `src/app/presentation.ts`, new shared components | Opus | svelte-file-editor |
| W8.4 Colour, shadow and scrim tokens | B | m15 | `src/app/app.css`, `src/app/**/*.svelte` | Sonnet | svelte-file-editor |

### W9 — Board structure

One stage, one lane.

| Task | Lane | Findings | Files | Model | Agent |
| --- | --- | --- | --- | --- | --- |
| W9.1 Board layer contract | A | M12 | `src/board/index.ts`, `src/board/layers/*` | Opus | wave-executor |
| W9.2 Token parts and presenter flags | A | M11, nit Token routed, `chipBounds` | `src/board/{Token,layers/TokenLayer,layers/FallenLayer}.ts`, new `src/board/token/*`, `src/app/presentation.ts` | Opus | wave-executor |

### W10 — Recovery from an unreadable save

Not an audit finding: the user asked for it on 2026-09-26, after W1 made unreadable saves refuse writes.

| Task | Lane | Findings | Files | Model | Agent |
| --- | --- | --- | --- | --- | --- |
| W10.1 Export and reset an unreadable save | A | todos: unreadable save recovery | `src/adapters/**`, `src/app/**` (notice and its controller), `src/runtime/ports.ts`, tests | Opus | svelte-file-editor |

### W11 — The user's answers to the open questions

Written 2026-09-26 from the user's answers (`###` lines) and the "W11 decisions" in the todos file.
Two stages: the fixes, then a live check in Foundry through the Playwright harness.

| Task | Stage | Lane | Source | Model | Agent |
| --- | --- | --- | --- | --- | --- |
| W11.1 Rooted resists an Overrun push | 1 | A | W11 decisions | Sonnet | wave-executor |
| W11.2 One source for flight | 1 | A | W5 answer | Opus | wave-executor |
| W11.3 Reachable activities only; waypoints in melee answers | 1 | A | W6 answer | Opus | wave-executor |
| W11.4 UnitSheet controller | 1 | A | W6 question answer | Opus | svelte-file-editor |
| W11.5 Connectivity warning on every map; one Generate button | 1 | B | W2 answer | Opus | svelte-file-editor |
| W11.6 Store edge cases, simplest fix | 1 | C | W1, W4, W10 answers | Sonnet | wave-executor |
| W11.7 Runtime cleanup and browser resume stage | 1 | C | W7 items and decision | Opus | wave-executor |
| W11.8 Recovery notice cleanup | 1 | C | W10 items | Sonnet | wave-executor |
| W11.9 App chrome cleanup | 1 | D | W8 items | Sonnet | svelte-file-editor |
| W11.10 Board cleanup | 1 | D | W9 items | Sonnet | wave-executor |
| W11.11 Consistent imports and names | 1 | E | W4 answer | Sonnet | wave-executor |
| W11.12 Live check in Foundry | 2 | A | every live-check item | Opus | wave-executor |
