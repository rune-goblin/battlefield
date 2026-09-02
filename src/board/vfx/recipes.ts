import type { Tree } from '../../engine/index.js';
import type { Track } from './Effect.js';

/** The 16-frame painted key poses under `public/art/spell-vfx-spritesheets/`, by tree. */
export const SHEET: Record<Tree, string> = {
  blast: 'blast',
  healing: 'heal',
  controlling: 'control',
  offense: 'buff-attacks',
  defense: 'buff-defenses',
  movement: 'buff-movement',
};

const UP = -Math.PI / 2;
const RIGHT = 0;

// Blend policy: everything is normal-blended and saturated, and additive is kept for brief
// hot cores. The light theme's cream board turns a large additive glow into a white disc and
// hides additive fire altogether. A dark wash on the ground under each effect gives the
// colours something to sit on in that theme and reads as a spotlight in the dark one.

/** A blast fireball flies in from the caster when there is one; everything else lands on the
 * target straight away, and the shared timing constant lets the impact tracks shift as one. */
export function recipe(tree: Tree, hasFrom: boolean): Track[] {
  switch (tree) {
    case 'blast': return blast(hasFrom ? 260 : 0);
    case 'healing': return healing();
    case 'controlling': return controlling();
    case 'offense': return offense();
    case 'defense': return defense();
    case 'movement': return movement();
  }
}

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

function dim(at: number, duration: number, size = 2.6, strength = 0.4): Track {
  return { kind: 'sprite', texture: 'glow', layer: 'ground', at, duration, size, colour: 0x1a120e, alpha: [0, strength, strength, 0], scale: [0.7, 1, 1, 1.05] };
}

function blast(hit: number): Track[] {
  const flight: Track[] = hit ? [
    // Frame 4's fireball points down-right, trail behind it.
    { kind: 'sprite', texture: { sheet: SHEET.blast, frames: [4] }, duration: hit, size: 1.2, travel: true, heading: Math.PI / 4, alpha: [0, 1, 1, 1], scale: [0.7, 1, 1.1], glow: 0.3 },
    { kind: 'particles', texture: 'glow', trail: true, over: hit, count: 26, life: [180, 320], spawn: { radius: 0.08 }, speed: [0.1, 0.4], size: [0.3, 0.55], scale: [1, 0.2], alpha: [0.9, 0], colour: [0xffb040, 0xf0521a, 0x8a1e08] },
  ] : [];
  return [
    ...flight,
    dim(hit, 1100, 3.0, 0.45),
    { kind: 'sprite', texture: 'glow', at: hit, duration: 140, size: 2.4, blend: 'add', scale: [0.5, 1.2], alpha: [1, 0], colour: 0xfff4d0 },
    { kind: 'sprite', texture: 'glow', at: hit, duration: 520, size: 2.2, layer: 'ground', scale: [0.8, 1.1], alpha: [0.8, 0.5, 0], colour: 0xff6a1a },
    // Frames 7–9 are the burst itself; frame 10's pale dissipation is left to the smoke.
    { kind: 'sprite', texture: { sheet: SHEET.blast, frames: [7, 8, 9] }, at: hit, duration: 320, size: 2.0, scale: [0.7, 1.1, 1.3], alpha: [1, 1, 0.5, 0], glow: 0.25 },
    { kind: 'sprite', texture: 'ring', at: hit, duration: 400, size: 1.0, scale: [0.4, 2.4], alpha: [0.9, 0], colour: 0xe86a1a },
    { kind: 'particles', texture: 'wisp', at: hit, over: 90, count: 48, life: [320, 760], spawn: { radius: 0.22 }, speed: [0.6, 2.0], drag: 3, gravity: -0.9, size: [0.28, 0.6], scale: [0.6, 1, 0.5], alpha: [1, 1, 1, 0], colour: [0xffd060, 0xff8a20, 0xe83a10, 0x7a1e08], stretch: 0.12, wobble: { amp: 0.05, freq: 3 } },
    { kind: 'particles', texture: 'spot', at: hit, over: 120, count: 44, life: [400, 1100], spawn: { radius: 0.15 }, speed: [1.2, 3.4], drag: 2, gravity: 1.6, size: [0.05, 0.1], alpha: [1, 1, 0.8, 0], colour: [0xffd060, 0xff6a10, 0x6a1a08], stretch: 0.08 },
    { kind: 'particles', texture: 'smoke', at: hit + 120, over: 260, count: 18, life: [800, 1500], spawn: { radius: 0.3 }, speed: [0.3, 0.8], drag: 1.5, gravity: -0.8, size: [0.35, 0.65], scale: [0.5, 1.3, 1.7], alpha: [0, 0.4, 0.22, 0], colour: [0x5a4a44, 0x3a3230, 0x2a2624], spin: [-1, 1] },
    { kind: 'sprite', texture: 'smoke', layer: 'ground', at: hit + 60, duration: 2600, size: 1.3, scale: [0.7, 1, 1], alpha: [0, 0.55, 0.5, 0], colour: 0x1a1410 },
    { kind: 'token', at: hit, reaction: { duration: 360, squash: 0.16, shake: 0.05, flash: 0xffe0b0 } },
    { kind: 'shake', at: hit, duration: 280, amp: 0.05 },
  ];
}

