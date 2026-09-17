import { setAssetBase } from '../../board/asset-base.js';
import { MODULE_ID } from './module-id.js';

// `terrain-textures.ts` builds its texture list the moment it loads, so the base has to be set
// before any module under `src/board` is evaluated. `index.ts` imports this file first, and
// module evaluation follows import order. The path carries no leading slash, so a Foundry
// route prefix still resolves against it.
setAssetBase(`modules/${MODULE_ID}/`);
