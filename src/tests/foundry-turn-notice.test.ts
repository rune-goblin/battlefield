import { describe, expect, it } from 'vitest';
import { createTurnAnnouncer } from '../adapters/foundry/turnNotice.js';
import { freshSession, type BattleSession } from '../runtime/session.js';

const HOLDER = 'p1';

const recordAt = (revision: number, turn: string | null): BattleSession =>
  ({ ...freshSession(), revision, turn });

function announcerOn(window: { visible: boolean }) {
  const said: string[] = [];
  const announce = createTurnAnnouncer({
    viewer: () => ({ userId: HOLDER, isGm: false }),
    visible: () => window.visible,
    notify: (message) => said.push(message),
  });
  return { said, announce };
}

describe('the turn notice outside the app window', () => {
  it('announces the local user\'s own turn once while the window is away', () => {
    const window = { visible: false };
    const { said, announce } = announcerOn(window);

    announce(recordAt(1, HOLDER));
    announce(recordAt(2, HOLDER));

    expect(said).toEqual(['Your turn — Pick any available unit.']);
  });

  it('says nothing while the window is on screen', () => {
    const window = { visible: true };
    const { said, announce } = announcerOn(window);

    announce(recordAt(1, HOLDER));

    expect(said).toEqual([]);
  });

  it('says nothing for another user\'s turn', () => {
    const window = { visible: false };
    const { said, announce } = announcerOn(window);

    announce(recordAt(1, 'someone-else'));

    expect(said).toEqual([]);
  });

  it('announces the turn that opens while the window is away', () => {
    const window = { visible: true };
    const { said, announce } = announcerOn(window);

    announce(recordAt(1, 'someone-else'));
    window.visible = false;
    announce(recordAt(2, HOLDER));

    expect(said).toEqual(['Your turn — Pick any available unit.']);
  });
});
