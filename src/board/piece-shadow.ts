import * as PIXI from 'pixi.js';
import { DEFAULT_ELEVATION_SHADOWS } from './terrain-textures.js';
import { ART_ANCHOR_Y } from './art.js';

/**
 * A piece's cast shadow: its own art as a silhouette, laid on the ground by the board's one
 * light. Under a sun the rays are parallel and the board is seen from above, so a point of
 * the figure standing `h` above its base lands `h * slope` along the light's azimuth — an
 * affine map, exact for a flat cutout, which is what the renders are. A point light would
 * need a homography; a battlefield in daylight does not.
 */
export interface PieceLight {
  /** Where the shadow falls, in screen degrees (y down) — the terrain's own, so hills, trees
   * and pieces agree. */
  azimuth: number;
  /** The cotangent of the sun's elevation: how far along the ground a unit of height reaches. */
  slope: number;
}

// proto: one light for the whole board, read off the terrain's default rather than plumbed
// from its live settings. If the appearance panel's angle ever moves, this stays put.
export const PIECE_LIGHT: PieceLight = { azimuth: DEFAULT_ELEVATION_SHADOWS.angle, slope: 0.75 };

/** The whole shadow group's darkness and softness — one filter pass each for every piece
 * on the board, so two shadows crossing never darken twice. `blur` is in hex pitches. */
export const SHADOW_GROUP = { alpha: 0.38, blur: 0.02 };

/** The soft ellipse under the base: ambient occlusion where the piece meets the ground,
 * drawn at its own alpha inside the group so the contact reads darkest. Radii in hex pitches. */
export const SHADOW_CONTACT = { rx: 0.27, ry: 0.08, alpha: 0.75 };

/** A piece in hand: its shadow stays on the ground, shrinks, fades, and slides along the
 * light by the lift, in hex pitches. */
export const LIFTED_SHADOW = { scale: 0.85, alpha: 0.55, lift: 0.22 };

/** The silhouette is baked at this width; it is blurred on the board, so the art's own
 * resolution would be wasted on it. */
const BAKE_WIDTH = 256;
/** The band, in rows of the image, over which the silhouette fades out into the contact
 * ellipse: from the top of the painted base down to the anchor row. Masks the base's own
 * squashed cylinder, which the shear would otherwise leave as a blot beside the ellipse. */
const RAMP_TOP = 0.7;

/** Local (x, y) on the standing figure, y up the screen, to the ground under the light. */
export function castMatrix(light: PieceLight = PIECE_LIGHT): PIXI.Matrix {
  const radians = (light.azimuth * Math.PI) / 180;
  return new PIXI.Matrix(1, 0, -light.slope * Math.cos(radians), -light.slope * Math.sin(radians), 0, 0);
}

const baked = new Map<string, Promise<PIXI.Texture>>();

/** The art at `path` as a white silhouette fading out across its base, for tinting into a
 * shadow. One bake per path, shared by every piece that carries it. */
export function silhouetteTexture(path: string): Promise<PIXI.Texture> {
  let pending = baked.get(path);
  if (!pending) {
    pending = PIXI.Assets.load<PIXI.Texture>(path).then((texture) => bake(texture, path));
    baked.set(path, pending);
  }
  return pending;
}

async function bake(texture: PIXI.Texture, path: string): Promise<PIXI.Texture> {
  const source = await imageOf(texture, path);
  const width = BAKE_WIDTH;
  const height = Math.max(1, Math.round((BAKE_WIDTH * texture.height) / Math.max(texture.width, 1)));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0, width, height);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'destination-in';
  const ramp = ctx.createLinearGradient(0, height * RAMP_TOP, 0, height * ART_ANCHOR_Y);
  ramp.addColorStop(0, 'rgba(255,255,255,1)');
  ramp.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = ramp;
  ctx.fillRect(0, 0, width, height);
  return PIXI.Texture.from(canvas);
}

// The loaded texture's own decoded image where PIXI exposes it; a second decode from the
// browser cache where it does not (an ImageBitmap resource on some loaders).
function imageOf(texture: PIXI.Texture, path: string): Promise<CanvasImageSource> {
  const source = (texture.baseTexture.resource as { source?: CanvasImageSource }).source;
  if (source) return Promise.resolve(source);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = path;
  });
}
