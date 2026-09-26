import { describe, expect, it } from 'vitest';
import { requestFromSite, type BattleSite } from '../adapters/reignmaker/battleSite.js';
import type { KingdomArmy } from '../adapters/reignmaker/kingdomArmies.js';
import { battleRequestProblems } from '../runtime/campaign.js';

const army = (name: string, ledBy: string, leaderName: string): KingdomArmy =>
  ({ armyId: `army-${name}`, name, level: 3, actorId: `actor-${name}`, ledBy, leaderName });

const read = (a: KingdomArmy) => (a.name === 'Ghosts' ? null : {
  card: { name: 'Troop', level: a.level, role: 'infantry' as const, tactics: [] },
  source: { actorUuid: `Actor.${a.actorId}`, baseline: { hitPoints: 30, maxHitPoints: 30, demoralized: 0 } },
});

const site = (claimedBy: string | null, armies: KingdomArmy[]): BattleSite =>
  ({ hexId: '5.12', terrain: 'forest', claimedBy, fortificationTier: 0, armies });

const sides = (s: BattleSite) => Object.fromEntries(requestFromSite(s, read, 1).request.units.map((u) => [u.card.name, u.side]));

describe('a ReignMaker hex as a battle request', () => {
  it('has the holder of the hex defend', () => {
    const held = site('faction-pitax', [army('First', 'player', 'Narland'), army('Wardens', 'faction-pitax', 'Pitax')]);

    expect(sides(held)).toEqual({ First: 'attacker', Wardens: 'defender' });
    expect(requestFromSite(held, read, 1).request.gmSide).toBe('defender');
  });

  it('has the player kingdom defend its own ground, against every other banner', () => {
    const home = site('player', [
      army('First', 'player', 'Narland'), army('Raiders', 'faction-a', 'Tiger Lords'), army('Wolves', 'faction-b', 'Drelev'),
    ]);

    expect(sides(home)).toEqual({ First: 'defender', Raiders: 'attacker', Wolves: 'attacker' });
  });

  it('has the player kingdom attack on ground nobody holds', () => {
    expect(sides(site(null, [army('Wolves', 'faction-b', 'Drelev'), army('First', 'player', 'Narland')])))
      .toEqual({ Wolves: 'defender', First: 'attacker' });
  });

  it('builds a request the runtime accepts, and names the armies it could not read', () => {
    const built = requestFromSite(site('player', [army('First', 'player', 'Narland'), army('Ghosts', 'faction-a', 'Tiger Lords')]), read, 7);

    expect(battleRequestProblems(built.request)).toEqual([]);
    expect(built.skipped).toEqual(['Ghosts']);
    expect(built.request.units[0]).toMatchObject({ faction: 'Narland', source: { campaignId: 'army-First' } });
  });
});
