import { defineConfig, type Plugin } from 'vite';
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

export default defineConfig({
  plugins: [svelte(), terrainTextures()],
  base: './',
  build: {
    target: 'es2022',
    // The two-client dev page (Wave 3.7) rides along as a second page rather than a separate
    // script: `vite build`'s default input is `index.html` alone, and this is the one other
    // entry the standard gate needs to cover.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        twoClients: fileURLToPath(new URL('./dev/two-clients/index.html', import.meta.url)),
      },
    },
  },
  test: { include: ['src/tests/**/*.test.ts', 'scripts/*.test.mjs'] },
});
