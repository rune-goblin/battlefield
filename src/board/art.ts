import { engineArt, troopArt } from '../engine/art.js';
import type { Role } from '../engine/index.js';

// src/engine/art.ts stays free of Vite types (tsconfig.engine.json carries none) so it
// type-checks as pure engine code; it returns paths without a leading slash. The BASE_URL
// prefix a non-root deploy needs lives here instead — src/board/ is covered by the main
// tsconfig, which does include vite/client. See docs/plans/pixi-board.todos.md, "Wave 4
// notes — art pipeline".
const BASE = import.meta.env.BASE_URL;

export function troopArtUrl(name: string, role: Role): string {
  return BASE + troopArt(name, role);
}

export function engineArtUrl(name: string): string | null {
  const path = engineArt(name);
  return path ? BASE + path : null;
}
