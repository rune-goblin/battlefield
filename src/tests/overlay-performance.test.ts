import type { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { OverlayLayer } from '../board/layers/OverlayLayer.js';
import { darkTheme, HIGHLIGHT_STYLES } from '../board/theme.js';

describe('placement highlight updates', () => {
  it('rebuilds only when washes change as a drag crosses legal and illegal cells', () => {
    // Clearing the container starts each rebuild, even before board geometry is attached.
    const removeChildren = vi.fn(() => []);
    const overlay = new OverlayLayer({ removeChildren } as unknown as Container, darkTheme);
    const preview = (invalid: string[]) => {
      for (const style of HIGHLIGHT_STYLES) {
        overlay.setHighlight(style === 'deploy' ? ['a1', 'b1'] : style === 'invalid' ? invalid : [], style);
      }
    };

    preview([]);
    expect(removeChildren).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 100; i++) preview([]);
    expect(removeChildren).toHaveBeenCalledTimes(1);

    preview(['a4']);
    expect(removeChildren).toHaveBeenCalledTimes(2);
    preview(['a4']);
    expect(removeChildren).toHaveBeenCalledTimes(2);
    preview(['b4']);
    expect(removeChildren).toHaveBeenCalledTimes(3);
    preview([]);
    expect(removeChildren).toHaveBeenCalledTimes(4);
  });

  it('treats reordered or repeated cells as the same wash and still clears a changed zone', () => {
    const removeChildren = vi.fn(() => []);
    const overlay = new OverlayLayer({ removeChildren } as unknown as Container, darkTheme);
    overlay.setHighlight(['a1', 'b1'], 'deploy');
    overlay.setHighlight(['b1', 'a1', 'a1'], 'deploy');
    expect(removeChildren).toHaveBeenCalledTimes(1);
    overlay.setHighlight([], 'deploy');
    expect(removeChildren).toHaveBeenCalledTimes(2);
  });
});
