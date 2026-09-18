import './install-asset-base.js';
import { blockPageZoom } from '../../app/app-root.js';
import { freshSession } from '../../runtime/session.js';
import { BattlefieldApp } from './BattlefieldApp.js';
import { MODULE_ID } from './module-id.js';
import { createSessionWatcher } from './sessionWatcher.js';
import { registerFoundrySettings } from './worldSettings.js';
import './foundry.css';
import '../../app/app.css';

// proto: seeded fresh rather than from the session setting's own current value — nothing
// consumes this watcher yet, and Wave 4.2's primary-GM runtime replaces the seed with a real
// load. The registration and the onChange -> reconcile feed are real from this wave on.
export const sessionWatcher = createSessionWatcher(freshSession());

Hooks.once('init', () => {
  blockPageZoom();
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = { open: () => BattlefieldApp.open(), close: () => BattlefieldApp.close() };
  registerFoundrySettings((raw) => sessionWatcher.handleChange(raw));
});

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
