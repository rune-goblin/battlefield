import * as PIXI from 'pixi.js';
import type { Side } from '../../engine/index.js';
import { drawSelection } from '../selection.js';
import type { BoardTheme } from '../theme.js';
import type { TokenRing } from '../Token.js';
import { TOKEN_FOOTPRINT_RATIO } from './geometry.js';

// The ring traces the piece's footprint — which is also its hit area — now that there is no
// disc for it to sit outside of. Any wider and it cuts through the flag's level.
const RING_GAP = 0.01;
/** How far the glow breathes either side of its footprint, as a fraction of it. */
const GLOW_SWELL = 0.06;
const PULSE_PERIOD_MS = 1400;
const FLASH_PERIOD_MS = 260;

/** The ring around a piece: the still selection outline, the active unit's breathing glow in its
 * army's colour, or a free strike's flash. */
export class RingGlow {
  readonly graphics = new PIXI.Graphics();
  private kind: TokenRing | null = null;
  private pulseStart = 0;

  constructor() {
    this.graphics.visible = false;
  }

  draw(kind: TokenRing | null, side: Side, size: number, theme: BoardTheme): void {
    this.kind = kind;
    this.graphics.clear();
    this.graphics.visible = !!kind;
    this.graphics.scale.set(1);
    if (!kind) { this.pulseStart = 0; return; }
    const r = (size * TOKEN_FOOTPRINT_RATIO) / 2 + size * RING_GAP;
    if (kind === 'selected') {
      this.pulseStart = 0;
      this.graphics.alpha = 1;
      drawSelection(this.graphics, outline => { outline.drawCircle(0, 0, r); });
      return;
    }
    this.pulseStart ||= performance.now();
    if (kind === 'flash') {
      this.graphics.lineStyle(size * 0.07, theme.token.ringFlash, 1).drawCircle(0, 0, r);
      this.graphics.alpha = this.flashAlpha();
      return;
    }
    const colour = side === 'attacker' ? theme.attacker : theme.defender;
    this.graphics.beginFill(colour, 1).drawCircle(0, 0, r).endFill();
    this.breathe();
  }

  tick(): void {
    if (this.kind === 'flash') this.graphics.alpha = this.flashAlpha();
    else if (this.kind === 'active') this.breathe();
  }

  /** The active unit's glow swells and brightens together. Selection stays still. */
  private breathe(): void {
    const t = ((performance.now() - this.pulseStart) % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
    const phase = Math.sin(t * Math.PI * 2);
    this.graphics.alpha = 0.5 + 0.25 * phase;
    this.graphics.scale.set(1 + GLOW_SWELL * phase);
  }

  /** A fast, hard blink — distinct from the slow `active` breathing pulse — for a free
   * strike's instant. The caller (Battle.svelte) owns the duration and clears `ring` itself;
   * this just animates for as long as `ring` stays `'flash'`. */
  private flashAlpha(): number {
    const t = ((performance.now() - this.pulseStart) % FLASH_PERIOD_MS) / FLASH_PERIOD_MS;
    return 0.35 + 0.65 * Math.abs(Math.sin(t * Math.PI * 2));
  }
}
