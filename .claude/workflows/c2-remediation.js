export const meta = {
  name: 'c2-remediation',
  description: 'Run one wave of docs/plans/c2-remediation.md: Opus overseer, Sonnet/Opus executors in lane worktrees, per-task review, Fable escalation, integrate, gate, ledger',
  whenToUse: 'args: { wave: "W1" } through "W9". One wave per run; review the c2-remediation branch between waves.',
  phases: [
    { title: 'Prepare', detail: 'clean tree on c2-remediation' },
    { title: 'Brief', detail: 'Opus overseer briefs tasks; verifier records the baseline' },
    { title: 'Setup', detail: 'lane worktrees per stage' },
    { title: 'Execute', detail: 'lanes in parallel, tasks in order, review and escalation per task' },
    { title: 'Integrate', detail: 'merge approved lane commits' },
    { title: 'Gate', detail: 'vitest, check, vite build, build:foundry; fix loop up to Fable' },
    { title: 'Ledger', detail: 'audit status tags and todos' },
  ],
}

const REPO = '/Users/mark/Documents/repos/battlefield'
const WT_ROOT = '/Users/mark/Documents/repos/battlefield-wt'
const BRANCH = 'c2-remediation'
const PLAN = 'docs/plans/c2-remediation.md'
const AUDIT = 'docs/c2-audit.md'
const TODOS = 'docs/plans/c2-remediation.todos.md'
const GATE = 'CI=1 npx vitest run && npm run check && npx vite build && npm run build:foundry'
const TRAILER = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01QTdtmu89GRBDr4uK4VUwXK'
const AGENT = { exec: 'wave-executor', svelte: 'svelte:svelte-file-editor', sweep: 'recipe-sweeper' }
const MAX_ATTEMPTS = 3

const t = (id, title, findings, files, model, agentKind) => ({ id, title, findings, files, model, agent: agentKind })

