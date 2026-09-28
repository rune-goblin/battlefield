import { describe, expect, it } from 'vitest';
import type { UnitCard } from '../engine/index.js';
import { describeBattle } from '../adapters/reignmaker/mapMarkers.js';
import { freshSession, type BattleSession, type SetupUnit } from '../runtime/session.js';

const card = (name: string, level: number): UnitCard => ({ name, level, role: 'infantry', tactics: [] });
const unit = (id: string, name: string, side: SetupUnit['side'], faction?: string): SetupUnit => ({
  id, card: card(name, 2), side, square: null, engines: [], ...(faction ? { faction } : {}),
});

function siteWith(units: SetupUnit[]): BattleSession {
  const session = freshSession('battle-1');
  return { ...session, site: '4.7', setup: { ...session.setup, units } };
}

describe('describeBattle', () => {
  it('lists each side with its armies under their factions', () => {
    const popup = describeBattle(siteWith([
      unit('a', 'Pikes', 'attacker', 'Aldori'),
      unit('b', 'Archers', 'attacker', 'Aldori'),
      unit('c', 'Hired Blades', 'attacker', 'Free Company'),
      unit('d', 'Kobolds', 'defender'),
    ]));
    expect(popup.title).toBe('Battle');
    expect(popup.sections).toEqual([
      { heading: 'Standing', lines: ['The armies are still forming up.'] },
      { heading: 'Attacking army', lines: ['3 units · 6 levels', 'Aldori: Pikes, Archers', 'Free Company: Hired Blades'] },
      { heading: 'Defending army', lines: ['1 unit · 2 levels', 'Added by hand: Kobolds'] },
    ]);
  });

  it('leaves a side with no armies without faction lines', () => {
    const popup = describeBattle(siteWith([unit('a', 'Pikes', 'attacker', 'Aldori')]));
    expect(popup.sections[2]).toEqual({ heading: 'Defending army', lines: ['0 units · 0 levels'] });
  });
});