function healing(): Track[] {
  return [
    dim(0, 1500, 2.6, 0.3),
    { kind: 'sprite', texture: 'glow', duration: 1500, size: 2.0, layer: 'ground', scale: [0.6, 1, 1, 0.9], alpha: [0, 0.7, 0.6, 0], colour: [0xe0b040, 0x6fd17a, 0x4f9e5c] },
    // Frame 1 is the bare golden pool, before any wisp rises.
    { kind: 'sprite', texture: { sheet: SHEET.healing, frames: [1] }, duration: 1500, size: 1.6, layer: 'ground', y: [0.12], scale: [0.5, 1, 1.05, 0.9], alpha: [0, 1, 1, 0], glow: 0.3 },
    { kind: 'sprite', texture: 'ring', duration: 1400, size: 1.1, layer: 'ground', scale: [0.5, 1.1, 1.25], alpha: [0, 0.8, 0], colour: 0xd9a020, rotation: [0, 0.4] },
    { kind: 'particles', texture: 'wisp', over: 800, count: 36, life: [650, 1150], spawn: { y: 0.15, w: 0.6, h: 0.15 }, direction: UP, spread: 0.25, speed: [0.5, 1.1], drag: 1, size: [0.2, 0.42], scale: [0.5, 1, 1.2], alpha: [0, 1, 1, 0], colour: [0xc8ffc0, 0x5fd070, 0x1f8a48], wobble: { amp: 0.07, freq: 1.4 }, align: true },
    { kind: 'particles', texture: 'spot', at: 100, over: 950, count: 34, life: [700, 1300], spawn: { y: 0.15, w: 0.75, h: 0.2 }, direction: UP, spread: 0.2, speed: [0.3, 0.75], size: [0.03, 0.07], alpha: [0, 1, 1, 0], colour: [0xffffff, 0x9fefa8, 0xf0c040], wobble: { amp: 0.05, freq: 1.8 } },
    { kind: 'sprite', texture: 'flare', at: 380, duration: 380, size: 1.1, y: [-0.3], scale: [0.1, 1, 0.5], alpha: [0, 1, 0], colour: 0xf0c040, rotation: [0, 0.5] },
    { kind: 'token', at: 250, reaction: { duration: 520, hop: 0.06, pop: 0.05, flash: 0xc8ffc0 } },
  ];
}

