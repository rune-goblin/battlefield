export const meta = {
  name: 'service-architecture',
  description: 'Run one phase of docs/service-architecture-plan.md: execute, gate and review each wave in order, escalating models on failure',
  whenToUse: "Pass the phase number (0-5) as args, or {phase, startAt}. Stops at the phase's human gate.",
  phases: [
    { title: 'Preflight', detail: 'clean tree, branch, ledger' },
    { title: 'Execute', detail: "wave-executor at the wave's model" },
    { title: 'Gate', detail: 'test-verifier runs the standard gate and the Done greps' },
    { title: 'Review', detail: 'wave-reviewer checks the diff against the invariants' },
    { title: 'Ledger', detail: 'record the wave in the todos file' },
  ],
}

const PLAN = 'docs/service-architecture-plan.md'
const TODOS = 'docs/plans/service-architecture.todos.md'
const BRANCH = 'service-architecture'
const LADDER = ['sonnet', 'opus', 'fable']
const MAX_CONTINUATIONS = 2

// `contract` marks the plan's dagger waves: they escalate from Opus on the first BLOCK.
const WAVES = [
  { id: '0.1', model: 'sonnet' },
  { id: '0.2', model: 'opus' },
  { id: '1.1', model: 'opus', contract: true },
  { id: '1.2', model: 'opus', contract: true },
  { id: '1.3', model: 'sonnet', census: true },
  { id: '1.4', model: 'opus' },
  { id: '2.1', model: 'sonnet' },
  { id: '2.2', model: 'opus', contract: true },
  { id: '2.3', model: 'opus' },
  { id: '2.4', model: 'opus' },
  { id: '2.5', model: 'opus' },
  { id: '2.6', model: 'sonnet' },
  { id: '3.1', model: 'opus', contract: true },
  { id: '3.2', model: 'opus' },
  { id: '3.3', model: 'opus', contract: true },
  { id: '3.4', model: 'opus' },
  { id: '3.5', model: 'opus' },
  { id: '3.6', model: 'sonnet' },
  { id: '3.7', model: 'sonnet' },
  { id: '4.1', model: 'sonnet' },
  { id: '4.2', model: 'opus', contract: true },
  { id: '4.3', model: 'sonnet' },
  { id: '4.4', model: 'opus' },
  { id: '5.1', model: 'opus' },
  { id: '5.2', model: 'opus' },
  { id: '5.3', mark: true },
  { id: '5.4', model: 'opus' },
  { id: '5.5', model: 'opus', contract: true },
]

const PREFLIGHT_SCHEMA = {
  type: 'object',
  required: ['ok', 'reason', 'doneWaves'],
  properties: {
    ok: { type: 'boolean' },
    reason: { type: 'string' },
    doneWaves: { type: 'array', items: { type: 'string' } },
  },
}

const EXECUTOR_SCHEMA = {
  type: 'object',
  required: ['complete', 'resumePoint', 'units', 'gateStatus', 'oddities', 'reservedCalls', 'contractCannotHold', 'contractDetail', 'svelteFiles'],
  properties: {
    complete: { type: 'boolean' },
    resumePoint: { type: 'string' },
    units: { type: 'array', items: { type: 'object', required: ['hash', 'subject'], properties: { hash: { type: 'string' }, subject: { type: 'string' } } } },
    gateStatus: { type: 'string' },
    oddities: { type: 'array', items: { type: 'string' } },
    reservedCalls: { type: 'array', items: { type: 'string' } },
    contractCannotHold: { type: 'boolean' },
    contractDetail: { type: 'string' },
    svelteFiles: { type: 'array', items: { type: 'string' } },
  },
}

const GATE_SCHEMA = {
  type: 'object',
  required: ['passed', 'decisiveOutput'],
  properties: { passed: { type: 'boolean' }, decisiveOutput: { type: 'string' } },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict', 'findings', 'minimalFix'],
  properties: {
    verdict: { type: 'string', enum: ['APPROVE', 'BLOCK'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'location', 'invariant', 'summary'],
        properties: { severity: { type: 'string' }, location: { type: 'string' }, invariant: { type: 'string' }, summary: { type: 'string' } },
      },
    },
    minimalFix: { type: 'string' },
  },
}

