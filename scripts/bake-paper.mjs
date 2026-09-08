// Cuts seamless paper-grain tiles for the illustrated map out of the licensed parchment stock,
// which lives outside the repo, into public/art/terrain/paper/. Each tile is a clean square of
// its sheet. The page cut is the sheet as scanned, for the board to lay under a translucent
// wash. The rest have their lighting gradient removed and are levelled to a set mean, for the
// board to multiply over an opaque wash: the grey ones carry grain and no colour, leaving the
// paper colour and the terrain washes to the settings, and the coloured one keeps half the
// sheet's own hue. Seams are hidden by the roll-
// and-blend trick — the tile rolled half a turn is faded in towards the edges, where its own
// join is continuous.
// Usage: node scripts/bake-paper.mjs [stock dir]   (needs magick and cwebp: brew install imagemagick webp)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 1024;
// Two grey crops and one coloured from each sheet, all clear of its vignette, chosen by eye.
// The second crop is a smaller region, so its grain comes out coarser.
const SHEETS = {
  mottled: ['AdobeStock_139984009.jpeg', '4000x4000+1125+1125', '2200x2200+900+3000'],
  cloud: ['AdobeStock_268196623.jpeg', '4400x4400+2313+808', '2400x2400+1000+2800'],
  stained: ['AdobeStock_304183725.jpeg', '2200x2200+628+52', '1400x1400+1900+800'],
  streaked: ['AdobeStock_460601466.jpeg', '3000x3000+3500+135', '2000x2000+7000+600'],
  scratched: ['AdobeStock_462555446.jpeg', '3600x3600+1207+250', '2000x2000+600+1800'],
  plaster: ['AdobeStock_511243499.jpeg', '4200x4200+5577+262', '2400x2400+11000+1000'],
};
// The page cut is the sheet as scanned, seam-blended and nothing else; the board lays it
// under a translucent wash rather than multiplying it over an opaque one.
const TILES = Object.entries(SHEETS).flatMap(([name, [file, fine, coarse]]) => [
  { name: `${name}-page`, file, crop: fine, colour: true, page: true },
  { name: `${name}-fine`, file, crop: fine, colour: false },
  { name: `${name}-coarse`, file, crop: coarse, colour: false },
  { name: `${name}-colour`, file, crop: fine, colour: true },
]);
// Multiplied over the wash at full strength the tile darkens the page by one part in twenty
// and its grain by a few parts more; the slider takes it down from there.
const MEAN = 0.95;
// The low pass that is taken out: everything broader than this many cells across the tile
// is lighting, everything finer is grain.
const LOW = 6;
// How much of the sheet's own hue a coloured tile keeps, 0–1.
const HUE = 0.5;

const stock = process.argv[2] ?? join(homedir(), 'Documents/battlefield/parchment-stock');
const outDir = fileURLToPath(new URL('../public/art/terrain/paper/', import.meta.url));
mkdirSync(outDir, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'bake-paper-'));
const magick = (...args) => execFileSync('magick', args, { stdio: 'inherit' });

const half = SIZE / 2;
const mask = join(work, 'mask.png');
// 0 over the middle half, rising smoothly to 1 at the edges.
magick('-size', `${SIZE}x${SIZE}`, 'xc:', '-fx',
  'dd=max(abs(i-w/2)/(w/2),abs(j-h/2)/(h/2)); tt=(dd-0.5)/0.4; dd<0.5?0:(dd>0.9?1:tt*tt*(3-2*tt))', mask);

for (const { name, file, crop, colour, page } of TILES) {
  const src = join(stock, file);
  const cropped = join(work, `${name}.crop.png`);
  const flat = join(work, `${name}.flat.png`);
  const rolled = join(work, `${name}.roll.png`);
  const tile = join(work, `${name}.png`);
  magick(src, '-crop', crop, '+repage', '-resize', `${SIZE}x${SIZE}!`, ...(colour ? [] : ['-colorspace', 'Gray']), cropped);
  // The high pass lands on grey; a coloured tile then takes half of the crop's own hue back,
  // scaled so its luminance stays at MEAN. The whole hue made a golden sheet a yellow filter
  // over every wash.
  if (page) {
    magick(cropped, flat);
  } else {
    const tint = colour ? meanTint(cropped) : [];
    magick(cropped, '-write', 'mpr:crop', '-scale', `${LOW}x${LOW}!`, '-resize', `${SIZE}x${SIZE}!`, 'mpr:crop',
      '-compose', 'Mathematics', '-define', `compose:args=0,1,-1,${MEAN}`, '-composite', ...tint, flat);
  }
  magick(flat, '-roll', `+${half}+${half}`, rolled);
  magick(flat, rolled, mask, '-compose', 'over', '-composite', '-clamp', '-depth', '8',
    ...(colour ? [] : ['-colorspace', 'Gray']), tile);
  execFileSync('cwebp', ['-quiet', '-q', '82', tile, '-o', join(outDir, `${name}.webp`)], { stdio: 'inherit' });
  console.log(`${name}.webp from ${file} ${crop}`);
}

function meanTint(image) {
  const [r, g, b] = execFileSync('magick', [image, '-format', '%[fx:mean.r] %[fx:mean.g] %[fx:mean.b]', 'info:'])
    .toString().trim().split(' ').map(Number);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const gain = (c) => String(1 + (c / lum - 1) * HUE);
  return ['-channel', 'R', '-evaluate', 'multiply', gain(r), '-channel', 'G', '-evaluate', 'multiply', gain(g),
    '-channel', 'B', '-evaluate', 'multiply', gain(b), '+channel'];
}
rmSync(work, { recursive: true, force: true });
