export const meta = {
  name: 'c2-remediation-all',
  description: 'Run c2-remediation waves in order, one after another, stopping at the first wave that halts',
  whenToUse: 'args: { from: "W2", to: "W9" }. Unattended runs of docs/plans/c2-remediation.md.',
  phases: [{ title: 'Waves', detail: 'one c2-remediation run per wave' }],
}

const ORDER = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9']
const WAVE_SCRIPT = '/Users/mark/Documents/repos/battlefield/.claude/workflows/c2-remediation.js'
const from = ORDER.indexOf((args && args.from) || 'W1')
const to = ORDER.indexOf((args && args.to) || 'W9')
if (from < 0 || to < from) throw new Error(`bad range ${JSON.stringify(args)}`)

phase('Waves')
const runs = []
for (const wave of ORDER.slice(from, to + 1)) {
  log(`${wave}: starting`)
  let r
  try {
    r = await workflow({ scriptPath: WAVE_SCRIPT }, { wave })
  } catch (e) {
    r = { wave, halted: `wave run threw: ${e && e.message ? e.message : e}` }
  }
  runs.push(r)
  // A halted wave leaves the branch failing its gate or half-merged; later waves would build on that.
  if (!r || r.halted) {
    log(`${wave}: halted — ${r ? r.halted : 'no result'}; stopping`)
    break
  }
  const open = (r.tasks || []).filter((x) => x.outcome !== 'done' && x.outcome !== 'skipped').map((x) => `${x.id} ${x.outcome}`)
  log(`${wave}: gate passed${open.length ? `; not done: ${open.join(', ')}` : ''}`)
}
return runs