// Each wave is a list of stages; each stage a list of lanes with disjoint files; each lane runs its tasks in order.
const WAVES = {
  W1: { title: 'Live bugs', stages: [[
    { lane: 'A', tasks: [t('W1.1', 'Safe stores and one archive', 'C1, M10', 'src/adapters/browser/*, src/adapters/foundry/{worldArchive,worldSessionRepository,worldSites,host,index}.ts, new src/adapters/json-store.ts, tests', 'opus', 'exec')] },
    { lane: 'B', tasks: [
      t('W1.2', 'Diverged engine rules', 'C2', 'src/engine/battle.ts, engine tests', 'opus', 'exec'),
      t('W1.3', 'Engine-owned charge options', 'M3 (charge part only)', 'src/engine/battle.ts, src/app/battle/drag-controller.svelte.ts', 'opus', 'exec'),
    ] },
    { lane: 'C', tasks: [t('W1.4', 'Report status and signed stats', 'M4 (routed status in BattleReport only), nit TroopPicker signed', 'src/app/BattleReport.svelte, src/app/TroopPicker.svelte', 'sonnet', 'svelte')] },
    { lane: 'D', tasks: [t('W1.5', 'One services session helper', 'm5', 'src/services/*, services tests', 'sonnet', 'exec')] },
    { lane: 'E', tasks: [t('W1.6', 'Board teardown', 'M12 (destroy() gaps only)', 'src/board/index.ts, src/board/layers/*', 'sonnet', 'exec')] },
  ]] },
  W2: { title: 'Dead code, conventions, small duplication', stages: [[
    { lane: 'A', tasks: [
      t('W2.1', 'Dead engine code', 'm1, project convention _rng, nit BANDS', 'src/engine/*, src/runtime/session.ts (legacy read only), src/app/battle/BattlePins.svelte', 'sonnet', 'exec'),
      t('W2.2', 'Engine utilities', 'm6', 'src/engine/*', 'sonnet', 'exec'),
      t('W2.3', 'One connectivity rule', 'm7', 'src/engine/{board,connectivity}.ts, src/app/ConnectionWarning.svelte', 'opus', 'exec'),
    ] },
    { lane: 'B', tasks: [t('W2.4', 'Dead board surface and conventions', 'm2, board project conventions, nits (Interaction zoom, flood fill, EdgeLayer cliff)', 'src/board/**, board tests', 'sonnet', 'exec')] },
    { lane: 'C', tasks: [t('W2.5', 'App leftovers', 'nit signed sweep, nit unused import, m14, m15 (--danger only)', 'src/app/{Place,App,SaveLoadPanel}.svelte, src/app/battle/{drag,ring}-controller.svelte.ts, src/app/battle/UnitSheet.svelte, src/app/BattleReport.svelte, src/app/TroopPicker.svelte, src/app/presentation.ts', 'sonnet', 'svelte')] },
    { lane: 'D', tasks: [t('W2.6', 'Foundry adapter duplication', 'foundry nits', 'src/adapters/{foundry,reignmaker}/*', 'sonnet', 'exec')] },
  ]] },
  W3: { title: 'Shared primitives', stages: [[
    { lane: 'A', tasks: [
      t('W3.1', 'opponent and one SIDES', 'm4 (sides half; branded IDs deferred)', 'every side-flip and SIDES site outside src/board', 'sonnet', 'sweep'),
      t('W3.3', 'Rooted resists ability push', 'C2 (rooted push/pull, answered by the user in the todos file)', 'src/engine/**, public/rules.html, engine tests', 'sonnet', 'exec'),
      t('W3.4', 'One connectivity rule, if W2.3 did not land', 'm7 (rule answered by the user in the todos file; skip if the audit already marks m7 done)', 'src/engine/{board,connectivity}.ts, src/app/ConnectionWarning.svelte, public/rules.html', 'opus', 'exec'),
    ] },
    { lane: 'B', tasks: [t('W3.2', 'Hash, PRNG, colour and easing helpers', 'm3', 'src/engine/rng.ts, src/board/**, src/app/LchColour.svelte', 'sonnet', 'exec')] },
  ]] },
  W4: { title: 'Engine structure and the migration seam', stages: [[
    { lane: 'A', tasks: [
      t('W4.1', 'Split battle.ts', 'M1', 'src/engine/**', 'opus', 'exec'),
      t('W4.2', 'Migration seam and schema 2', 'M8', 'src/engine/**, src/runtime/{session,migrate}.ts, runtime tests', 'opus', 'exec'),
    ] },
  ]] },
  W5: { title: 'Engine types', stages: [[
    { lane: 'A', tasks: [
      t('W5.1', 'Condition record', 'M2', 'src/engine/**, src/runtime/migrate.ts, src/app/status-effects.ts, src/app/HealingChoices.svelte', 'opus', 'exec'),
      t('W5.2', 'Typed target refs', 'M9', 'src/engine/**, src/app/targeting.ts, src/app/battle/picker-controller.svelte.ts, src/board/layers/*, src/runtime/{commands,migrate}.ts', 'opus', 'exec'),
    ] },
  ]] },
  W6: { title: 'Engine answers, thin views', stages: [
    [{ lane: 'A', tasks: [t('W6.1', 'Engine answers', 'M3, M4 (engine side: activation verbs with legal flag and reason; recoveryModifier, canRecover, healableConditions, healSlots, unit status label; status line from statusEffectsOf)', 'src/engine/**, engine tests', 'opus', 'exec')] }],
    [
      { lane: 'A', tasks: [t('W6.2', 'Controllers consume answers', 'M3, M4 (battle views)', 'src/app/battle/**', 'opus', 'svelte')] },
      { lane: 'B', tasks: [t('W6.3', 'Report and healing controllers', 'M4 (BattleReport, HealingChoices)', 'src/app/BattleReport.svelte, src/app/HealingChoices.svelte, new src/app/battle-report.svelte.ts', 'opus', 'svelte')] },
    ],
  ] },
  W7: { title: 'Runtime and services', stages: [[
    { lane: 'A', tasks: [
      t('W7.1', 'Command descriptors', 'M5', 'src/runtime/{commands,policy,executeCommand}.ts, runtime tests', 'opus', 'exec'),
      t('W7.2', 'Lifecycle into BattleManager', 'M6', 'src/runtime/executeCommand.ts, src/services/{BattleManager,ArmyPreparationService}.ts, tests', 'opus', 'exec'),
      t('W7.3', 'Break import cycles', 'm8', 'src/runtime/**, src/services/**, src/board/layers/CombatTextLayer.ts', 'opus', 'exec'),
      t('W7.4', 'Seed and ID port', 'm10', 'src/runtime/**, src/services/**, port bindings in src/adapters, tests', 'opus', 'exec'),
      t('W7.5', 'One begin command', 'm11', 'src/runtime/commands.ts, src/services/BattleManager.ts, src/app/navigation.svelte.ts, tests', 'sonnet', 'exec'),
      t('W7.6', 'Listener guard and minted IDs', 'm9 (executor listener), m12 (CommandResult returns minted IDs)', 'src/runtime/{executeCommand,commands}.ts, tests', 'opus', 'exec'),
    ] },
    { lane: 'B', tasks: [t('W7.7', 'Host binding and adapter errors', 'm9 (foundry void promises), m13, nit tsconfig', 'src/app/{game.svelte,main,launch}.ts, src/adapters/foundry/{index,tableCall,host}.ts, tsconfig*.json', 'opus', 'exec')] },
  ]] },
  W8: { title: 'App structure', stages: [[
    { lane: 'A', tasks: [t('W8.1', 'Controllers without the facade', 'M7', 'src/app/battle/**, src/app/Battle.svelte', 'opus', 'svelte')] },
    { lane: 'B', tasks: [
      t('W8.2', 'Place controller', 'm12', 'src/app/Place.svelte, new src/app/place-controller.svelte.ts', 'opus', 'svelte'),
      t('W8.3', 'Shared chrome and token builders', 'M13', 'src/app/*.svelte outside battle/, src/app/presentation.ts, new shared components', 'opus', 'svelte'),
      t('W8.4', 'Colour, shadow and scrim tokens', 'm15', 'src/app/app.css, src/app/*.svelte outside battle/', 'sonnet', 'svelte'),
    ] },
  ]] },
  W9: { title: 'Board structure', stages: [[
    { lane: 'A', tasks: [
      t('W9.1', 'Board layer contract', 'M12', 'src/board/index.ts, src/board/layers/*', 'opus', 'exec'),
      t('W9.2', 'Token parts and presenter flags', 'M11, nit Token routed flags, TokenLayer chipBounds', 'src/board/{Token,layers/TokenLayer,layers/FallenLayer}.ts, new src/board/token/*, src/app/presentation.ts', 'opus', 'exec'),
    ] },
  ]] },
}

