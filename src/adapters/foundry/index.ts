import './install-asset-base.js';
import { blockPageZoom } from '../../app/app-root.js';
import { BattlefieldApp } from './BattlefieldApp.js';
import { MODULE_ID } from './module-id.js';
import './foundry.css';
import '../../app/app.css';

Hooks.once('init', () => {
  blockPageZoom();
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = { open: () => BattlefieldApp.open(), close: () => BattlefieldApp.close() };
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
