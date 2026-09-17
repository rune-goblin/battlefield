import { mount, unmount } from 'svelte';
import App from '../../app/App.svelte';
import { MODULE_ID } from './module-id.js';

const ApplicationV2 = foundry.applications.api.ApplicationV2;

export class BattlefieldApp extends ApplicationV2 {
  static #instance: BattlefieldApp | null = null;

  static get current(): BattlefieldApp | null {
    return BattlefieldApp.#instance?.rendered ? BattlefieldApp.#instance : null;
  }

  static async open(): Promise<BattlefieldApp> {
    const existing = BattlefieldApp.current;
    if (existing) {
      if (existing.minimized) await existing.maximize();
      existing.bringToFront();
      return existing;
    }
    const app = new BattlefieldApp();
    BattlefieldApp.#instance = app;
    await app.render({ force: true, focus: true });
    return app;
  }

  static async close(): Promise<void> {
    await BattlefieldApp.current?.close();
  }

  static override DEFAULT_OPTIONS = {
    id: MODULE_ID,
    classes: [MODULE_ID],
    window: {
      title: 'Battlefield',
      icon: 'fa-solid fa-chess-rook',
      resizable: true,
      minimizable: true,
      contentClasses: ['battlefield-content'],
    },
    position: { width: 1280, height: 800 },
  };

  #root: HTMLElement | null = null;
  #svelte: ReturnType<typeof mount> | null = null;

  async _renderHTML(): Promise<HTMLElement> {
    // A second render must not raise a second app over the same window: the shell is mounted
    // once and stays mounted until the window closes.
    if (this.#root) return this.#root;
    this.#root = document.createElement('div');
    this.#root.className = 'battlefield-mount';
    this.#svelte = mount(App, { target: this.#root });
    return this.#root;
  }

  _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
  }

  // Each open board holds a WebGL context and listens on the document; the unmount is what runs
  // their teardown, so it happens before Foundry drops the window's element.
  async _preClose(): Promise<void> {
    if (this.#svelte) unmount(this.#svelte);
    this.#svelte = null;
    this.#root = null;
    if (BattlefieldApp.#instance === this) BattlefieldApp.#instance = null;
  }
}