const BRIEFS = { type: 'object', properties: {
  tasks: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' },
    skip: { type: 'boolean', description: 'true when the finding is false or already fixed' },
    reason: { type: 'string' },
    model: { type: 'string', enum: ['sonnet', 'opus', 'fable'] },
    brief: { type: 'string', description: 'concrete call sites, the chosen design, rules answers, done-when' },
    questions: { type: 'array', items: { type: 'string' }, description: 'rules questions public/rules.html leaves open' },
  }, required: ['id', 'skip', 'model', 'brief'] } },
  notes: { type: 'string' },
}, required: ['tasks'] }
const EXEC = { type: 'object', properties: {
  status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
  commits: { type: 'array', items: { type: 'string' } },
  summary: { type: 'string' },
  oddities: { type: 'array', items: { type: 'string' } },
  needsDecision: { type: 'string' },
}, required: ['status', 'commits', 'summary'] }
const REVIEW = { type: 'object', properties: {
  verdict: { type: 'string', enum: ['APPROVE', 'BLOCK'] },
  head: { type: 'string', description: 'full sha of the lane branch HEAD you reviewed' },
  findings: { type: 'array', items: { type: 'string' } },
  minimalFix: { type: 'string' },
}, required: ['verdict', 'head', 'findings'] }
const TRIAGE = { type: 'object', properties: {
  action: { type: 'string', enum: ['retry', 'upgrade', 'escalate', 'defer'] },
  guidance: { type: 'string' },
  question: { type: 'string', description: 'for defer: the question the user must answer' },
}, required: ['action', 'guidance'] }
const OK = { type: 'object', properties: { ok: { type: 'boolean' }, detail: { type: 'string' } }, required: ['ok', 'detail'] }
const GATE_RESULT = { type: 'object', properties: {
  pass: { type: 'boolean', description: 'true when no failure is new against the baseline' },
  failures: { type: 'array', items: { type: 'object', properties: {
    check: { type: 'string' }, test: { type: 'string' }, cause: { type: 'string' }, where: { type: 'string' }, preexisting: { type: 'boolean' },
  }, required: ['check', 'cause', 'preexisting'] } },
}, required: ['pass', 'failures'] }

