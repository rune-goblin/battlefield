import { wallsFor, statusesOf, type BattleState, type Status, type Unit } from '../engine/index.js';
import { conditionWord } from './result-words.js';

export interface StatusEffect {
  status: Status;
  label: string;
  /** A debuff reads orange, a buff green, as the board's own words do. */
  tone: 'good' | 'warn';
  /** The count or DC the icon carries in its corner. */
  badge: string | null;
  text: string;
}

const sourceName = (state: BattleState, id: string | null): string =>
  state.units.find((u) => u.id === id)?.name ?? 'the shooter';

// The wording follows the modifier table in `public/rules.html`; a rule that changes there
// changes here.
const TEXT: Record<Status, (u: Unit, state: BattleState) => string> = {
  fortified: (u, s) => {
    const fort = wallsFor(s.board).fortifiedAt(u.square)!;
    const bonus = fort.cover === fort.maxCover ? `+${fort.cover}` : `+${fort.cover}–${fort.maxCover}`;
    return `${fort.label}. ${bonus} ranged cover when the attack crosses an intact, closed wall. Open gates, breaches, high-angle fire and attackers inside bypass that wall's cover. Use the highest cover or Guard bonus.`;
  },
  guard: (u) => `+${u.guard!.defence} Defence until this unit next activates.${u.guard!.cap ? ' Dug in: every hit against it caps at 1 damage.' : ''}${u.guard!.holds ? ' Under cover: it holds its ground against an Overrun.' : ''}`,
  pinned: (u, s) => `Held by ${sourceName(s, u.pinnedBy)} at its Salvo DC. It cannot Step or Charge; a Move away must beat that DC, and ends the pin.`,
  rooted: () => 'No Move, Step or Charge on its next activation.',
  suppressed: (u, s) => `−2 to everything the unit rolls and to its Defence until ${sourceName(s, u.suppressedBy)} next activates.`,
  stunned: () => 'One action fewer on its next activation.',
  frightened: () => '−1 to everything the unit rolls and to its Defence until the end of its next activation.',
  exposed: () => '−2 Defence after a critically failed Strike or a charge, until the unit acts again.',
  persistent: (u) => `1 damage at the end of its next activation, then Fortitude against DC ${u.persistent!.dc} or lose 1 Morale, as with any damage.`,
  aegis: (u) => `An attacker rolls Will against DC ${u.aegis!.dc} before it attacks; a failure wastes the attempt, actions and all. Ends once this unit has next acted.`,
  warded: () => 'The next attack against it rolls twice and the attacker keeps the worse. Spent by that attack, or once it has next acted.',
  stoneskin: () => 'Every hit against it caps at 1 damage and costs it no Morale, until it has next acted.',
  'sure-strike': () => 'Its next attack rolls twice and keeps the better. Spent by that attack, or at the end of its next activation.',
  wrath: () => 'Its next hit deals persistent damage: 1 damage at the end of the target\'s next activation.',
  hasted: (u) => `A fourth action on ${u.haste === 1 ? 'its next activation' : `each of its next ${u.haste} activations`}.`,
  'sure-footing': () => 'Every hex costs it 1 on its next activation, and it may charge through forest, rough ground, settlement, swamp and shallows, and uphill.',
  'burst-of-speed': () => '1 extra hex of movement on its next activation. Ordinary terrain costs apply, and the bonus expires when the activation ends.',
  inspired: () => '+2 on the unit\'s next roll of any kind.',
};

const BADGE: Partial<Record<Status, (u: Unit) => string>> = {
  guard: (u) => `+${u.guard!.defence}`,
  hasted: (u) => String(u.haste),
  aegis: (u) => String(u.aegis!.dc),
};

export const statusEffectsOf = (unit: Unit, state: BattleState): StatusEffect[] =>
  statusesOf(unit, state.board).map((status) => {
    const word = conditionWord(status);
    return {
      status, label: word.text, tone: word.tone === 'good' ? 'good' : 'warn',
      badge: BADGE[status]?.(unit) ?? null, text: TEXT[status](unit, state),
    };
  });
