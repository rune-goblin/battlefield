import { MODULE_ID } from './module-id.js';

/** Both settings are hidden from Foundry's own configuration sheet — the session and the
 * archive are the module's own data, not a player-facing preference. */
export const SESSION_SETTING = 'session';
export const ARCHIVE_SETTING = 'archive';

/** One world setting, read and written as a JSON string. Naming the shape keeps the
 * repository and the archive testable against a fake, the way the browser adapters test
 * against a fake `WebStorage` rather than real `localStorage`. */
export interface WorldSettingStorage {
  get(): string;
  set(value: string): Promise<void>;
}

export function gameSettingStorage(key: string): WorldSettingStorage {
  return {
    get: () => game.settings.get(MODULE_ID, key),
    set: async (value) => { await game.settings.set(MODULE_ID, key, value); },
  };
}

/**
 * Registers the session and archive world settings. `onSessionChange` is wired straight to
 * the session setting's `onChange`: Foundry calls it on every client that receives the
 * updated document, the writer included, which is what lets `reconcile` be the one path every
 * client — authority or not — adopts a delivered record through.
 */
export function registerFoundrySettings(onSessionChange: (raw: string) => void): void {
  game.settings.register(MODULE_ID, SESSION_SETTING, {
    scope: 'world', config: false, type: String, default: '',
    onChange: (value) => onSessionChange(value),
  });
  game.settings.register(MODULE_ID, ARCHIVE_SETTING, {
    scope: 'world', config: false, type: String, default: '[]',
  });
}
