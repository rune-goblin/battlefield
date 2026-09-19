import { describe, expect, it } from 'vitest';
import { createNotificationService, type Notification } from '../app/notifications.js';
import { createPresentation } from '../app/presentation.js';
import { DECISION_NOTICE, noticesFor } from '../app/session-notices.js';
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
  it('dismisses the decision notice once its interaction closes', () => {
    const opening: InteractionRecord = {
      id: 'int-1', kind: 'army.readiness', initiator: 'bob', participants: ['attacker', 'defender'],
      scope: { stage: 'setup', day: null }, status: 'open', submissions: { defender: true },
    };
    const withOpen: BattleSession = { ...base, stage: 'setup', battle: null, interactions: [opening] };
    const withClosed: BattleSession = { ...withOpen, interactions: [{ ...opening, status: 'closed' }] };

    const opened = noticesFor(withOpen, { userId: 'alice', isGm: false });
    const closed = noticesFor(withClosed, { userId: 'alice', isGm: false });

    expect(opened.show.find((n) => n.id === DECISION_NOTICE)).toBeDefined();
    expect(closed.show.find((n) => n.id === DECISION_NOTICE)).toBeUndefined();
    expect(closed.dismiss).toContain(DECISION_NOTICE);
  });
});
