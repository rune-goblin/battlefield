import './install-asset-base.js';
import { blockPageZoom, withinApp } from '../../app/app-root.js';
import { followArt } from '../../app/art-preload.js';
import { reportAuthority } from '../../app/authority.svelte.js';
import { bindClient, bindQuit, presenceChanged, tableChanged } from '../../app/game.svelte.js';
import { stage } from '../../app/stage-view.svelte.js';
import { brief } from '../../app/navigation.svelte.js';
import { bindRecovery } from '../../app/store-recovery.js';
import { createStoreRecovery } from '../store-recovery.js';
import { STORED_NAMES, type BattleSites } from '../../runtime/ports.js';
import { freshSession } from '../../runtime/session.js';
import { BattlefieldApp } from './BattlefieldApp.js';
import { pickBattleSite, reignMakerActive } from './battleSitePicker.js';
import { syncBattleMarkers } from './battleMarkers.js';
import { standingBattles } from '../reignmaker/mapMarkers.js';
import type { BattlefieldModuleApi } from './moduleApi.js';
import { foundryChatPoster } from './chat.js';
import { foundryDice } from './foundryDice.js';
import { createBattlefieldHost, type BattlefieldHost } from './host.js';
import { MODULE_ID } from './module-id.js';
import { createModuleApi } from './moduleApi.js';
import { createSessionWatcher } from './sessionWatcher.js';
import { foundrySocketChannel } from './socket.js';
import { foundryStoreClient } from './storeClient.js';
import { foundryPresence, foundryTableUsers } from './table.js';
import { foundryTroopSources } from './troopLibrary.js';
import { registerTroopSources } from '../../app/troop-library.svelte.js';
import { announceThroughHost, createTurnAnnouncer } from './turnNotice.js';
import { createFoundryArchive } from './worldArchive.js';
import { createTableCall, domReopenChip } from './tableCall.js';
import { createFoundrySites } from './worldSites.js';
import { createFoundrySessionRepository } from './worldSessionRepository.js';
import { createSiteLifecycle } from '../../services/SiteLifecycleService.js';
import { gameSettingStorage, registerFoundrySettings, SESSION_SETTING, TABLE_CALL_SETTING } from './worldSettings.js';
import './foundry.css';
import '../../app/app.css';
import { hostModule } from './hostModule.js';

// proto: seeded fresh; the setting's own value arrives at `ready`, where the host loads it.
export const sessionWatcher = createSessionWatcher(freshSession());

/** The primary GM's executor, or this client's line to it. Built at `ready`, once the settings
 * are registered and `game.users` can name the active GM. */
export let host: BattlefieldHost | null = null;

// proto: one generic line for every failure, until each has wording of its own.
function reportFailure(error: unknown): void {
  console.error('battlefield |', error);
  ui.notifications.error(`Battlefield hit an error: ${error instanceof Error ? error.message : String(error)}`);
}

const tableCall = createTableCall({
  storage: gameSettingStorage(TABLE_CALL_SETTING),
  isGm: () => game.user?.isGM === true,
  battle: () => ({ id: sessionWatcher.session.battleId, running: sessionWatcher.session.battle !== null }),
  windowOpen: () => BattlefieldApp.current !== null,
  openWindow: () => BattlefieldApp.open(),
  closeWindow: () => BattlefieldApp.close(),
  chip: domReopenChip(),
  onError: reportFailure,
});
BattlefieldApp.table = tableCall;

const recovery = createStoreRecovery({
  mayRepair: () => game.user?.isGM === true,
  onFlag: (record) => {
    if (game.user?.isGM !== true) return;
    // A window open already shows the in-app notice; the toast is for a GM who would
    // otherwise see nothing.
    if (BattlefieldApp.current !== null) return;
    // proto: wording.
    ui.notifications.error(`Battlefield cannot read the stored ${STORED_NAMES[record]}. Open Battlefield to export or clear it.`, { permanent: true });
  },
});

let markerSites: BattleSites | null = null;
const markBattles = syncBattleMarkers(() => markerSites && standingBattles(sessionWatcher.session, markerSites));