const COUNT_SCHEMA = {
  type: 'object',
  required: ['table'],
  properties: { table: { type: 'string' } },
}

const DONE_SCHEMA = {
  type: 'object',
  required: ['done', 'detail'],
  properties: { done: { type: 'boolean' }, detail: { type: 'string' } },
}

const request = typeof args === 'object' && args !== null ? args : { phase: args }
const phaseNumber = Number(request.phase)
if (!Number.isInteger(phaseNumber) || phaseNumber < 0 || phaseNumber > 5) {
  return { stopped: { wave: null, reason: 'Pass the phase number 0-5 as args, or {phase, startAt}.' } }
}
const inPhase = WAVES.filter((w) => w.id.startsWith(`${phaseNumber}.`))
const startIndex = request.startAt ? inPhase.findIndex((w) => w.id === String(request.startAt)) : 0
if (startIndex < 0) return { stopped: { wave: null, reason: `Wave ${request.startAt} is not in phase ${phaseNumber}.` } }

phase('Preflight')
const preflight = await agent(
  `Prepare the repository for phase ${phaseNumber} of ${PLAN}. Edit no source files.
1. Run \`git status --porcelain\`. Any output means another session has uncommitted work: report ok=false with that output as the reason and stop.
2. Check out the \`${BRANCH}\` branch, creating it from \`master\` if it does not exist.
3. Read the "Ledger" section of ${TODOS} and list in doneWaves every wave ID whose ledger line says APPROVE.
${phaseNumber === 1 ? '4. Phase 1 requires Mark\'s CLAUDE.md amendment first. If CLAUDE.md does not mention `src/runtime`, report ok=false with the reason "CLAUDE.md amendment pending: add src/services, src/runtime and src/adapters to the layout section and exempt src/runtime and src/services from prototype mode, with Mark\'s approval".' : ''}
Report ok=true with an empty reason when the branch is checked out and clean.`,
  { label: 'preflight', phase: 'Preflight', model: 'sonnet', effort: 'low', schema: PREFLIGHT_SCHEMA },
)
if (!preflight || !preflight.ok) {
  return { phase: phaseNumber, completed: [], stopped: { wave: null, reason: preflight ? preflight.reason : 'preflight agent returned nothing' } }
}

const describeFailure = (failure) => `${failure.kind}: ${failure.detail}`

async function execute(wave, model, attemptNumber, lastFailure, censusTable) {
  const retry = lastFailure
    ? `\nThis is attempt ${attemptNumber}, on ${model}. The previous attempt failed — ${describeFailure(lastFailure)}\nThe wave's commits so far are listed by \`git log --grep '^Arch ${wave.id}:'\`. Read their diff, keep what is sound, and fix within the wave's scope.`
    : ''
  const counts = censusTable ? `\nMeasured call sites for this wave:\n${censusTable}` : ''
  let report = null
  let resume = ''
  for (let pass = 0; pass <= MAX_CONTINUATIONS; pass++) {
    report = await agent(
      `Execute Wave ${wave.id} of ${PLAN} on the \`${BRANCH}\` branch. Follow the plan's "Executor reading list" and "Wave procedure". Commit subjects start \`Arch ${wave.id}:\`. Run the standard gate and the wave's Done checks before you report.${counts}${retry}${resume}
In your report: set contractCannotHold=true, with the reason in contractDetail, only when a contract this plan names cannot hold as written; list every .svelte file you touched in svelteFiles; list under reservedCalls each call the plan reserves for review that you flagged.`,
      { label: `execute ${wave.id} (${model}, attempt ${attemptNumber}${pass ? `, pass ${pass + 1}` : ''})`, phase: 'Execute', agentType: 'wave-executor', model, schema: EXECUTOR_SCHEMA },
    )
    if (!report || report.complete || report.contractCannotHold) break
    resume = `\nA previous pass stopped incomplete. Resume at: ${report.resumePoint}`
  }
  return report
}

