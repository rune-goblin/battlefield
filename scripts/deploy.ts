// Build, then copy `dist-foundry` into Foundry's modules/ as a real, link-free directory — the
// same files the release zip ships. `npm run setup` links the folder for live editing; this
// copy works with the repo absent. Run with `npm run deploy`. Override the target with
// FOUNDRY_DATA, else it reuses .dev-paths.json.
import { existsSync, readFileSync, lstatSync, unlinkSync, rmSync, cpSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { MODULE_ID } from '../src/adapters/foundry/module-id.ts';

const repo = process.cwd();
const home = homedir();
const CONFIG = join(repo, '.dev-paths.json');

// Same resolution order as scripts/setup.ts.
function detectFoundryData(): string | undefined {
  if (process.env.FOUNDRY_DATA) return process.env.FOUNDRY_DATA;
  if (existsSync(CONFIG)) {
    try {
      const { foundryData } = JSON.parse(readFileSync(CONFIG, 'utf8')) as { foundryData?: string };
      if (foundryData && existsSync(foundryData)) return foundryData;
    } catch {
      /* malformed cache — fall through to detection */
    }
  }
  let base: string;
  if (process.platform === 'darwin') base = join(home, 'Library/Application Support');
  else if (process.platform === 'win32') base = process.env.LOCALAPPDATA ?? join(home, 'AppData/Local');
  else base = process.env.XDG_DATA_HOME ?? join(home, '.local/share');
  for (const name of ['FoundryVTT-v14', 'FoundryVTT']) {
    const dd = join(base, name, 'Data');
    if (existsSync(dd)) return dd;
  }
  return undefined;
}

const foundryData = detectFoundryData();
if (!foundryData) {
  console.error('No Foundry data dir found — run `npm run setup`, set FOUNDRY_DATA, or create .dev-paths.json.');
  process.exit(1);
}

console.log('Building…');
execFileSync('npm', ['run', 'build:foundry'], { stdio: 'inherit', cwd: repo });

const dest = join(foundryData, 'modules', MODULE_ID);
const existing = lstatSync(dest, { throwIfNoEntry: false });
if (existing?.isSymbolicLink()) {
  unlinkSync(dest);
} else if (existing && !existing.isDirectory()) {
  console.error(`Refusing to deploy: ${dest} exists and is not a directory.`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(join(repo, 'dist-foundry'), dest, {
  recursive: true,
  filter: (src) => basename(src) !== '.DS_Store',
});

console.log(`\n✓ Deployed ${MODULE_ID} → ${dest}`);
console.log('  Reload Foundry (or relaunch the world) to pick it up.');
console.log('  To return to live editing, remove that folder and run `npm run setup`.');
