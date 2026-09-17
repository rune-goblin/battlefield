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

// The art is what `assetUrl` fetches at `modules/<id>/art/...`, and `module.json` is what
// Foundry reads to find the bundle. Both sit beside the build output, which is the folder
// Foundry serves as the module.
const moduleFiles = (): Plugin => ({
  name: 'battlefield-module-files',
  apply: 'build',
  closeBundle() {
    cpSync(here('./public/art'), here(`./${OUT_DIR}/art`), { recursive: true });
    cpSync(here('./module.json'), here(`./${OUT_DIR}/module.json`));
  },
});

export default defineConfig({
  plugins: [
    svelte({
      // Foundry loads every module's styles into one document. The prefix keeps this module's
      // scoped classes apart from another package's.
      compilerOptions: { cssHash: ({ hash, css }) => `svelte-bf-${hash(css)}` },
    }),
    terrainTextures(),
    moduleFiles(),
  ],
  // `public/` is copied by the plugin above, under the one folder the board reads from.
  publicDir: false,
  resolve: {
    alias: {
      // Foundry publishes its own pixi.js 7.4.3 as `globalThis.PIXI`. The board and the two
      // `@pixi/filter-*` packages bundle against that renderer rather than a second copy.
      'pixi.js': here('./src/adapters/foundry/pixi-shim.ts'),
      '@pixi/core': here('./src/adapters/foundry/pixi-shim.ts'),
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
      output: {
        assetFileNames: (asset) =>
          (asset.names ?? [asset.name]).includes('style.css') ? `${MODULE_ID}.css` : '[name][extname]',
      },
    },
  },
});