async function attempt(wave, model, attemptNumber, lastFailure, censusTable) {
  const report = await execute(wave, model, attemptNumber, lastFailure, censusTable)
  const record = { model, attempt: attemptNumber, units: report ? report.units : [], outcome: '' }
  const fail = (kind, detail) => {
    record.outcome = `${kind}`
    return { ok: false, record, report, failure: { kind, detail } }
  }
  if (!report) return fail('executor', 'the executor returned no report')
  if (report.contractCannotHold) return fail('contract', report.contractDetail)
  if (!report.complete) return fail('executor', `still incomplete after ${MAX_CONTINUATIONS + 1} passes; resume point: ${report.resumePoint}`)

  if (report.svelteFiles.length) {
    await agent(
      `Run each of these components through the Svelte MCP \`svelte-autofixer\` and apply only the fixes it reports: ${report.svelteFiles.join(', ')}. Change no behavior. If you edit anything, commit once with the subject \`Arch ${wave.id}: svelte autofix\`. Reply with the files you changed, or "none".`,
      { label: `svelte autofix ${wave.id} (attempt ${attemptNumber})`, phase: 'Execute', agentType: 'svelte:svelte-file-editor' },
    )
  }

  const gate = await agent(
    `Gate for Wave ${wave.id} of ${PLAN}, attempt ${attemptNumber}. Run \`npx vitest run\`, \`npm run check\`, and \`npx vite build\`${wave.id === '0.1' ? '' : ', and `npm run build:foundry`'}. Then read the wave's section in the plan and run each check on its **Done** line. passed is true only when every command and every Done check succeeds; the known TextureLab \`state_referenced_locally\` warning is not a failure. Put the decisive failing output in decisiveOutput, or an empty string.`,
    { label: `gate ${wave.id} (attempt ${attemptNumber})`, phase: 'Gate', agentType: 'test-verifier', schema: GATE_SCHEMA },
  )
  if (!gate) return fail('gate', 'the gate agent returned nothing')
  if (!gate.passed) return fail('gate', gate.decisiveOutput)

  const review = await agent(
    `Review Wave ${wave.id} of ${PLAN}, attempt ${attemptNumber}. Derive the diff from \`git log --grep '^Arch ${wave.id}:'\`. Check every item under the plan's "Invariants", the wave's own tasks and tests, and the calls under "Reserved for review", which the executor must flag and leave open.`,
    { label: `review ${wave.id} (attempt ${attemptNumber})`, phase: 'Review', agentType: 'wave-reviewer', schema: REVIEW_SCHEMA },
  )
  if (!review) return fail('block', 'the reviewer returned nothing')
  if (review.verdict === 'BLOCK') {
    const findings = review.findings.map((f) => `[${f.severity}] ${f.location} (${f.invariant}): ${f.summary}`).join('\n')
    return fail('block', `${findings}\nMinimal fix: ${review.minimalFix}`)
  }
  record.outcome = 'APPROVE'
  return { ok: true, record, report, failure: null }
}

function failureLimit(model, wave, kind) {
  if (model === 'opus') return wave.contract && kind === 'block' ? 1 : 2
  return 1
}

