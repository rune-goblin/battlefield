import { describe, expect, it } from 'vitest';
import { checkCardsOf, publishCommit, type ChatPoster } from '../adapters/foundry/chat.js';
import type { BattleEvent } from '../runtime/events.js';

function checkEvent(id: string, roll: number, text: string): BattleEvent {
  return { id, type: 'checkResolved', unit: 'u0', check: { roll, modifier: 4, total: roll + 4, dc: 15, degree: 'success' }, text, lands: { unit: 'u0', reads: 'check' } };
}

describe('checkCardsOf', () => {
  it('keeps only checkResolved events, one card each in order', () => {
    const events: BattleEvent[] = [
      { id: 'cmd:0', type: 'unitMoved', unit: 'u0', from: 'c2', to: 'c3', route: ['c2', 'c3'] },
      checkEvent('cmd:1', 14, 'Infantry attacks.'),
      checkEvent('cmd:2', 3, 'Infantry misses.'),
    ];

    expect(checkCardsOf(events)).toEqual([
      { eventId: 'cmd:1', content: 'Infantry attacks.', face: 14 },
      { eventId: 'cmd:2', content: 'Infantry misses.', face: 3 },
    ]);
  });

  it('posts troop abilities, with the save die where there was one', () => {
    const check = { roll: 15, modifier: 4, total: 19, dc: 18, degree: 'success' as const };
    const events: BattleEvent[] = [
      { id: 'cmd:0', type: 'abilityResolved', unit: 'u1', label: 'War Song', name: 'Fear', outcome: 'resisted', check, text: 'Orcs resist.' },
      { id: 'cmd:1', type: 'abilityResolved', unit: 'u0', label: 'Raise Shields', name: 'Guard', outcome: 'applied', check: null, text: 'Dwarves guard.' },
    ];

    expect(checkCardsOf(events)).toEqual([
      { eventId: 'cmd:0', content: 'Orcs resist.', face: 15 },
      { eventId: 'cmd:1', content: 'Dwarves guard.', face: null },
    ]);
  });

  it('yields nothing for a commit with no checks', () => {
    expect(checkCardsOf([{ id: 'cmd:0', type: 'activationEnded', unit: 'u0' }])).toEqual([]);
  });
});

describe('publishCommit', () => {
  it('posts one card per checkResolved event, stamped with its event ID', async () => {
    const posted: string[] = [];
    const poster: ChatPoster = { post: async (card) => { posted.push(card.eventId); } };

    await publishCommit([checkEvent('cmd:0', 12, 'a'), checkEvent('cmd:1', 19, 'b')], poster);

    expect(posted).toEqual(['cmd:0', 'cmd:1']);
  });
});
