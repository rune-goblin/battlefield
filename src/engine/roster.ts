import type { UnitCard } from './cards.js';

export const ROSTER: UnitCard[] = [
  { name: 'Peasant Levy', level: 1, role: 'infantry', tactics: [], overrides: { defence: 13, will: 4 } },
  { name: 'Town Watch', level: 2, role: 'infantry', tactics: ['raise-shields'] },
  { name: 'Slingers', level: 3, role: 'infantry', salvo: 'close', tactics: ['false-retreat'] },
  { name: 'Longbowmen', level: 4, role: 'infantry', salvo: 'long', pace: false, tactics: ['covering-fire'] },
  { name: 'Light Horse', level: 5, role: 'cavalry', salvo: 'close', tactics: ['false-retreat'] },
  { name: 'Shield Wall', level: 6, role: 'infantry', tactics: ['raise-shields', 'shield-block', 'defend-allies'] },
  { name: 'Knights', level: 7, role: 'cavalry', tactics: ['cavalry-charge'] },
  { name: 'Ogre Warband', level: 8, role: 'infantry', fear: true, pace: true, tactics: [] },
  { name: 'Veteran Pikes', level: 9, role: 'infantry', tactics: ['reactive-attack', 'feint'] },
  { name: 'Wyvern Riders', level: 12, role: 'cavalry', fear: true, salvo: 'long', tactics: ['ambush'] },
  { name: 'Giant Vanguard', level: 14, role: 'infantry', fear: true, pace: true, tactics: ['demoralize'] },
];