async function runWave(wave) {
  let censusTable = ''
  if (wave.census) {
    const counted = await agent(
      `For Wave ${wave.id} of ${PLAN}: read the wave's section, then count the call sites it asks for across src/ and src/tests, by file. Return one compact table.`,
      { label: `census ${wave.id}`, phase: 'Execute', agentType: 'census', schema: COUNT_SCHEMA },
    )
    censusTable = counted ? counted.table : ''
  }
  const attempts = []
  const escalations = []
  let tier = LADDER.indexOf(wave.model)
  let failuresAtTier = 0
  let lastFailure = null
  let lastReport = null
  while (true) {
    const model = LADDER[tier]
    const result = await attempt(wave, model, attempts.length + 1, lastFailure, censusTable)
    attempts.push(result.record)
    lastReport = result.report || lastReport
    if (result.ok) return { wave: wave.id, approved: true, attempts, escalations, report: lastReport, failure: null }
    lastFailure = result.failure
    failuresAtTier++
    log(`Wave ${wave.id} on ${model}: ${result.failure.kind}`)
    const exhausted = result.failure.kind === 'contract' || failuresAtTier >= failureLimit(model, wave, result.failure.kind)
    if (!exhausted) continue
    if (model === 'fable') return { wave: wave.id, approved: false, attempts, escalations, report: lastReport, failure: lastFailure }
    tier++
    failuresAtTier = 0
    escalations.push(`${model} → ${LADDER[tier]}: ${result.failure.kind}`)
    log(`Wave ${wave.id} escalates to ${LADDER[tier]}`)
  }
}

async function recordLedger(outcome) {
  const commits = outcome.attempts.flatMap((a) => a.units.map((u) => u.hash)).join(', ') || 'none'
  const models = outcome.attempts.map((a) => `${a.model} (${a.outcome})`).join(', ')
  const reserved = outcome.report ? outcome.report.reservedCalls : []
  const oddities = outcome.report ? outcome.report.oddities : []
  await agent(
    `Record Wave ${outcome.wave} in ${TODOS} on the \`${BRANCH}\` branch.
1. Append one line under "## Ledger": today's date from \`date +%F\`, wave ${outcome.wave}, attempts: ${models}; commits: ${commits}; verdict: ${outcome.approved ? 'APPROVE' : `STOPPED — ${outcome.failure.kind}`}; escalations: ${outcome.escalations.join('; ') || 'none'}.
2. Under "## Open, for Mark", add each of these that the section does not already hold, one bullet each with a trailing "**Decision:**": ${JSON.stringify(reserved)}
3. If this list is not empty, add each item as a dated bullet under a "## Oddities" section, creating it above the ledger if needed: ${JSON.stringify(oddities)}
Commit once with the subject \`Arch ${outcome.wave}: ledger\`. Edit no other file.`,
    { label: `ledger ${outcome.wave}`, phase: 'Ledger', model: 'sonnet', effort: 'low' },
  )
}

const completed = []
const skipped = []
const reservedCalls = []
let stopped = null

for (const wave of inPhase.slice(startIndex)) {
  if (preflight.doneWaves.includes(wave.id)) { skipped.push(wave.id); continue }
  if (wave.mark) {
    const check = await agent(
      `Wave ${wave.id} of ${PLAN} is Mark's work in another repository. Read the wave's section, then check whether it is done: look for the API it names in /Users/mark/Documents/repos/pf2e-reignmaker/src. Read only. Report done and one line of evidence.`,
      { label: `check ${wave.id}`, phase: 'Preflight', model: 'sonnet', effort: 'low', schema: DONE_SCHEMA },
    )
    if (check && check.done) { skipped.push(wave.id); continue }
    stopped = { wave: wave.id, reason: `Wave ${wave.id} is Mark's work in the ReignMaker repository. ${check ? check.detail : ''}` }
    break
  }
  const outcome = await runWave(wave)
  await recordLedger(outcome)
  if (outcome.report) reservedCalls.push(...outcome.report.reservedCalls)
  if (!outcome.approved) {
    stopped = { wave: wave.id, reason: `Fable could not pass the wave — ${describeFailure(outcome.failure)}` }
    break
  }
  completed.push({ wave: wave.id, attempts: outcome.attempts.map((a) => `${a.model}: ${a.outcome}`), escalations: outcome.escalations })
}

return {
  phase: phaseNumber,
  branch: BRANCH,
  completed,
  skipped,
  stopped,
  reservedCalls,
  next: stopped ? 'Report the stop to Mark.' : `Every wave in phase ${phaseNumber} is approved. Mark plays "Human gate ${phaseNumber}" in ${PLAN}, rules on the open calls in ${TODOS}, and merges \`${BRANCH}\` on his word.`,
}
