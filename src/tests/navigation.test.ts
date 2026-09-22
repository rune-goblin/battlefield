import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  game: { battle: null, battleId: 'setup', setup: { board: {} } },
  ready: { attacker: false, defender: false },
}));

vi.mock('../app/game.svelte.js', () => ({
  game: state.game,
  sideReady: (side: 'attacker' | 'defender') => state.ready[side],
  onRecord: () => {},
  declaredReady: () => false,
  declareReady: vi.fn(), endBattle: vi.fn(), loadBattle: vi.fn(),
  resetSetup: vi.fn(), startBattle: vi.fn(),
}));
vi.mock('../app/viewer.svelte.js', () => ({ viewer: { isGm: true } }));

beforeEach(() => {
  vi.resetModules();
  state.ready.attacker = false;
  state.ready.defender = false;
});

describe('deployment navigation', () => {
  it('takes Sides to the defenders and keeps the attacker step closed until they finish', async () => {
    const { nav, goToStage, forward, stageReason } = await import('../app/navigation.svelte.js');
    goToStage('sides');
    forward().go();
    expect(nav.stage).toBe('defenders');
    expect(forward().enabled).toBe(false);
    expect(stageReason('attackers')).toBe('Place every defender first');
    goToStage('attackers');
    expect(nav.stage).toBe('defenders');

    state.ready.defender = true;
    expect(forward().enabled).toBe(true);
    forward().go();
    expect(nav.stage).toBe('attackers');
    expect(forward().enabled).toBe(false);
    state.ready.attacker = true;
    forward().go();
    expect(nav.stage).toBe('summary');
  });

  it.each([
    [false, false, 'defenders'],
    [true, false, 'defenders'],
    [false, true, 'attackers'],
    [true, true, 'summary'],
  ] as const)('resumes attacker-ready=%s, defender-ready=%s at %s', async (attacker, defender, expected) => {
    state.ready.attacker = attacker;
    state.ready.defender = defender;
    const { nav } = await import('../app/navigation.svelte.js');
    expect(nav.stage).toBe(expected);
  });

  it('returns to the defenders from the attacker step without clearing the formation', async () => {
    state.ready.defender = true;
    const { nav, back, forward } = await import('../app/navigation.svelte.js');
    expect(nav.stage).toBe('attackers');
    back();
    expect(nav.stage).toBe('defenders');
    expect(state.ready.defender).toBe(true);
    forward().go();
    expect(nav.stage).toBe('attackers');
  });

  it('returns from review to unfinished defenders before allowing attacker deployment', async () => {
    const { nav, goToStage, back } = await import('../app/navigation.svelte.js');
    goToStage('summary');
    back();
    expect(nav.stage).toBe('defenders');
  });
});
