import './install-asset-base.js';
import { blockPageZoom } from '../../app/app-root.js';
import { reportAuthority } from '../../app/authority.svelte.js';
import { freshSession } from '../../runtime/session.js';
import { BattlefieldApp } from './BattlefieldApp.js';
import { foundryChatPoster } from './chat.js';
import { foundryDice } from './foundryDice.js';
import { createBattlefieldHost, type BattlefieldHost } from './host.js';
import { MODULE_ID } from './module-id.js';
import { createSessionWatcher } from './sessionWatcher.js';
import { foundrySocketChannel } from './socket.js';
import { foundryTableUsers } from './table.js';
import { announceThroughHost, createTurnAnnouncer } from './turnNotice.js';
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
    dice: foundryDice(),
    chat: foundryChatPoster(),
    onAuthority: reportAuthority,
  });
  channel.on((message) => host?.handleMessage(message));
  sessionWatcher.subscribe(createTurnAnnouncer({
    viewer: () => ({ userId: users.currentUserId(), isGm: users.primaryGmId() === users.currentUserId() }),
    visible: () => BattlefieldApp.visible,
    notify: announceThroughHost,
  }));
});

Hooks.once('ready', () => {
  sessionWatcher.handleChange(game.settings.get(MODULE_ID, SESSION_SETTING));
  void host?.refresh();
});

// `activeGM` moves when a GM connects or drops, and every client hears it: the new primary
// loads the committed session, and the rest start sending their commands to it. The same event
// changes who is online, which is what the seating is rebuilt from.
Hooks.on('userConnected', () => { void host?.refresh(); });

// A user added to the world, renamed, or removed is a new roster for the seating to fit.
Hooks.on('createUser', () => { void host?.reseat(); });
Hooks.on('updateUser', () => { void host?.reseat(); });
Hooks.on('deleteUser', () => { void host?.reseat(); });

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