function controlling(): Track[] {
  return [
    dim(0, 1600, 2.8, 0.4),
    { kind: 'sprite', texture: 'glow', duration: 1600, size: 2.0, layer: 'ground', scale: [0.6, 1, 1, 0.9], alpha: [0, 0.6, 0.6, 0], colour: 0x3f6fd0 },
    { kind: 'sprite', texture: 'ring', duration: 1600, size: 1.4, layer: 'ground', scale: [1.4, 1, 1, 1.1], alpha: [0, 0.8, 0.8, 0], colour: 0x4f7fd0, rotation: [0, -1.2] },
    // Frames 3–9 carry the orb and its rings through their turn; 10–13 unwind it.
    { kind: 'sprite', texture: { sheet: SHEET.controlling, frames: range(3, 9) }, duration: 1050, size: 1.8, scale: [0.6, 1, 1.05], alpha: [0, 1, 1], glow: 0.3, rotation: [0, 0.35] },
    { kind: 'sprite', texture: { sheet: SHEET.controlling, frames: range(10, 13) }, at: 1050, duration: 500, size: 1.8, scale: [1.05, 1.15], alpha: [1, 0], glow: 0.3, rotation: [0.35, 0.7] },
    { kind: 'particles', texture: 'spot', over: 400, count: 28, life: [900, 1400], orbit: { radius: [0.55, 0.9], speed: [2.5, 4.5], shrink: [1, 0.2] }, size: [0.03, 0.06], alpha: [0, 1, 1, 0], colour: [0xffffff, 0x8ec5ff, 0x2f5fd0], stretch: 0.04 },
    { kind: 'sprite', texture: 'ring', at: 620, duration: 380, size: 1.2, scale: [1.3, 0.25], alpha: [0, 1, 0.3], colour: 0x6fa0ff },
    { kind: 'sprite', texture: 'glow', at: 760, duration: 220, size: 1.6, blend: 'add', scale: [0.4, 1.1], alpha: [1, 0], colour: 0xdfefff },
    { kind: 'particles', texture: 'shard', at: 780, count: 14, life: [300, 600], spawn: { radius: 0.1 }, speed: [1.0, 2.4], drag: 3, size: [0.05, 0.1], alpha: [1, 0], colour: [0xdfefff, 0x4f8fe0], stretch: 0.1 },
    { kind: 'token', at: 760, reaction: { duration: 420, squash: 0.1, flash: 0x9fc8ff } },
  ];
}

function offense(): Track[] {
  return [
    dim(0, 900, 2.6, 0.35),
    { kind: 'sprite', texture: 'glow', duration: 900, size: 1.8, layer: 'ground', scale: [0.6, 1, 1], alpha: [0, 0.7, 0], colour: 0xf09030 },
    // Frames 1–9: the crescent grows, crosses itself and throws sparks; 10–12 let them fall.
    { kind: 'sprite', texture: { sheet: SHEET.offense, frames: range(1, 9) }, duration: 520, size: 1.9, scale: [0.75, 1.05, 1.2], alpha: [1, 1, 1], rotation: [-0.15, 0.1], glow: 0.35 },
    { kind: 'sprite', texture: { sheet: SHEET.offense, frames: range(10, 12) }, at: 520, duration: 330, size: 1.9, scale: [1.2, 1.3], alpha: [1, 0], glow: 0.3 },
    { kind: 'sprite', texture: 'flare', at: 300, duration: 280, size: 1.4, scale: [0.2, 1.2, 0.5], alpha: [0.6, 1, 0], colour: 0xffb020, rotation: [0.3, 0.5] },
    { kind: 'sprite', texture: 'glow', at: 300, duration: 160, size: 1.4, blend: 'add', scale: [0.4, 1.1], alpha: [1, 0], colour: 0xfff4c0 },
    { kind: 'particles', texture: 'streak', at: 300, over: 120, count: 32, life: [300, 720], spawn: { radius: 0.12 }, speed: [1.5, 3.6], drag: 2.5, gravity: 1.0, size: [0.12, 0.26], scale: [1, 0.3], alpha: [1, 1, 0], colour: [0xffe090, 0xffa030, 0xe04a10], stretch: 0.1 },
    { kind: 'particles', texture: 'spot', at: 400, over: 500, count: 18, life: [500, 1000], spawn: { w: 0.7, h: 0.4 }, direction: UP, spread: 0.4, speed: [0.2, 0.6], size: [0.025, 0.05], alpha: [0, 1, 0], colour: [0xffd070, 0xff8a20], wobble: { amp: 0.03, freq: 2 } },
    { kind: 'token', at: 300, reaction: { duration: 380, pop: 0.14, flash: 0xffd9a0 } },
  ];
}

