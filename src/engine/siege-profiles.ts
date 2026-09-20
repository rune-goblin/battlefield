/** Battlefield translations of data/siege-weapons. Distances are formation hexes,
 * wounds are the four-box troop track, and penetration subtracts wall hardness. */
export type SiegeShape = 'single' | 'burst' | 'wide' | 'line' | 'cone' | 'wall';
export type SiegeEffect = 'persistent' | 'snare' | 'stun' | 'expose' | 'push' | 'pull' | 'nullify' | 'rough' | 'web' | 'sicken';
export interface SiegeMode {
  label: string;
  cost: number;
  shape: SiegeShape;
  damage: number;
  penetration?: number;
  effect?: SiegeEffect;
  highAngle?: boolean;
  ignites?: boolean;
  minimum?: number;
  groundOnly?: boolean;
  waterOnly?: boolean;
  cavalryOnly?: boolean;
}
const shot = (label = 'Crushing shot', damage = 2): SiegeMode => ({ label, cost: 2, shape: 'single', damage });
const burst = (label = 'Bombard', effect?: SiegeEffect, wide = false): SiegeMode => ({ label, cost: wide ? 2 : 1, shape: wide ? 'wide' : 'burst', damage: 1, effect });
const line = (label: string, effect?: SiegeEffect): SiegeMode => ({ label, cost: 2, shape: 'line', damage: 1, effect });
const cone = (label: string, effect?: SiegeEffect): SiegeMode => ({ label, cost: 2, shape: 'cone', damage: 1, effect });
const breach = (penetration = 1, damage = 2, label = 'Breach wall'): SiegeMode => ({ label, cost: 2, shape: 'wall', damage, penetration });
const lob = (label = 'High-angle bombard', wide = false): SiegeMode => ({ ...burst(label, undefined, wide), highAngle: true, minimum: 2 });
const ram = (penetration = 1, damage = 2): SiegeMode[] => [breach(penetration, damage, 'Ram wall')];
const cannon = (): SiegeMode[] => [shot(), breach()];
const catapult = (): SiegeMode[] => [burst(), shot(), breach()];
const flame = (): SiegeMode[] => [{ ...line('Flame jet', 'persistent'), ignites: true }, { ...cone('Flame sweep', 'persistent'), ignites: true }];

