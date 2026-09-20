// Dev environment setup. Idempotent. Run with `npm run setup`.
//   1. Find the Foundry data dir — detect per-platform, else ask for the path.
//   2. Resolve the PF2e system source — detect, clone foundryvtt/pf2e, point at a checkout, or
//      skip. `src/adapters/pf2e/` reads that system's data, and its source is the reference.
//   3. Symlink the references INTO the repo (`_pf2e-source`, `_foundry-data`,
//      `_foundry-modules`), then symlink `Data/modules/battlefield` to `dist-foundry`, so
//      `npm run watch:foundry` is live in Foundry after a browser reload.
// The resolved paths cache in .dev-paths.json (gitignored) so re-runs don't re-ask.
// Flags: --reconfigure (ask again), --no-link (resolve+cache only), --yes (no prompts).
import { existsSync, symlinkSync, lstatSync, unlinkSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { MODULE_ID } from '../src/adapters/foundry/module-id.ts';

const repo = process.cwd();
const home = homedir();
const OUT_DIR = join(repo, 'dist-foundry');
const CONFIG = join(repo, '.dev-paths.json');
const PF2E_REPO = 'https://github.com/foundryvtt/pf2e.git';

const argv = new Set(process.argv.slice(2));
const reconfigure = argv.has('--reconfigure');
const noLink = argv.has('--no-link');
const interactive = Boolean(stdin.isTTY) && !argv.has('--yes');

interface DevPaths {
  foundryData?: string;
  pf2eSource?: string;
}

const rl = interactive ? createInterface({ input: stdin, output: stdout }) : null;

// Ctrl+D / closed stdin mid-prompt rejects with AbortError — treat it as "cancel", not a crash.
async function prompt(line: string): Promise<string> {
  try {
    return (await rl!.question(line)).trim();
  } catch {
    console.log('\nCancelled.');
    rl?.close();
    process.exit(0);
  }
}

async function ask(question: string, fallback = ''): Promise<string> {
  if (!rl) return fallback;
  const answer = await prompt(`${question}${fallback ? ` [${fallback}]` : ''} `);
  return answer || fallback;
}

async function confirm(question: string, def = true): Promise<boolean> {
  if (!rl) return def;
  const answer = (await prompt(`${question} [${def ? 'Y/n' : 'y/N'}] `)).toLowerCase();
  return answer ? answer.startsWith('y') : def;
}

function expand(p: string): string {
  if (p === '~') return home;
  if (p.startsWith('~/')) return join(home, p.slice(2));
  return p;
}

function readConfig(): DevPaths {
  if (!reconfigure && existsSync(CONFIG)) {
    try {
      return JSON.parse(readFileSync(CONFIG, 'utf8')) as DevPaths;
    } catch {
      /* malformed cache — start fresh */
    }
  }
  return {};
}

// Recent desktop builds version the folder (FoundryVTT-v14); older and server installs use a
// plain FoundryVTT.
function userDataDirs(): string[] {
  let base: string;
  if (process.platform === 'darwin') base = join(home, 'Library/Application Support');
  else if (process.platform === 'win32') base = process.env.LOCALAPPDATA ?? join(home, 'AppData/Local');
  else base = process.env.XDG_DATA_HOME ?? join(home, '.local/share');
  return ['FoundryVTT-v14', 'FoundryVTT'].map((n) => join(base, n));
}

// Config/options.json's `dataPath` may point elsewhere than the folder holding it.
function dataDirFor(userData: string): string | null {
  const options = join(userData, 'Config', 'options.json');
  if (existsSync(options)) {
    try {
      const { dataPath } = JSON.parse(readFileSync(options, 'utf8')) as { dataPath?: string };
      if (dataPath) return join(dataPath, 'Data');
    } catch {
      /* malformed options.json — fall through to the conventional layout */
    }
  }
  const conventional = join(userData, 'Data');
  return existsSync(conventional) ? conventional : null;
}

function detectFoundryData(): string | null {
  if (process.env.FOUNDRY_DATA) return process.env.FOUNDRY_DATA;
  for (const ud of userDataDirs()) {
    const dd = dataDirFor(ud);
    if (dd && existsSync(dd)) return dd;
  }
  return null;
}

async function resolveFoundryData(cfg: DevPaths): Promise<string | undefined> {
  const found = (cfg.foundryData && existsSync(cfg.foundryData) ? cfg.foundryData : detectFoundryData()) || undefined;
  if (found) {
    console.log(`✓ Foundry data: ${found}`);
    return found;
  }
  console.log('• No Foundry data dir found (no Config/options.json at the default locations).');
  if (!interactive) {
    console.log('  Set FOUNDRY_DATA or run interactively to point at it; skipping the Foundry link.');
    return undefined;
  }
  const entered = expand(await ask('  Path to your Foundry Data dir (the folder holding modules/, worlds/):'));
  if (entered && existsSync(entered)) return entered;
  if (entered) console.log(`  ${entered} doesn't exist — skipping the Foundry link.`);
  return undefined;
}

function pf2eCandidates(cfg: DevPaths): string[] {
  const out: string[] = [];
  if (cfg.pf2eSource) out.push(cfg.pf2eSource);
  out.push(join(home, 'Documents/repos/pf2e'), join(home, 'repos/pf2e'), join(repo, '..', 'pf2e'));
  return out;
}

async function resolvePf2eSource(cfg: DevPaths): Promise<string | undefined> {
  const hit = pf2eCandidates(cfg).find(existsSync);
  if (hit) {
    console.log(`✓ PF2e source: ${hit}`);
    return hit;
  }
  console.log('• PF2e system source not found (optional — a reference for the pf2e adapter).');
  if (!interactive) return undefined;
  const choice = (await ask('  [c]lone foundryvtt/pf2e, [p]oint at a checkout, or [s]kip?', 's')).toLowerCase();
  if (choice.startsWith('p')) {
    const p = expand(await ask('  Path to your pf2e checkout:'));
    if (p && existsSync(p)) return p;
    console.log('  not found — skipping.');
    return undefined;
  }
  if (choice.startsWith('c')) {
    const dest = expand(await ask('  Clone destination:', join(repo, '..', 'pf2e')));
    if (!dest) return undefined;
    if (existsSync(dest)) {
      console.log(`  ${dest} already exists — using it.`);
      return dest;
    }
    try {
      mkdirSync(dirname(dest), { recursive: true });
      console.log(`  cloning ${PF2E_REPO} → ${dest} (large repo; shallow --depth 1)…`);
      execFileSync('git', ['clone', '--depth', '1', PF2E_REPO, dest], { stdio: 'inherit' });
      return dest;
    } catch {
      console.log('  clone failed — skipping.');
      return undefined;
    }
  }
  return undefined;
}

// Windows can't make plain dir symlinks without admin; junctions need no privilege.
const symlinkType = process.platform === 'win32' ? 'junction' : undefined;

function link(linkPath: string, target: string): void {
  if (!existsSync(target)) {
    console.log(`skip (missing target): ${basename(linkPath)} → ${target}`);
    return;
  }
  const st = lstatSync(linkPath, { throwIfNoEntry: false });
  if (st) {
    if (!st.isSymbolicLink()) {
      console.log(`skip (exists, not a symlink): ${linkPath}`);
      return;
    }
    unlinkSync(linkPath);
  }
  symlinkSync(target, linkPath, symlinkType);
  console.log(`linked ${basename(linkPath)} → ${target}`);
}

// `dist-foundry` holds the bundle, the art, the fonts and a copy of module.json, and nothing
// else, so one link to the whole folder is the module. The build empties the folder and
// leaves the folder itself in place, so the link survives a rebuild.
function linkModule(modulesDir: string): void {
  const dest = join(modulesDir, MODULE_ID);
  const st = lstatSync(dest, { throwIfNoEntry: false });
  if (st && !st.isSymbolicLink()) {
    console.log(`skip (exists, not a symlink): ${dest}`);
    console.log('  A deployed copy sits there. Remove it to return to live editing.');
    return;
  }
  if (st) unlinkSync(dest);
  mkdirSync(OUT_DIR, { recursive: true });
  symlinkSync(OUT_DIR, dest, symlinkType);
  console.log(`linked ${dest} → ${OUT_DIR}`);
}

const cfg = readConfig();
console.log('Setting up the dev environment…\n');

const foundryData = await resolveFoundryData(cfg);
const pf2eSource = await resolvePf2eSource(cfg);

if (foundryData || pf2eSource) {
  writeFileSync(CONFIG, `${JSON.stringify({ foundryData, pf2eSource }, null, 2)}\n`);
  console.log(`\nSaved the paths to ${basename(CONFIG)} (gitignored) — re-run with --reconfigure to change.`);
}

if (noLink) {
  console.log('--no-link: resolved the paths only, no symlinks created.');
} else if (!(await confirm('\nCreate the dev symlinks now?', true))) {
  console.log('Skipped the symlinks. Run `npm run setup` again when ready.');
} else {
  console.log('');
  if (pf2eSource) link(join(repo, '_pf2e-source'), pf2eSource);
  if (foundryData) {
    link(join(repo, '_foundry-data'), foundryData);
    const modulesDir = join(foundryData, 'modules');
    link(join(repo, '_foundry-modules'), modulesDir);
    if (existsSync(modulesDir)) linkModule(modulesDir);
    else console.log(`skip (no modules dir): ${modulesDir}`);
  }
}
rl?.close();