function defense(): Track[] {
  return [
    dim(0, 1700, 2.8, 0.4),
    { kind: 'sprite', texture: 'glow', duration: 1700, size: 2.0, layer: 'ground', scale: [0.6, 1, 1, 0.9], alpha: [0, 0.6, 0.6, 0], colour: 0x3f7fd0 },
    { kind: 'sprite', texture: 'ring', duration: 600, size: 1.3, scale: [1.7, 0.85], alpha: [0, 0.9, 0.3], colour: 0x5f9ee0 },
    // Frames 1–9 assemble the ward, 10 is the strike it takes, 11–13 its shards falling.
    { kind: 'sprite', texture: { sheet: SHEET.defense, frames: range(1, 9) }, duration: 720, size: 1.7, y: [-0.08], scale: [0.5, 1, 1.05], alpha: [0, 1, 1], glow: 0.3 },
    { kind: 'sprite', texture: { sheet: SHEET.defense, frames: [9] }, at: 720, duration: 280, size: 1.7, y: [-0.08], scale: [1.05, 1.05], glow: 0.3 },
    { kind: 'sprite', texture: { sheet: SHEET.defense, frames: [10] }, at: 1000, duration: 140, size: 1.7, y: [-0.08], scale: [1.05, 1.12], glow: 0.7 },
    { kind: 'sprite', texture: { sheet: SHEET.defense, frames: range(11, 13) }, at: 1140, duration: 480, size: 1.7, y: [-0.08], scale: [1.12, 1.2], alpha: [1, 0], glow: 0.25 },
    { kind: 'particles', texture: 'shard', over: 400, count: 22, life: [500, 900], spawn: { radius: 0.7, ring: true }, speed: [-1.4, -0.7], drag: 1.5, size: [0.05, 0.1], alpha: [0, 1, 1, 0], colour: [0xdfefff, 0x4f8fe0], spin: [-6, 6] },
    { kind: 'sprite', texture: 'glow', at: 1000, duration: 200, size: 2.0, blend: 'add', scale: [0.5, 1.2], alpha: [1, 0], colour: 0xe0f4ff },
    { kind: 'sprite', texture: 'ring', at: 1000, duration: 400, size: 1.0, scale: [0.4, 2.8], alpha: [0.9, 0], colour: 0x5f9ee0 },
    { kind: 'particles', texture: 'spot', at: 1020, count: 20, life: [300, 700], spawn: { radius: 0.25 }, speed: [0.8, 2.2], drag: 2.5, gravity: 1.2, size: [0.03, 0.06], alpha: [1, 0], colour: [0xffffff, 0x4f8fe0], stretch: 0.08 },
    { kind: 'token', at: 1000, reaction: { duration: 300, squash: 0.06, shake: 0.02, flash: 0xc8e4ff } },
  ];
}

function movement(): Track[] {
  return [
    dim(0, 1000, 2.8, 0.3),
    { kind: 'sprite', texture: 'glow', duration: 1000, size: 2.0, layer: 'ground', scale: [0.6, 1, 1], alpha: [0, 0.6, 0], colour: 0x2fa8a0, x: [-0.3, 0.3] },
    // Frames 2–9 grow the wing left to right; 10–12 trail it out.
    { kind: 'sprite', texture: { sheet: SHEET.movement, frames: range(2, 9) }, duration: 600, size: 1.8, x: [-0.35, 0.25], y: [-0.1], scale: [0.7, 1, 1.15], alpha: [0.8, 1, 1], glow: 0.3 },
    { kind: 'sprite', texture: { sheet: SHEET.movement, frames: range(10, 12) }, at: 600, duration: 320, size: 1.8, x: [0.25, 0.6], y: [-0.1], scale: [1.15, 1.25], alpha: [1, 0], glow: 0.2 },
    { kind: 'particles', texture: 'streak', over: 550, count: 40, life: [260, 620], spawn: { x: -0.9, w: 0.3, h: 0.9 }, direction: RIGHT, spread: 0.12, speed: [2.5, 5.0], drag: 1, size: [0.25, 0.6], alpha: [0, 1, 0], colour: [0xdfffff, 0x6fe0ff, 0x1fa0d0], align: true },
    { kind: 'particles', texture: 'spot', over: 500, count: 24, life: [500, 800], orbit: { radius: [0.4, 0.7], speed: [5, 8] }, size: [0.025, 0.05], alpha: [0, 1, 0], colour: [0xffffff, 0x3fcfff], stretch: 0.03 },
    { kind: 'particles', texture: 'wisp', at: 100, over: 400, count: 16, life: [400, 800], spawn: { y: 0.2, w: 0.5 }, direction: RIGHT, spread: 0.3, speed: [0.8, 1.6], drag: 1.5, size: [0.15, 0.3], alpha: [0, 0.7, 0], colour: [0xcfffff, 0x3fbfb0], align: true },
    { kind: 'token', at: 150, reaction: { duration: 460, hop: 0.12, pop: 0.06, flash: 0xc0f8ff } },
  ];
}
