// Fetches pf2e-trooper's `*_strategy.webp` game-piece art into public/art/{troops,engines}/ and
// writes src/engine/art.ts mapping card name -> path. pf2e-trooper is Mark's own repo (MIT code
// licence; the art in assets/ is his own generated work), so the fetched files are committed.
// Usage: node scripts/import-art.mjs
//   PF2E_SOURCE=/path/to/pf2e/packs/pf2e        (default: sibling pf2e-reignmaker checkout, same
//                                                 default as scripts/import-official.mjs)
//   REIGNMAKER_SOURCE=/path/to/pf2e-reignmaker  (default: sibling checkout) for the two generic
//                                                fallback tokens
//   FORCE=1  re-download files that already exist under public/art/
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const RAW = 'https://raw.githubusercontent.com/rune-goblin/pf2e-trooper/main';
const PF2E_SOURCE = process.env.PF2E_SOURCE ?? join(import.meta.dirname, '../../pf2e-reignmaker/_pf2e-source/packs/pf2e');
const REIGNMAKER_SOURCE = process.env.REIGNMAKER_SOURCE ?? join(import.meta.dirname, '../../pf2e-reignmaker');
const FORCE = process.env.FORCE === '1';

const troopsOut = new URL('../public/art/troops/', import.meta.url);
const enginesOut = new URL('../public/art/engines/', import.meta.url);
mkdirSync(troopsOut, { recursive: true });
mkdirSync(enginesOut, { recursive: true });

const slugify = (s) => s.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// A small concurrency pool: 136 files over the sequential-fetch default would take minutes.
async function pool(items, size, worker) {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  }));
}

async function download(url, destPath) {
  if (!FORCE && existsSync(destPath) && readFileSync(destPath).length > 0) return 'cached';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
  return 'fetched';
}

// --- Custom troops (data/troops/*.json) --------------------------------------------------
// Each actor already carries the exact pf2e-trooper path it was captured from, so no slug
// guessing is needed.
const troopsDir = new URL('../data/troops/', import.meta.url);
const customTroops = readdirSync(troopsDir).filter((f) => f.endsWith('.json')).sort().map((f) => {
  const d = JSON.parse(readFileSync(join(troopsDir.pathname, f), 'utf8'));
  const image = d.flags?.['pf2e-reignmaker']?.creatureData?.strategyTokenImage;
  if (!image?.startsWith('modules/pf2e-trooper/')) throw new Error(`${f}: no pf2e-trooper strategyTokenImage`);
  const srcPath = image.slice('modules/pf2e-trooper/'.length);
  return { name: d.name, srcPath, destFile: srcPath.split('/').pop() };
});

