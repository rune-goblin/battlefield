import { assetUrl } from '../board/index.js';

const BATTLE_LINES = ['standards', 'pressure', 'bowmen'];
const OUTCOMES = {
  victory: ['victory', 'victory-celebrating-soldiers', 'victory-standard-over-the-fallen', 'victory-triumphant-rally'],
  defeat: ['defeat', 'defeat-broken-standard', 'defeat-fallen-allies', 'defeat-wounded-soldiers'],
};

const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];
const sceneUrl = (name: string) => assetUrl(`art/scenes/${name}.webp`);

// proto: each client rolls its own; a shared seat may see a different scene from the GM.
/** Chosen once per page load, so the empty board keeps one scene across stage switches. */
export const openingScene = sceneUrl(`battle-lines-${pick(BATTLE_LINES)}`);

export function outcomeScene(kind: keyof typeof OUTCOMES): string {
  return sceneUrl(pick(OUTCOMES[kind]));
}
