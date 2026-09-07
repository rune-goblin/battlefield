const params = new URLSearchParams(location.search);

export const textureLab = $state({
  open: import.meta.env.DEV && params.has('textures'),
  // 0 is the reference layout; the URL carries any other draw so a layout worth a second look
  // survives a reload and can be handed to someone else.
  layout: Math.max(0, Math.trunc(Number(params.get('layout'))) || 0),
});

function writeUrl(): void {
  const url = new URL(location.href);
  if (textureLab.open) url.searchParams.set('textures', ''); else url.searchParams.delete('textures');
  if (textureLab.open && textureLab.layout) url.searchParams.set('layout', String(textureLab.layout));
  else url.searchParams.delete('layout');
  history.replaceState(null, '', url);
}

export function setTextureLab(open: boolean): void {
  textureLab.open = open;
  writeUrl();
}

export function setLayout(seed: number): void {
  textureLab.layout = Math.max(0, Math.trunc(seed) || 0);
  writeUrl();
}