const waveId = typeof args === 'string' ? args : args && args.wave
const wave = WAVES[waveId]
if (!wave) throw new Error(`unknown wave ${waveId}; expected one of ${Object.keys(WAVES).join(', ')}`)
const allTasks = wave.stages.flat().flatMap((l) => l.tasks)
const laneKey = (si, lane) => `${waveId}-s${si + 1}-${lane.lane}`
const worktree = (si, lane) => `${WT_ROOT}/${laneKey(si, lane)}`
const laneBranch = (si, lane) => `c2/${laneKey(si, lane)}`
log(`${waveId} — ${wave.title}: ${allTasks.length} tasks in ${wave.stages.length} stage(s)`)

phase('Prepare')
const prep = await agent(`In ${REPO}: run \`git status --short\`. If the tree has uncommitted changes to tracked files, return ok=false listing them and change nothing.
Otherwise switch to branch \`${BRANCH}\`, creating it from \`master\` if it does not exist. Never reset, stash or discard anything. Return ok=true with the HEAD sha in detail.`,
  { label: 'prepare', phase: 'Prepare', model: 'sonnet', effort: 'low', schema: OK })
if (!prep || !prep.ok) return { wave: waveId, halted: `prepare: ${prep ? prep.detail : 'agent died'}` }

phase('Brief')
const taskList = allTasks.map((x) => `- ${x.id} ${x.title} — findings ${x.findings}; files ${x.files}; default model ${x.model}`).join('\n')
const [brief, baseline] = await parallel([
  () => agent(`You are the Opus overseer of wave ${waveId} (${wave.title}) of ${PLAN} in ${REPO}, branch ${BRANCH}.
Read the plan (protocol, invariants, judgment calls, the ${waveId} section), each task's findings in ${AUDIT}, and the current code at every cited site; earlier waves have moved lines, so find the code by content.
Tasks:
${taskList}

For each task write a brief an executor can follow cold: the exact call sites now, the design you choose where the audit leaves one open, the rules answer where one is needed, and a greppable done-when.
- Answer rules questions from public/rules.html and quote the sentence. Where the page is silent, put the question in questions; the executor will stop at that point instead of guessing. Check ${TODOS} for questions already answered.
- Set skip=true, with the reason, for a finding that is false on current code or already fixed.
- Keep the default model unless the task needs more: raise Sonnet to Opus for any judgment beyond a mechanical edit, and choose fable only for design no Opus attempt is likely to get right.
Change no files.`,
    { label: 'overseer:brief', phase: 'Brief', model: 'opus', effort: 'high', schema: BRIEFS }),
  () => agent(`Baseline for wave ${waveId}: in ${REPO} on ${BRANCH}, run \`${GATE}\` (run each command even if an earlier one fails). List every failure; mark all of them preexisting=true. pass=true when there are none.`,
    { label: 'baseline', phase: 'Brief', agentType: 'test-verifier', schema: GATE_RESULT }),
])
if (!brief) return { wave: waveId, halted: 'overseer brief failed' }
const briefOf = (id) => brief.tasks.find((b) => b.id === id)
const baselineText = baseline ? JSON.stringify(baseline.failures) : 'unknown'