Hooks.once('init', () => {
  blockPageZoom();
  // Core's Escape closes every open window, the battle's included, and opens the main menu when
  // none closes. An Escape pressed inside the window belongs to the app, which steps back on it.
  game.keybindings.register(MODULE_ID, 'escapeInWindow', {
    name: 'Escape inside the Battlefield window',
    uneditable: [{ key: 'Escape', modifiers: [] }],
    onDown: ({ event }) => {
      const app = BattlefieldApp.current;
      // The app's own handler has run by now, and closing a dialog detaches the input the key
      // was typed in. The dispatch path still holds the window it came from.
      return app !== null && (event.composedPath().includes(app.element) || withinApp(event.target));
    },
    precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
  });
  const sites = createFoundrySites(undefined, recovery);
  markerSites = sites;
  const lifecycle = createSiteLifecycle({
    // The primary GM reads its own executor, which holds a commit before the setting delivers it.
    session: () => host?.runtime?.session ?? sessionWatcher.session,
    submit: (command) => (host ? host.submit(command) : Promise.reject(new Error('the battle module is still loading'))),
    sites,
    applyOutcome: () => {
      const runtime = host?.runtime;
      return runtime ? (outcome, revision) => runtime.applyOutcome(outcome, revision) : null;
    },
  });
  const module = hostModule(MODULE_ID);
  if (module) {
    module.api = createModuleApi({
      submit: () => { const client = host; return client ? (command) => client.submit(command) : null; },
      session: () => sessionWatcher.session,
      sites,
      lifecycle,
      open: () => BattlefieldApp.open(),
      close: () => BattlefieldApp.close(),
      callTable: async () => { await BattlefieldApp.open(); await tableCall.call(); },
      dismissTable: () => tableCall.dismiss(),
      brief,
      tableCalled: () => tableCall.called,
      screenOf: (cell) => {
        const point = stage.board?.screenOf(cell);
        const rect = document.querySelector(`#${MODULE_ID} canvas[aria-label="Battle board"]`)?.getBoundingClientRect();
        return point && rect ? { x: rect.left + point.x, y: rect.top + point.y } : null;
      },
      centerOn: (cell) => stage.board?.centerOn(cell),
    });
  }
  registerFoundrySettings(
    (raw) => sessionWatcher.handleChange(raw),
    (raw) => { tableCall.handleChange(raw); tableChanged(); },
    (record) => { recovery.recheck(record); if (record !== 'archive') markBattles(); },
  );
  // Registered here, before `ready`, because Foundry replays the socket events it buffered
  // during startup. The host's readiness gate is what holds them until it can answer.
  const channel = foundrySocketChannel(MODULE_ID);
  const users = foundryTableUsers();
  const archive = createFoundryArchive(undefined, undefined, recovery);
  host = createBattlefieldHost({
    users,
    channel,
    repository: createFoundrySessionRepository(undefined, recovery),
    archive,
    sites,
    records: (listener) => sessionWatcher.subscribe(listener),
    dice: foundryDice(),
    chat: foundryChatPoster(),
    onAuthority: reportAuthority,
    onError: reportFailure,
  });
  bindQuit(() => { BattlefieldApp.close().catch(reportFailure); });
  bindRecovery(recovery);
  bindClient(foundryStoreClient({ host, watcher: sessionWatcher, users, presence: foundryPresence(users), archive, table: tableCall, lifecycle }));
  channel.on((message) => host?.handleMessage(message));
  sessionWatcher.subscribe(() => tableCall.handleSession());
  sessionWatcher.subscribe(createTurnAnnouncer({
    viewer: () => ({ userId: users.currentUserId(), isGm: users.primaryGmId() === users.currentUserId() }),
    visible: () => BattlefieldApp.visible,
    notify: announceThroughHost,
  }));
});

Hooks.once('ready', () => {
  registerTroopSources(foundryTroopSources());
  sessionWatcher.handleChange(game.settings.get(MODULE_ID, SESSION_SETTING));
  // Players too: the settings are readable by all, and this is how a player learns the GM must act.
  recovery.probe();
  // Before any window opens, so a player's first board finds its art already decoded.
  followArt();
  // A world with no saved session delivers no record, and this seeds the same first reading.
  tableCall.handleSession();
  markBattles();
  host?.refresh().catch(reportFailure);
});

// `activeGM` moves when a GM connects or drops, and every client hears it: the new primary
// loads the committed session, and the rest start sending their commands to it. The same event
// changes who is online, which is what the seating is rebuilt from.
Hooks.on('userConnected', () => { presenceChanged(); host?.refresh().catch(reportFailure); });

// A user added to the world, renamed, or removed is a new roster for the seating to fit.
Hooks.on('createUser', () => { host?.reseat().catch(reportFailure); });
Hooks.on('updateUser', () => { host?.reseat().catch(reportFailure); });
Hooks.on('deleteUser', () => { host?.reseat().catch(reportFailure); });

// The GM's one control. With ReignMaker the swords pick a hex; without it they open the builder.
Hooks.on('getSceneControlButtons', (controls) => {
  const tools = controls['tokens']?.tools;
  if (!tools || game.user?.isGM !== true) return;
  const pick = reignMakerActive();
  tools[MODULE_ID] = {
    name: MODULE_ID,
    title: pick ? 'Pick a hex for battle' : 'Battlefield',
    icon: 'fa-solid fa-swords',
    order: Object.keys(tools).length,
    button: true,
    onChange: () => {
      if (pick) pickBattleSite((hostModule(MODULE_ID)?.api as BattlefieldModuleApi | undefined) ?? null);
      else BattlefieldApp.open().catch(reportFailure);
    },
  };
});
