import { defineConfig, type Plugin } from 'vite';
import { cpSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { terrainTextures } from './vite.config.ts';
import { MODULE_ID } from './src/adapters/foundry/module-id.ts';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const manifest = JSON.parse(readFileSync(here('./module.json'), 'utf8')) as { id: string };
if (manifest.id !== MODULE_ID) {
  throw new Error(`module.json id "${manifest.id}" does not match MODULE_ID "${MODULE_ID}".`);
}

const OUT_DIR = 'dist-foundry';

// The art, fonts and rules page are what `assetUrl` fetches at `modules/<id>/...`, and
// `module.json` is what Foundry reads to find the bundle. All of them sit beside the build
// output, which is the folder Foundry serves as the module.
const moduleFiles = (): Plugin => ({
  name: 'battlefield-module-files',
  apply: 'build',
  closeBundle() {
    cpSync(here('./public/art'), here(`./${OUT_DIR}/art`), { recursive: true });
    cpSync(here('./public/fonts'), here(`./${OUT_DIR}/fonts`), { recursive: true });
    cpSync(here('./public/outcome'), here(`./${OUT_DIR}/outcome`), { recursive: true });
    cpSync(here('./public/rules.html'), here(`./${OUT_DIR}/rules.html`));
    cpSync(here('./module.json'), here(`./${OUT_DIR}/module.json`));
    cpSync(here('./LICENSE'), here(`./${OUT_DIR}/LICENSE`));
  },
});

const PIXI_SHIM = '\0battlefield:pixi-shim';

// Foundry publishes its own pixi.js 7.4.3 as the global `PIXI`, a script and no ES module, and
// an ES module has to name its exports. The list comes from the installed `pixi.js` (the same
// version), so every name the board or a `@pixi/filter-*` package can import exists here.
const pixiShim = (): Plugin => ({
  name: 'battlefield-pixi-shim',
  enforce: 'pre',
  resolveId: (id) => (id === 'pixi.js' || id === '@pixi/core' ? PIXI_SHIM : null),
  async load(id) {
    if (id !== PIXI_SHIM) return null;
    const names = Object.keys(await import('pixi.js')).filter((name) => name !== 'default');
    return [
      'const pixi = globalThis.PIXI;',
      "if (!pixi) throw new Error(\"Battlefield needs Foundry's PIXI global, which is missing.\");",
      `export const { ${names.join(', ')} } = pixi;`,
    ].join('\n');
  },
});

const FOUNDRY_PORT = Number(process.env.FOUNDRY_PORT ?? 30000);
// 30001 is the dev port of ReignMaker and of Creature CRISPR.
const DEV_PORT = Number(process.env.DEV_PORT ?? 30002);
const ENTRY = '/src/adapters/foundry/index.ts';

// `npm run dev:foundry` puts Vite in front of a running Foundry. Foundry's page asks for the
// built bundle named in module.json; Vite answers with the source entry, so a `.svelte` or CSS
// edit hot-swaps in the live world. The built stylesheet answers empty, since in dev the entry
// injects the styles itself and a stale copy would sit under them.
const foundryDevEntry = (): Plugin => ({
  name: 'battlefield-foundry-dev-entry',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = req.url?.split('?')[0];
      if (path === `/modules/${MODULE_ID}/${MODULE_ID}.js`) req.url = ENTRY;
      if (path === `/modules/${MODULE_ID}/${MODULE_ID}.css`) {
        res.setHeader('Content-Type', 'text/css');
        res.end('');
        return;
      }
      next();
    });
  },
});

export default defineConfig(({ command }) => ({
  plugins: [
    svelte({
      // Foundry loads every module's styles into one document. The prefix keeps this module's
      // scoped classes apart from another package's. The dev server hashes the filename, so a
      // style edit keeps its class and hot-swaps in place.
      compilerOptions: {
        cssHash: ({ hash, css, filename }) => `svelte-bf-${hash(command === 'serve' ? filename : css)}`,
      },
    }),
    pixiShim(),
    foundryDevEntry(),
    terrainTextures(),
    moduleFiles(),
  ],
  // `public/` is copied by the plugin above, under the one folder the board reads from.
  publicDir: false,
  // Pre-bundling would resolve the filters' `@pixi/core` import past the shim.
  optimizeDeps: { exclude: ['pixi.js', '@pixi/core', '@pixi/filter-bevel', '@pixi/filter-drop-shadow'] },
  server: {
    port: DEV_PORT,
    strictPort: true,
    proxy: {
      // Everything Vite does not serve itself is Foundry's: its routes, the art and fonts under
      // `modules/battlefield/` (from the last `build:foundry`), and every other package.
      '^/(?!src/|node_modules/|@vite/|@id/|@fs/)': `http://localhost:${FOUNDRY_PORT}`,
      '/socket.io': { target: `ws://localhost:${FOUNDRY_PORT}`, ws: true },
    },
  },
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    lib: {
      entry: here('./src/adapters/foundry/index.ts'),
      formats: ['es'],
      fileName: () => `${MODULE_ID}.js`,
    },
    rollupOptions: {
      // An import that resolves to nothing compiles to `undefined` and throws when first read,
      // which for a board effect is mid-battle.
      onLog(level, log, handler) {
        if (log.code === 'IMPORT_IS_UNDEFINED') throw new Error(log.message);
        handler(level, log);
      },
      output: {
        assetFileNames: (asset) =>
          (asset.names ?? [asset.name]).includes('style.css') ? `${MODULE_ID}.css` : '[name][extname]',
      },
    },
  },
}));