function execPrompt(task, si, lane, b, guidance, attempt) {
  return `Execute task ${task.id} (${task.title}) of ${PLAN}, wave ${waveId}. Findings: ${task.findings} — read them in ${AUDIT} (${REPO}/${AUDIT}).
Work only in the worktree ${worktree(si, lane)} on branch ${laneBranch(si, lane)}: cd there first, and never edit ${REPO} itself.
Files this lane owns: ${task.files}. If the fix needs a file outside them, stop with status "blocked" and name the file.

Overseer brief:
${b.brief}
${b.questions && b.questions.length ? `Open rules questions — stop with status "blocked" at any of these rather than guess:\n${b.questions.map((q) => `- ${q}`).join('\n')}` : ''}
${guidance ? `Overseer guidance after the last attempt:\n${guidance}` : ''}
${attempt > 1 ? 'Earlier attempts left commits on this branch. Fix forward on top of them; never reset, rebase or amend.' : ''}

Rules: public/rules.html holds the rules and the engine arbitrates them; a change to a rules outcome must match the page, and where the page is silent you stop with status "blocked" and put the question in needsDecision. Structural work changes no behaviour. Follow CLAUDE.md: comments only for a non-obvious why; tests only where a rule is unclear, except src/runtime and src/services, which take a direct test per invariant; no PIXI tests.
Commit each coherent unit with a subject starting "c2(${task.id}): " and a message ending with:
${TRAILER}
Before returning run, in the worktree: \`CI=1 npx vitest run\` and \`npm run check\`. Report commits as full shas.`
}

function reviewPrompt(task, si, lane, b, ex) {
  return `Review task ${task.id} (${task.title}) of ${PLAN}, wave ${waveId}, in worktree ${worktree(si, lane)} (branch ${laneBranch(si, lane)}).
Diff scope: the commits whose subjects start "c2(${task.id}): " — \`git log --grep '^c2(${task.id})' --format=%H\`. Findings: ${task.findings} in ${REPO}/${AUDIT}. Owned files: ${task.files}.
Overseer brief:
${b.brief}
Executor's claim: ${ex.summary}

BLOCK when any of these holds:
- a finding the brief assigns is left unresolved;
- behaviour changed beyond what the finding requires, or a structural task changed any rules outcome;
- a rules outcome contradicts public/rules.html;
- a file outside the owned list was edited;
- a test was weakened or deleted to pass;
- a CLAUDE.md rule was broken (narrating comments, missing runtime/services invariant tests, uppercase or letter-spacing, font sizes off the --type-* scale).
Run \`CI=1 npx vitest run\` in the worktree yourself. Return head = \`git rev-parse HEAD\` there.`
}

