import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockUnit { side: 'attacker' | 'defender'; faction?: string; square: string | null }

const state = vi.hoisted(() => ({
  game: { battle: null as object | null, battleId: 'setup', setup: { board: {}, units: [] as MockUnit[] } },
  ready: { attacker: false, defender: false },
  recordListeners: [] as (() => void)[],
}));

vi.mock('../app/game.svelte.js', () => ({
  game: state.game,
  sideReady: (side: 'attacker' | 'defender') => state.ready[side],
  onRecord: (listener: () => void) => { state.recordListeners.push(listener); },
  declaredReady: () => false,
  declareReady: vi.fn(), endBattle: vi.fn(), loadBattle: vi.fn(),
  resetSetup: vi.fn(), startBattle: vi.fn(),
}));
vi.mock('../app/viewer.svelte.js', () => ({ viewer: { isGm: true } }));

beforeEach(() => {
  vi.resetModules();
  state.ready.attacker = false;
  state.ready.defender = false;
  state.game.battle = null;
  state.game.battleId = 'setup';
  state.game.setup.units = [];
  state.recordListeners.length = 0;
});

/** What `bindClient` does after navigation has opened on the placeholder: the store adopts the
 * saved record, another battle, and tells its listeners. */
function bind(battleId: string, record: { battle?: object; units?: MockUnit[] }) {
  state.game.battleId = battleId;
  state.game.battle = record.battle ?? null;
  state.game.setup.units = record.units ?? [];
  for (const listener of state.recordListeners) listener();
}

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

  it('resumes a browser save with chosen, unplaced armies on the defenders', async () => {
    const { nav, resume } = await import('../app/navigation.svelte.js');
    bind('saved', {
      units: [
        { side: 'defender', faction: 'Kingdom', square: null },
        { side: 'attacker', faction: 'Raiders', square: null },
      ],
    });
    expect(nav.stage).toBe('sides');

    resume();

    expect(nav.stage).toBe('defenders');
    expect(nav.visited).toEqual(['board', 'paint', 'siege', 'sides', 'defenders']);
  });

  it('resumes a browser save with a battle under way on the battle, every step visited', async () => {
    const { nav, resume } = await import('../app/navigation.svelte.js');
    bind('saved', { battle: {} });
    expect(nav.visited).not.toContain('summary');

    resume();

    expect(nav.stage).toBe('battle');
    expect(nav.visited).toEqual(['board', 'paint', 'siege', 'sides', 'defenders', 'attackers', 'summary', 'battle']);
  });

  it('begins the battle with a single startBattle call and no readiness declaration', async () => {
    const { beginBattle } = await import('../app/navigation.svelte.js');
    const { startBattle, declareReady } = await import('../app/game.svelte.js');
    vi.mocked(startBattle).mockResolvedValue({ ok: true, commandId: 'cmd-1', revision: 1 });

    await beginBattle();

    expect(startBattle).toHaveBeenCalledTimes(1);
    expect(declareReady).not.toHaveBeenCalled();
  });
});
