import { defineConfig, type Plugin } from 'vite';
import type { Plugin as PostcssPlugin } from 'postcss';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const texturesDir = fileURLToPath(new URL('./public/art/terrain/textures/', import.meta.url));
const VIRTUAL_ID = 'virtual:terrain-textures';

// The board reads the terrain art out of `public/`, which no bundler graph covers, so the
// listing has to come from a scan of the folder. A `define` would not do: Vite 8 leaves those
// untouched in dev, and the lab came up with an empty texture library.
export const terrainTextures = (): Plugin => ({
  name: 'terrain-textures',
  resolveId: id => (id === VIRTUAL_ID ? `\0${VIRTUAL_ID}` : null),
  load(id) {
    if (id !== `\0${VIRTUAL_ID}`) return null;
    const files = readdirSync(texturesDir, { recursive: true })
      .filter((path): path is string => typeof path === 'string' && /\.(jpe?g|png|webp)$/i.test(path));
    return `export default ${JSON.stringify(files.sort())};`;
  },
  configureServer(server) {
    server.watcher.add(texturesDir);
    // A restart is what re-runs the scan; art lands here rarely enough to afford one.
    const rescan = (path: string) => { if (path.startsWith(texturesDir)) void server.restart(); };
    server.watcher.on('add', rescan).on('unlink', rescan);
  },
});

// Foundry sets the page's root font size from each client's Font Scale (8px to 32px), and a
// `rem` follows it while the app's px boxes do not. Every stylesheet `rem` becomes a multiple of
// `--rem`, which the app's roots set; outside them the fallback is the page's own rem. A size
// set from script goes through `rem()` in `src/app/rem.ts`. Media queries keep plain rem.
export const appRem = (): PostcssPlugin => ({
  postcssPlugin: 'battlefield-app-rem',
  Declaration(decl) {
    if (decl.prop === '--rem' || decl.value.includes('var(--rem') || !/\drem\b/.test(decl.value)) return;
    decl.value = decl.value.replace(/(-?(?:\d+\.?\d*|\.\d+))rem\b/g, 'calc($1 * var(--rem, 1rem))');
  },
});

export default defineConfig({
  plugins: [svelte(), terrainTextures()],
  css: { postcss: { plugins: [appRem()] } },
  base: './',
  build: {
    target: 'es2022',
    // `vite build`'s default input is `index.html` alone, which is the landing page. The game
    // and the two-client dev page (Wave 3.7) ride along as further pages.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        play: fileURLToPath(new URL('./play.html', import.meta.url)),
        twoClients: fileURLToPath(new URL('./dev/two-clients/index.html', import.meta.url)),
      },
    },
  },
  test: { include: ['src/tests/**/*.test.ts', 'scripts/*.test.mjs'] },
});