async function runTask(task, si, lane) {
  const b = briefOf(task.id)
  if (!b) return { id: task.id, outcome: 'failed', reason: 'overseer wrote no brief' }
  if (b.skip) return { id: task.id, outcome: 'skipped', reason: b.reason || '' }
  let model = b.model || task.model
  let guidance = ''
  const history = []
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ex = await agent(execPrompt(task, si, lane, b, guidance, attempt),
      { label: `${task.id}#${attempt} ${model}`, phase: 'Execute', model, agentType: AGENT[task.agent], schema: EXEC })
    let rev = null
    if (ex && ex.status !== 'blocked') {
      rev = await agent(reviewPrompt(task, si, lane, b, ex),
        { label: `review ${task.id}#${attempt}`, phase: 'Execute', model: model === 'fable' ? 'fable' : 'opus', agentType: 'wave-reviewer', schema: REVIEW })
    }
    if (ex && ex.status === 'done' && rev && rev.verdict === 'APPROVE') {
      log(`${task.id} approved on attempt ${attempt} (${model})`)
      return { id: task.id, outcome: 'done', model, attempts: attempt, head: rev.head, commits: ex.commits, oddities: ex.oddities || [] }
    }
    history.push({ attempt, model, exec: ex || 'executor died', review: rev })
    if (attempt === MAX_ATTEMPTS) break
    const tri = await agent(`You are the Opus overseer of wave ${waveId}. Task ${task.id} (${task.title}, findings ${task.findings}) did not pass on attempt ${attempt} with ${model}.
Brief: ${b.brief}
History: ${JSON.stringify(history)}
Inspect worktree ${worktree(si, lane)} as needed, and public/rules.html if the executor asked a rules question. Choose:
- retry: same model, with guidance that fixes what went wrong;
- upgrade: the next model up (sonnet→opus→fable), with guidance;
- escalate: straight to fable, with guidance;
- defer: the task needs a decision only the user can make — put it in question.
${attempt + 1 === MAX_ATTEMPTS ? 'The next attempt is the last one. Choose fable unless a retry is plainly enough.' : ''}
Change no files.`,
      { label: `overseer:triage ${task.id}`, phase: 'Execute', model: 'opus', effort: 'high', schema: TRIAGE })
    if (!tri || tri.action === 'defer') {
      return { id: task.id, outcome: 'deferred', question: tri ? tri.question || tri.guidance : 'triage failed', history }
    }
    if (tri.action === 'escalate') model = 'fable'
    else if (tri.action === 'upgrade') model = model === 'sonnet' ? 'opus' : 'fable'
    guidance = tri.guidance
  }
  return { id: task.id, outcome: 'failed', history }
}

async function runLane(si, lane) {
  const done = []
  let mergeRef = null
  for (let i = 0; i < lane.tasks.length; i++) {
    const r = await runTask(lane.tasks[i], si, lane)
    done.push(r)
    if (r.outcome === 'done') mergeRef = r.head
    else if (r.outcome !== 'skipped') {
      const rest = lane.tasks.slice(i + 1).map((x) => ({ id: x.id, outcome: 'not-run', reason: `lane stopped after ${r.id} ${r.outcome}` }))
      if (rest.length) log(`lane ${laneKey(si, lane)} stopped at ${r.id}: ${rest.length} task(s) not run`)
      done.push(...rest)
      break
    }
  }
  return { lane: laneKey(si, lane), branch: laneBranch(si, lane), worktree: worktree(si, lane), mergeRef, tasks: done }
}

const results = []
let halted = null
for (let si = 0; si < wave.stages.length && !halted; si++) {
  const lanes = wave.stages[si]
  phase('Setup')
  const setup = await agent(`For wave ${waveId} stage ${si + 1}, create one git worktree per lane from ${REPO}, based on the current tip of ${BRANCH}:
${lanes.map((l) => `- ${worktree(si, l)} on new branch ${laneBranch(si, l)}`).join('\n')}
Command: \`git -C ${REPO} worktree add <path> -b <branch> ${BRANCH}\`. If a path or branch already exists from an aborted run, return ok=false naming it and change nothing.
In each worktree, symlink node_modules and any of _pf2e-source, _foundry-data and _foundry-modules that exist in ${REPO}. Return ok=true when every worktree exists.`,
    { label: `setup s${si + 1}`, phase: 'Setup', model: 'sonnet', effort: 'low', schema: OK })
  if (!setup || !setup.ok) { halted = `setup stage ${si + 1}: ${setup ? setup.detail : 'agent died'}`; break }

  phase('Execute')
  // Barrier: integration needs every lane's approved head.
  const laneResults = (await parallel(lanes.map((l) => () => runLane(si, l)))).filter(Boolean)
  results.push(...laneResults)

  phase('Integrate')
  const merges = laneResults.map((l) => `- ${l.branch}: ${l.mergeRef ? `merge commit ${l.mergeRef}` : 'nothing approved; merge nothing'} (worktree ${l.worktree})`).join('\n')
  const merged = await agent(`Integrate wave ${waveId} stage ${si + 1} into ${BRANCH}, checked out in ${REPO}.
${merges}
For each lane with a commit, run \`git merge --no-ff <sha>\` with the message "c2(${waveId}): merge <lane branch>" followed by:
${TRAILER}
Merge the named sha, never the branch tip: commits after it were not approved. Lanes own disjoint files. If a conflict appears anyway, resolve it so that both sides' intent survives, and name each resolved file in detail.
Then remove every worktree listed and delete each lane branch that is fully merged. Keep a branch that holds unapproved commits after its merge point, and name it in detail.
Run \`CI=1 npx vitest run\` in ${REPO}. Return ok=false if a merge could not complete.`,
    { label: `integrate s${si + 1}`, phase: 'Integrate', model: 'opus', agentType: 'wave-executor', schema: OK })
  if (!merged || !merged.ok) halted = `integrate stage ${si + 1}: ${merged ? merged.detail : 'agent died'}`
}

