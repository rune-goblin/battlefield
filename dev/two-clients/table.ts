// proto: a throwaway table for the dev page alone — a real host wires createRuntime through its
// own repository, archive, and presence adapters, not these in-memory stand-ins.
import { COMBATANTS, OFFICIAL, createBattle, generateBoard, type Side, type UnitCard } from '../../src/engine/index.js';
import { createLocalArchive } from '../../src/adapters/browser/localArchive.js';
import type { WebStorage } from '../../src/adapters/browser/localRepository.js';
import { createMemoryNetwork, type MemoryLink, type MemoryNetwork } from '../../src/adapters/memory/memoryTransport.js';
import { createRuntime, type Runtime } from '../../src/runtime/createRuntime.js';
import { openTurn, type SideControl } from '../../src/runtime/control.js';
import type { PresencePort, SessionRepository } from '../../src/runtime/ports.js';
import { createClientStore, type ClientStore } from '../../src/runtime/reconcile.js';
import { defaultSetup, freshSession, type BattleSession } from '../../src/runtime/session.js';

export const GM = 'gm';
export const ALICE = 'alice';
export const BOB = 'bob';

const presence: PresencePort = {
  online: () => true, gmUserId: () => GM, users: () => [GM, ALICE, BOB], displayName: (id) => id,
};

function memoryStorage(): WebStorage {
  const items: Record<string, string> = {};
  return {
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => { items[key] = value; },
    removeItem: (key) => { delete items[key]; },
  };
}

function memoryRepository(seed: BattleSession): SessionRepository {
  let last = seed;
  return {
    async load() { return last; },
    async save(next) { last = structuredClone(next); },
  };
}

const card = (name: string): UnitCard => [...COMBATANTS, ...OFFICIAL].find((c) => c.name === name)!;

/** One seat a side, on the roster and board every fresh session already starts from, so a
 * generated board never lands water on a deploy rank. Manual seating skips the auto split,
 * which would put every non-GM user on the one side nobody plays here. */
function tableSession(): BattleSession {
  const draft = defaultSetup();
  const board = generateBoard(draft.spec);
  const battle = createBattle({
    board,
    units: draft.units.map((u) => ({ card: u.card, side: u.side as Side, square: u.square! })),
  });
  const seated: SideControl = {
    mode: 'manual', gmSide: 'attacker',
    seats: { attacker: [ALICE], defender: [BOB] }, next: { attacker: 0, defender: 0 },
  };
  // The real executor opens the first turn inside the commit that starts the battle; this
  // session is handed to the runtime already running, so the same rule runs once up front.
  const { holder, control } = openTurn(seated, battle.pending, presence);
  return { ...freshSession(), stage: 'battle', battle, control, turn: holder };
}

export interface Table {
  authority: Runtime;
  net: MemoryNetwork;
  alice: ClientStore;
  aliceLink: MemoryLink;
  bob: ClientStore;
  bobLink: MemoryLink;
}

export function createTable(): Table {
  const session = tableSession();
  const authority = createRuntime({
    repository: memoryRepository(session),
    archive: createLocalArchive(memoryStorage()),
    session,
    policy: { userId: GM, presence },
  });
  const net = createMemoryNetwork(authority);
  const aliceLink = net.connect();
  const bobLink = net.connect();
  const alice = createClientStore({ transport: aliceLink, userId: ALICE, session: structuredClone(session) });
  const bob = createClientStore({ transport: bobLink, userId: BOB, session: structuredClone(session) });
  return { authority, net, alice, aliceLink, bob, bobLink };
}
