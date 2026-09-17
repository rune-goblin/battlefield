let base = import.meta.env.BASE_URL;

/** Foundry calls this once, before any board module loads art, with `modules/<id>/`. The
 * browser needs no call: the default is Vite's own base. */
export function setAssetBase(path: string): void {
  base = path;
}

export function assetUrl(relative: string): string {
  return base + relative;
}
