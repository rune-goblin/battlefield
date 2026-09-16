// Compile the engine to a temporary directory, then pass that directory to this script.
// See docs/plans/morale-review.md for the model assumptions and reproduction commands.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) throw new Error('Usage: node scripts/analyze-morale.mjs <compiled-engine-directory>');
const { degreeOf, saveBonus, levelDc, deriveStats, COMBATANTS, OFFICIAL, ROSTER } =
  await import(pathToFileURL(resolve(process.argv[2], 'index.js')).href);

// Preserve the old capacity rule so the historical comparison remains reproducible.
function qualityFor(card) {
  const will = deriveStats(card).will;
  return ['low', 'moderate', 'high', 'extreme'].reduce((q, tier, i) =>
    will >= saveBonus(card.level, tier) ? i + 3 : q, 2);
}

function probabilities(modifier, dc) {
  const counts = { 'critical-failure': 0, failure: 0, success: 0, 'critical-success': 0 };
  for (let die = 1; die <= 20; die++) counts[degreeOf(die, modifier, dc)]++;
  return Object.fromEntries(Object.entries(counts).map(([degree, count]) => [degree, count / 20]));
}

// Independent Dread exposures, with temporary conditions cleared between exposures.
// Success adds 0 disorder, failure 1, critical failure 2; no recovery or damage.
// Solve E[d] = 1 + p0*E[d] + p1*E[d+1] + p2*E[d+2] backwards from rout.
function dread(will, dc, threshold, penalty = true) {
  const expected = Array(threshold + 2).fill(0);
  for (let d = threshold - 1; d >= 0; d--) {
    const p = probabilities(will - (penalty ? d : 0), dc);
    expected[d] = (1 + p.failure * expected[d + 1] + p['critical-failure'] * expected[d + 2])
      / (p.failure + p['critical-failure']);
  }
  let states = Array(threshold + 1).fill(0);
  states[0] = 1;
  const routedBy = [];
  for (let exposure = 1; exposure <= 6; exposure++) {
    const next = Array(threshold + 1).fill(0);
    next[threshold] = states[threshold];
    for (let d = 0; d < threshold; d++) {
      const p = probabilities(will - (penalty ? d : 0), dc);
      next[d] += states[d] * (p.success + p['critical-success']);
      next[Math.min(threshold, d + 1)] += states[d] * p.failure;
      next[Math.min(threshold, d + 2)] += states[d] * p['critical-failure'];
    }
    if (Math.abs(next.reduce((a, b) => a + b, 0) - 1) > 1e-10) throw new Error('Probability mass drift');
    states = next;
    routedBy.push(states[threshold]);
  }
  return { expectedChecks: expected[0], routedBy3: routedBy[2], routedBy6: routedBy[5] };
}

const level = 8, dc = levelDc(level);
const bands = [['Below low (troll)', 11], ...['low', 'moderate', 'high', 'extreme'].map(t => [t, saveBonus(level, t)])];
const comparison = bands.map(([band, will]) => {
  const quality = qualityFor({ name: band, level, role: 'infantry', overrides: { will } });
  const p = probabilities(will, dc);
  const rally = probabilities(will - 2, dc);
  return { band, will, quality, currentRout: quality + 1,
    freshSaveSuccess: p.success + p['critical-success'],
    rallyAt2: { recovery: rally.success + rally['critical-success'], worsen: rally['critical-failure'],
      expectedDisorderCleared: rally.success + 2 * rally['critical-success'] - rally['critical-failure'] },
    current: dread(will, dc, quality + 1), fixed3: dread(will, dc, 3), fixed3WithoutDisorderPenalty: dread(will, dc, 3, false) };
});
const libraries = { ReignMaker: COMBATANTS, Official: OFFICIAL, Generic: ROSTER };
const distribution = Object.fromEntries(Object.entries(libraries).map(([name, cards]) => [name, {
  total: cards.length,
  qualityCounts: Object.fromEntries([2, 3, 4, 5, 6].map(q => [q, cards.filter(c => qualityFor(c) === q).length])),
}]));
const troll = COMBATANTS.find(c => c.name === 'Troll Marauders');
const trollStats = deriveStats(troll);
const trollRally = [0, 2, 4].map(bonus => ({ extraActions: bonus / 2,
  ...probabilities(trollStats.will - 2 + bonus, dc) }));
console.log(JSON.stringify({ level, dc, comparison, distribution, troll: {
  level: troll.level, will: trollStats.will, fortitude: trollStats.fortitude, quality: qualityFor(troll),
  freshFortitudeSuccess: 1 - probabilities(trollStats.fortitude, dc).failure - probabilities(trollStats.fortitude, dc)['critical-failure'],
  rallyAt2: trollRally,
} }, null, 2));
