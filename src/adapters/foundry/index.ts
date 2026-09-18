import './install-asset-base.js';
import { blockPageZoom } from '../../app/app-root.js';
import { reportAuthority } from '../../app/authority.svelte.js';
import { freshSession } from '../../runtime/session.js';
import { BattlefieldApp } from './BattlefieldApp.js';
import { createBattlefieldHost, type BattlefieldHost } from './host.js';
import { MODULE_ID } from './module-id.js';
import { createSessionWatcher } from './sessionWatcher.js';
import { foundrySocketChannel } from './socket.js';
import { foundryTableUsers } from './table.js';
import { createFoundryArchive } from './worldArchive.js';
import { createFoundrySessionRepository } from './worldSessionRepository.js';
import { registerFoundrySettings, SESSION_SETTING } from './worldSettings.js';
import './foundry.css';
import '../../app/app.css';

// proto: seeded fresh; the setting's own value arrives at `ready`, where the host loads it.
export const sessionWatcher = createSessionWatcher(freshSession());

/** The primary GM's executor, or this client's line to it. Built at `ready`, once the settings
 * are registered and `game.users` can name the active GM. */
export let host: BattlefieldHost | null = null;

Hooks.once('init', () => {
  blockPageZoom();
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = { open: () => BattlefieldApp.open(), close: () => BattlefieldApp.close() };
  registerFoundrySettings((raw) => sessionWatcher.handleChange(raw));
  // Registered here, before `ready`, because Foundry replays the socket events it buffered
  // during startup. The host's readiness gate is what holds them until it can answer.
  const channel = foundrySocketChannel(MODULE_ID);
  const users = foundryTableUsers();
  host = createBattlefieldHost({
    users,
    channel,
    repository: createFoundrySessionRepository(),
    archive: createFoundryArchive(),
    records: (listener) => sessionWatcher.subscribe(listener),
    onAuthority: reportAuthority,
  });
  channel.on((message) => host?.handleMessage(message));
});

Hooks.once('ready', () => {
  sessionWatcher.handleChange(game.settings.get(MODULE_ID, SESSION_SETTING));
  void host?.refresh();
});

// `activeGM` moves when a GM connects or drops, and every client hears it: the new primary
// loads the committed session, and the rest start sending their commands to it.
Hooks.on('userConnected', () => { void host?.refresh(); });

Hooks.on('getSceneControlButtons', (controls) => {
  const tools = controls['tokens']?.tools;
  if (!tools) return;
  tools[MODULE_ID] = {
    name: MODULE_ID,
    title: 'Battlefield',
    icon: 'fa-solid fa-chess-rook',
    order: Object.keys(tools).length,
    button: true,
    onChange: () => void BattlefieldApp.open(),
  };
});