/** Every imported actor has an explicit translation. Shared modes preserve weapon families. */
export const SIEGE_PROFILES: Record<string, SiegeMode[]> = {
  'Alchemical Springald': [burst('Alchemical barrage', 'persistent'), shot('Concentrated flasks')],
  'Anesthetizing Jaws': [{ ...shot('Clamping jaws', 1), effect: 'snare' }, { ...shot('Anesthetic surge', 0), effect: 'stun' }],
  'Aquatic Disintegrator': [{ ...burst('Underwater shock', 'stun', true), waterOnly: true }],
  'Arcane Ram': [breach(2, 2, 'Force ram')],
  'Ballista': cannon(),
  'Battering Ram': ram(),
  'Blasting Horn': [cone('Thunderous blast', 'stun'), breach(1, 2, 'Shatter masonry')],
  'Blasting Ram': ram(1, 3),
  'Blessed Onager': [lob('Hallowed bombard'), breach()],
  'Blob Paste Propulsor': [{ ...shot('Binding paste', 0), cost: 1, effect: 'snare' }],
  'Bolt Emitter': [{ ...shot('Arc bolt', 1), cost: 1, effect: 'expose' }],
  'Bombard': catapult(),
  'Burning Glass': [{ ...line('Solar beam', 'persistent'), damage: 2, cost: 3, ignites: true }, breach(2, 2, 'Melt wall')],
  'Cannon': cannon(),
  'Catapult': catapult(),
  'Clockwork Ballista': [shot('Clockwork bolt'), burst('Unfolding blades', 'rough')],
  'Corrupted Polyp': [{ ...lob('Corrupting bombard', true), effect: 'persistent' }, breach(2)],
  'Crossbow Catapult': catapult(),
  'Cyclonic Cannon': [line('Cyclonic lance'), breach(2, 2, 'Hardness-piercing shot')],
  'Door Ram': ram(1, 1),
  'Drilling Ram': [breach(1), { ...breach(2, 3, 'Drill through'), cost: 3 }],
  'Falconet': [{ ...shot('Round shot', 1), cost: 1 }, breach(1, 1)],
  "Fiend's Mouth Cannon": [shot('Devastating shot', 3), breach(2, 3)],
  'Firedrake': flame(),
  'Fists of Divinity': [line('Divine barrage'), { ...line('Overcharged barrage'), cost: 3, damage: 2 }, breach(2, 3)],
  'Flame Bellows': flame(),
  'Fleshforged Disgorger': [{ ...lob('Acid bombard', true), effect: 'persistent' }, breach(2)],
  'Flute Rocket': [lob('Rocket bombard', true), breach()],
  'Galvanic Sled': [line('Galvanic discharge', 'expose')],
  'Glacial Zephyr': [cone('Freezing gale', 'snare'), line('Ice lance', 'persistent')],
  'Great Bronze Cannon': [burst('Grand bombard', undefined, true), shot('Siege shot', 3), breach(2, 3)],
  'Harpoon Cannon': [{ ...shot('Hook and hold', 1), effect: 'snare' }, { ...shot('Reel in', 1), effect: 'pull' }],
  'Heavy Ballista': [shot('Heavy bolt', 3), breach(2)],
  'Heavy Bombard': [burst('Heavy bombard', undefined, true), shot('Crushing shot', 3), breach(2)],
  'Hwacha': [burst('Rocket barrage'), { ...burst('Full rack', undefined, true), cost: 3, damage: 2 }],
  'Hydraulic Cannon': [burst('Hydraulic burst', 'push'), shot('Focused water jet')],
  'Kickback Spring': [{ ...cone('Repulsing blast', 'push'), damage: 0 }],
  'Lashtail': [cone('Sweeping lash', 'expose'), { ...shot('Toppling lash', 1), effect: 'stun' }],
  'Long Cannon': [{ ...lob('Long-range bombard', true), minimum: 3 }, { ...breach(2, 3), minimum: 3 }],
  'Marking Powder Cannon': [{ ...burst('Mark targets', 'expose'), damage: 0 }],
  'Mortar': [lob('Mortar bombard'), breach()],
  'Mud Maker': [burst('Churn ground', 'rough'), breach(2, 2, 'Liquefy wall')],
  'Nullifier Sling': [burst('Dispel barrage', 'nullify')],
  'Pheromone Sprayer': [{ ...cone('Disorient mounts', 'stun'), damage: 0, cavalryOnly: true }, { ...line('Scatter mounts', 'expose'), damage: 0, cavalryOnly: true }],
  'Ribauldequin': [cone('Cannon fan'), shot('Concentrated volley')],
  'Seedpod Shooter': [burst('Sickening seedpods', 'sicken', true)],
  'Seismic Amplifier': [{ ...burst('Ground quake', 'stun', true), groundOnly: true }, breach(2, 2, 'Shake foundations')],
  'Shatterpult': [burst('Shattering barrage', 'rough'), breach()],
  'Sigilstone Slinger': [burst('Lingering sigils', 'persistent', true)],
  'Sonic Horn': [cone('Sonic shock', 'stun')],
  'Springald': [burst('Three-bolt spread'), shot('Focused bolt')],
  'Steam Artillery': [shot('Steam-driven shot'), breach()],
  'Tar Spitter': [line('Binding tar', 'snare'), cone('Corrosive tar', 'persistent')],
  'Teekdoon': [{ ...shot('Lofted stone', 1), cost: 1, highAngle: true }],
  'Trapdoor Actuator': [{ ...shot('Concealed strike', 1), highAngle: true }, { ...shot('Toppling strike', 1), effect: 'stun' }],
  'Trebuchet': [lob('Trebuchet bombard', true), { ...breach(2, 3), minimum: 2 }],
  'Volley Gun': [line('Raking volley'), shot('Concentrated volley', 3)],
  'Web Launcher': [{ ...burst('Web field', 'web'), damage: 0 }],
  'Wolf Fang': [breach(2, 2, 'Tear down wall')],
};

export const siegeModes = (name: string, kind: 'ram' | 'artillery'): SiegeMode[] =>
  SIEGE_PROFILES[name] ?? (kind === 'ram' ? ram() : cannon());

export function siegeDetail(m: SiegeMode): string {
  const area = { single: 'One unit', burst: 'Three hexes at a corner', wide: 'One hex and its neighbours', line: 'Three hexes in a straight line', cone: 'Three hexes in a fan', wall: 'One wall or gate' }[m.shape];
  const effect: Record<SiegeEffect, string> = {
    persistent: 'A hit causes 1 persistent damage', snare: 'A hit holds movement through the target’s next activation',
    stun: 'A hit removes 1 action from the next activation', expose: 'A hit exposes the target (−2 Defence) until its next activation',
    push: 'A hit pushes 1 hex away', pull: 'A hit pulls 1 hex closer', nullify: 'A hit removes magical buffs',
    rough: 'Creates difficult ground through next round', web: 'Creates difficult ground and a climb route across walls through next round; hits hold movement',
    sicken: 'A hit costs the target 1 Morale',
  };
  return [area, m.damage ? `${m.damage}/${Math.min(4, m.damage + 1)} ${m.shape === 'wall' ? 'structural damage' : 'damage'} on hit/critical` : 'No damage',
    m.penetration ? `bypass ${m.penetration} hardness` : '', m.effect ? effect[m.effect] : '',
    m.highAngle ? 'ignores cover' : '', m.minimum ? `minimum ${m.minimum} hexes` : '',
    m.waterOnly ? 'affects units in water or shallows' : '', m.groundOnly ? 'affects ground troops' : '', m.cavalryOnly ? 'affects cavalry' : '',
    !['single', 'wall'].includes(m.shape) ? 'friendly fire' : '',
  ].filter(Boolean).join(' · ');
}