// --- Official troops (scripts/import-official.mjs's SELECTION list) ----------------------
// Read as source text rather than imported/executed: importing would run the whole regeneration
// (and its PF2E_SOURCE requirement) as a side effect just to read one array literal.
const officialSrc = readFileSync(new URL('./import-official.mjs', import.meta.url), 'utf8');
const selectionBlock = officialSrc.match(/const SELECTION = \[([\s\S]*?)\n\];/)?.[1] ?? '';
const officialPaths = [...selectionBlock.matchAll(/\['([^']+)',\s*'\w+'\]/g)].map((m) => m[1]);
if (officialPaths.length === 0) throw new Error('could not parse SELECTION from import-official.mjs');

const officialTroops = officialPaths.map((path) => {
  const slug = path.split('/').pop();
  const jsonPath = join(PF2E_SOURCE, `${path}.json`);
  if (!existsSync(jsonPath)) {
    throw new Error(`${jsonPath}: not found (set PF2E_SOURCE to a pf2e system checkout with packs/pf2e)`);
  }
  const d = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const destFile = `${slug}_strategy.webp`;
  return { name: d.name, srcPath: `assets/troops/official/${slug}/${destFile}`, destFile };
});

// --- Siege engines (src/engine/engines.ts) ------------------------------------------------
const enginesSrc = readFileSync(new URL('../src/engine/engines.ts', import.meta.url), 'utf8');
const engineNames = [...enginesSrc.matchAll(/name: "([^"]*)"/g)].map((m) => m[1]);
if (engineNames.length === 0) throw new Error('could not parse engine names from src/engine/engines.ts');
const engines = engineNames.map((name) => {
  const slug = slugify(name);
  return { name, srcPath: `assets/siege-engines/${slug}.webp`, destFile: `${slug}.webp` };
});

const troopFetches = [...customTroops, ...officialTroops];
let fetched = 0, cached = 0;
await pool(troopFetches, 8, async (t) => {
  const result = await download(`${RAW}/${t.srcPath}`, join(troopsOut.pathname, t.destFile));
  result === 'fetched' ? fetched++ : cached++;
});
await pool(engines, 8, async (e) => {
  const result = await download(`${RAW}/${e.srcPath}`, join(enginesOut.pathname, e.destFile));
  result === 'fetched' ? fetched++ : cached++;
});
console.log(`troops+engines art: ${fetched} fetched, ${cached} already present`);

// --- Generic role fallback (Reignmaker's own army tokens; same author, same licence) -----
// Source file is "army-calvary.webp" (Reignmaker's misspelling of "cavalry") — copied here
// under the corrected name so nothing downstream has to know about the typo.
const fallbackOut = new URL('../public/art/', import.meta.url);
const fallbackSrc = {
  infantry: join(REIGNMAKER_SOURCE, 'img/army_tokens/army-infantry.webp'),
  cavalry: join(REIGNMAKER_SOURCE, 'img/army_tokens/army-calvary.webp'),
};
for (const [role, src] of Object.entries(fallbackSrc)) {
  if (!existsSync(src)) throw new Error(`${src}: not found (set REIGNMAKER_SOURCE to a pf2e-reignmaker checkout)`);
  copyFileSync(src, join(fallbackOut.pathname, `army-${role}.webp`));
}
console.log('fallback art: 2 copied (army-infantry.webp, army-cavalry.webp)');

// --- src/engine/art.ts ---------------------------------------------------------------------
const entry = (name, destFile, dir) => `  ${JSON.stringify(name)}: ${JSON.stringify(`art/${dir}/${destFile}`)},`;
const troopBody = [...customTroops, ...officialTroops].map((t) => entry(t.name, t.destFile, 'troops')).join('\n');
const engineBody = engines.map((e) => entry(e.name, e.destFile, 'engines')).join('\n');

writeFileSync(new URL('../src/engine/art.ts', import.meta.url),
`import type { Role } from './cards.js';

// Generated by scripts/import-art.mjs from data/troops/*.json, scripts/import-official.mjs's
// SELECTION list, and src/engine/engines.ts. Edit those, not this file.
//
// Paths are root-relative without a leading slash ("art/troops/...") so a consumer under a
// non-root Vite base can prefix with import.meta.env.BASE_URL; this module stays free of Vite
// types so it type-checks under tsconfig.engine.json.

const TROOP_ART: Record<string, string> = {
${troopBody}
};

const ENGINE_ART: Record<string, string> = {
${engineBody}
};

// Reignmaker's generic army tokens, for custom cards (e.g. src/engine/roster.ts) with no
// pf2e-trooper art of their own.
export const FALLBACK_ART: Record<Role, string> = {
  infantry: 'art/army-infantry.webp',
  cavalry: 'art/army-cavalry.webp',
};

export function troopArt(name: string, role: Role): string {
  return TROOP_ART[name] ?? FALLBACK_ART[role];
}

export function engineArt(name: string): string | null {
  return ENGINE_ART[name] ?? null;
}
`);
console.log(`src/engine/art.ts written: ${troopFetches.length} troops, ${engines.length} engines`);
