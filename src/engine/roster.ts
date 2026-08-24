import type { UnitCard } from './cards.js';

export const ROSTER: UnitCard[] = [
  { name: 'Peasant Militia', level: 1, role: 'levy' },
  { name: 'Town Militia', level: 2, role: 'levy', tactics: ['raise-shields'] },
  { name: 'Kobold Warriors', level: 3, role: 'skirmisher', overrides: { defence: 18, strike: 7, volley: 7, will: 9, perception: 9 }, pace: false },
  { name: 'Ragtag Archers', level: 3, role: 'archers' },
  { name: 'Bandit Irregulars', level: 4, role: 'skirmisher', tactics: ['dirty-fighting', 'false-retreat'] },
  { name: 'Wolf Pack', level: 4, role: 'monster', fear: false },
  { name: 'Basic Skirmishers', level: 5, role: 'skirmisher' },
  { name: 'Line Infantry', level: 6, role: 'infantry', overrides: { defence: 24, strike: 11, volley: 11, reach: 'long', will: 13, perception: 13 }, tactics: ['raise-shields', 'shield-block'] },
  { name: 'Dwarf Battalion', level: 6, role: 'infantry', tactics: ['raise-shields', 'shield-block', 'defend-allies'] },
  { name: 'Goblin Bombardiers', level: 6, role: 'archers', tactics: ['covering-fire'] },
  { name: 'Heavy Cavalry', level: 7, role: 'cavalry', overrides: { defence: 25, strike: 12, will: 14, perception: 14 }, tactics: ['cavalry-charge'] },
  { name: 'Centaur Scouts', level: 7, role: 'skirmisher', tactics: ['false-retreat', 'ambush'] },
  { name: 'Troll Marauders', level: 8, role: 'monster', overrides: { defence: 25, strike: 13, will: 11, perception: 15 } },
  { name: 'Veteran War Priests', level: 8, role: 'infantry', tactics: ['battlefield-medicine', 'demoralize'] },
  { name: 'Engineering Corps', level: 8, role: 'siege' },
  { name: 'Berserkers', level: 9, role: 'infantry', tactics: ['feint', 'dirty-fighting'] },
  { name: 'Frost Giant Warriors', level: 11, role: 'monster' },
  { name: 'Wyvern Flight', level: 12, role: 'monster', tactics: ['ambush'] },
  { name: 'Mammoth Riders', level: 13, role: 'cavalry', fear: true },
];
