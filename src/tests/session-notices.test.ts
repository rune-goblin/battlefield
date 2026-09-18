import { describe, expect, it } from 'vitest';
import { ACTIVITY_NOTICE, DECISION_NOTICE, noticesFor, TURN_NOTICE } from '../app/session-notices.js';
import { createBattle, type BattleState, type UnitCard } from '../engine/index.js';
import type { SideControl } from '../runtime/control.js';
import type { BattleEvent } from '../runtime/events.js';
import type { InteractionRecord } from '../runtime/interactions.js';
import { freshSession, type BattleSession } from '../runtime/session.js';
import { openBoard } from './helpers.js';

const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };
const kobolds: UnitCard = { name: 'Kobolds', level: 3, role: 'infantry', tactics: [] };

const battleState = (): BattleState => createBattle({
  board: openBoard(),
  units: [
    { card: infantry, side: 'attacker', square: 'c2' },
    { card: kobolds, side: 'defender', square: 'c7' },
  ],
});

const control: SideControl = {
  mode: 'manual',
  gmSide: 'attacker',
  seats: { attacker: ['alice'], defender: ['bob'] },
  next: { attacker: 0, defender: 0 },
};

const base: BattleSession = { ...freshSession(), control, stage: 'battle', battle: battleState() };
const moved: BattleEvent[] = [{ id: 'cmd-1:0', type: 'unitMoved', unit: 'u0', from: 'c2', to: 'c3', route: ['c2', 'c3'] }];

describe('session notices', () => {
  it('reads "Your turn" for the holder and the holder\'s name for everyone else', () => {
    const next: BattleSession = { ...base, turn: 'alice' };

    const holder = noticesFor(null, next, { userId: 'alice', isGm: false });
    const other = noticesFor(null, next, { userId: 'bob', isGm: false });

    expect(holder.show.find((n) => n.id === TURN_NOTICE)?.title).toBe('Your turn');
    expect(other.show.find((n) => n.id === TURN_NOTICE)?.message).toContain('alice');
  });

  it("raises no activity notice for a viewer's own commit", () => {
    const previous: BattleSession = { ...base, revision: 1 };
    const next: BattleSession = { ...base, revision: 2, lastCommit: { commandId: 'cmd-1', events: moved, dice: [], userId: 'alice' } };

    const own = noticesFor(previous, next, { userId: 'alice', isGm: false });
    const other = noticesFor(previous, next, { userId: 'bob', isGm: false });

    expect(own.show.find((n) => n.id === ACTIVITY_NOTICE)).toBeUndefined();
    expect(other.show.find((n) => n.id === ACTIVITY_NOTICE)).toBeDefined();
  });

  it('raises no activity notice across a revision jump', () => {
    const previous: BattleSession = { ...base, revision: 1 };
    const next: BattleSession = { ...base, revision: 4, lastCommit: { commandId: 'cmd-1', events: moved, dice: [], userId: 'bob' } };

    const notices = noticesFor(previous, next, { userId: 'alice', isGm: false });

    expect(notices.show.find((n) => n.id === ACTIVITY_NOTICE)).toBeUndefined();
  });

  it('dismisses the decision notice once its interaction closes', () => {
    const opening: InteractionRecord = {
      id: 'int-1', kind: 'army.readiness', initiator: 'bob', participants: ['attacker', 'defender'],
      scope: { stage: 'setup', day: null }, status: 'open', submissions: { defender: true },
    };
    const withOpen: BattleSession = { ...base, stage: 'setup', battle: null, interactions: [opening] };
    const withClosed: BattleSession = { ...withOpen, interactions: [{ ...opening, status: 'closed' }] };

    const opened = noticesFor(null, withOpen, { userId: 'alice', isGm: false });
    const closed = noticesFor(withOpen, withClosed, { userId: 'alice', isGm: false });

    expect(opened.show.find((n) => n.id === DECISION_NOTICE)).toBeDefined();
    expect(closed.show.find((n) => n.id === DECISION_NOTICE)).toBeUndefined();
    expect(closed.dismiss).toContain(DECISION_NOTICE);
  });
});