let gate = null
const fixes = []
if (!halted) {
  phase('Gate')
  const gatePrompt = `Gate for wave ${waveId}: in ${REPO} on ${BRANCH}, run \`${GATE}\` (run each command even if an earlier one fails). Baseline failures from before the wave: ${baselineText}. Mark each failure preexisting when it matches the baseline. pass=true when no failure is new.`
  gate = await agent(gatePrompt, { label: 'gate', phase: 'Gate', agentType: 'test-verifier', schema: GATE_RESULT })
  const ladder = ['opus', 'opus', 'fable']
  for (let r = 0; r < ladder.length && gate && !gate.pass; r++) {
    const fix = await agent(`The wave ${waveId} gate failed in ${REPO} on ${BRANCH}. New failures:
${JSON.stringify(gate.failures.filter((f) => !f.preexisting))}
Fix them on ${BRANCH} in ${REPO}. Stay within what wave ${waveId} changed (\`git log --grep '^c2(${waveId}'\`), and follow ${PLAN}'s invariants. A failing test that is right about the rules stays as it is: fix the code, never weaken the test.
Commit with the subject "c2(${waveId}): gate fix" and a message ending with:
${TRAILER}
Then rerun \`${GATE}\`.`,
      { label: `gate fix #${r + 1} ${ladder[r]}`, phase: 'Gate', model: ladder[r], agentType: 'wave-executor', schema: EXEC })
    fixes.push(fix)
    gate = await agent(gatePrompt, { label: `gate #${r + 2}`, phase: 'Gate', agentType: 'test-verifier', schema: GATE_RESULT })
  }
  if (!gate || !gate.pass) halted = 'gate still failing after three fix rounds'
}

phase('Ledger')
const ledger = await agent(`You are the Opus overseer closing wave ${waveId} (${wave.title}) in ${REPO} on ${BRANCH}.
Task results: ${JSON.stringify(results)}
Overseer notes: ${brief.notes || ''}
Gate: ${gate ? JSON.stringify(gate) : 'not run'}${halted ? `\nHalted: ${halted}` : ''}

1. Update ${AUDIT}. Append a status tag after the scope tag of each finding the wave touched:
   - [done]: fully fixed;
   - [partial]: some parts done, the rest deferred or planned for a later wave;
   - [skipped]: the overseer rejected it, with the reason;
   - [deferred]: waiting on a question.
   Under each touched finding, add "**Resolution (<today's date from \`date +%F\`>):** <what shipped, what remains>". Do not move any finding.
2. Update ${TODOS}:
   - remove the tasks that are done;
   - list the tasks that failed or were not run, each with its resume point;
   - add every deferred question and every open question from the briefs;
   - remove questions this wave answered.
3. Commit both files with the subject "c2(${waveId}): ledger" and a message ending with:
${TRAILER}
Return a summary for the user: tasks done or not, the model that finished each task, escalations, questions for the user, and whether the next wave may start.`,
  { label: 'overseer:ledger', phase: 'Ledger', model: 'opus', effort: 'high', agentType: 'wave-executor' })

return { wave: waveId, halted, gatePass: gate ? gate.pass : null, tasks: results.flatMap((l) => l.tasks.map((x) => ({ id: x.id, outcome: x.outcome, model: x.model, attempts: x.attempts }))), fixes: fixes.length, ledger }
