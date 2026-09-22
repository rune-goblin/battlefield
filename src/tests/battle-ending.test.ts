import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { battleOutcome, createBattleEnding, outcomeArt } from '../app/battle/battle-ending.js';
import { freshControl, hotSeatControl, type SideControl } from '../runtime/control.js';
import type { Side } from '../engine/index.js';

describe('battle ending presentation', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  function scene() {
    const publish = vi.fn();
    let remaining = 0;
    const ending = createBattleEnding(() => remaining, publish);
    ending.update('battle:1', false);
    return { ending, publish, effects: (ms: number) => { remaining = ms; } };
  }

  it('finishes movement, effects and results, waits two seconds, then announces before opening the report', () => {
    const { ending, publish, effects } = scene();
    effects(Infinity);
    ending.update('battle:1', true);
    vi.advanceTimersByTime(5000);
    expect(publish).toHaveBeenLastCalledWith('waiting');
    effects(800);
    vi.advanceTimersByTime(800);
    expect(publish).toHaveBeenLastCalledWith('waiting');
    effects(0);
    vi.advanceTimersByTime(100); // First quiet frame.
    vi.advanceTimersByTime(1999);
    expect(publish).toHaveBeenLastCalledWith('waiting');
    vi.advanceTimersByTime(1);
    expect(publish).toHaveBeenLastCalledWith('announcement');
    expect(vi.getTimerCount()).toBe(0);
    ending.announcementFinished();
    expect(publish).toHaveBeenLastCalledWith('report');
  });

  it('restarts the quiet interval when a delayed result appears', () => {
    const { ending, publish, effects } = scene();
    ending.update('battle:1', true);
    vi.advanceTimersByTime(1500);
    effects(500);
    vi.advanceTimersByTime(500);
    effects(0);
    vi.advanceTimersByTime(2000);
    expect(publish).toHaveBeenLastCalledWith('waiting');
    vi.advanceTimersByTime(100);
    expect(publish).toHaveBeenLastCalledWith('announcement');
  });

  it('preserves the delay across unrelated record updates', () => {
    const { ending, publish } = scene();
    ending.update('battle:1', true);
    vi.advanceTimersByTime(1000);
    ending.update('battle:1', true);
    vi.advanceTimersByTime(1100);
    expect(publish).toHaveBeenLastCalledWith('announcement');
  });

  it.each([500, 2200])('cancels on undo at %i ms and plays a later ending', elapsed => {
    const { ending, publish } = scene();
    ending.update('battle:1', true);
    vi.advanceTimersByTime(elapsed);
    ending.update('battle:1', false);
    ending.announcementFinished();
    vi.advanceTimersByTime(10000);
    expect(publish).toHaveBeenLastCalledWith('playing');
    expect(vi.getTimerCount()).toBe(0);
    ending.update('battle:1', true);
    vi.advanceTimersByTime(2100);
    expect(publish).toHaveBeenLastCalledWith('announcement');
  });

  it('opens an existing ended battle directly at its report', () => {
    const publish = vi.fn();
    const ending = createBattleEnding(() => 0, publish);
    ending.update('saved:1', true);
    expect(publish).toHaveBeenLastCalledWith('report');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels when another battle or day opens', () => {
    const { ending, publish } = scene();
    ending.update('battle:1', true);
    ending.update('battle:2', false);
    vi.advanceTimersByTime(10000);
    expect(publish).toHaveBeenLastCalledWith('playing');
    ending.update('saved:1', true);
    expect(publish).toHaveBeenLastCalledWith('report');
  });

  it('releases timers on unmount and ignores late animation events', () => {
    const { ending, publish } = scene();
    ending.update('battle:1', true);
    ending.dispose();
    publish.mockClear();
    vi.advanceTimersByTime(10000);
    ending.announcementFinished();
    expect(publish).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('battle outcome perspective', () => {
  const control: SideControl = { ...freshControl(), seats: { attacker: ['gm'], defender: ['player'] } };
  const result = (winner: Side | 'draw' | null, seats = control, viewer = 'player') =>
    battleOutcome({ winner, endedBy: 'rout' }, seats, 'gm', viewer);

  it('shows the players’ victory or defeat to the whole table', () => {
    for (const viewer of ['player', 'gm', 'spectator']) {
      expect(result('defender', control, viewer)).toBe('Victory');
      expect(result('attacker', control, viewer)).toBe('Defeat');
    }
  });

  it('uses manual seats when players own the attacking side', () => {
    const manual: SideControl = { ...control, mode: 'manual', seats: { attacker: ['player', 'gm'], defender: [] } };
    expect(result('attacker', manual)).toBe('Victory');
    expect(result('defender', manual)).toBe('Defeat');
  });

  it('gives opposing players their own result and spectators the winner', () => {
    const pvp: SideControl = { ...control, seats: { attacker: ['alice'], defender: ['bob'] } };
    expect(result('attacker', pvp, 'alice')).toBe('Victory');
    expect(result('attacker', pvp, 'bob')).toBe('Defeat');
    expect(result('attacker', pvp, 'gm')).toBe('Attackers win');
  });

  it('names the winning side for shared hot-seat games', () => {
    expect(result('attacker', hotSeatControl('gm'), 'gm')).toBe('Attackers win');
    expect(result('defender', hotSeatControl('gm'), 'gm')).toBe('Defenders win');
  });

  it('gives drawn and unfinished battles their own labels', () => {
    expect(result('draw')).toBe('Draw');
    expect(battleOutcome({ winner: null, endedBy: 'dusk' }, control, 'gm', 'player')).toBe('Day complete');
    expect(result(null)).toBe('Battle complete');
  });

  it('matches the artwork to the player result and keeps draws neutral', () => {
    expect(outcomeArt(result('defender'))).toBe('victory');
    expect(outcomeArt(result('attacker'))).toBe('defeat');
    expect(outcomeArt(result('attacker', hotSeatControl('gm'), 'gm'))).toBe('victory');
    expect(outcomeArt(result('draw'))).toBeNull();
    expect(outcomeArt(result(null))).toBeNull();
  });
});
