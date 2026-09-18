// Foundry ships no types with the build, so the adapter declares the few it touches. Each
// wave that reaches for another global adds it here rather than widening these to `any`.
declare const foundry: {
  applications: { api: { ApplicationV2: FoundryApplicationV2Class } };
  utils: { saveDataToFile(data: string, type: string, filename: string): void };
};

declare const Hooks: {
  once(hook: 'init', handler: () => void): number;
  on(hook: 'getSceneControlButtons', handler: (controls: SceneControlSet) => void): number;
};

declare const game: {
  modules: { get(id: string): { api?: unknown } | undefined };
  settings: {
    register(namespace: string, key: string, data: FoundryWorldSettingConfig): void;
    get(namespace: string, key: string): string;
    set(namespace: string, key: string, value: string): Promise<string>;
  };
};

/** The one setting shape the adapter registers: a world-scoped string, hidden from the
 * config sheet. `onChange` carries the string Foundry stored, not the object it came from. */
interface FoundryWorldSettingConfig {
  scope: 'world';
  config: false;
  type: StringConstructor;
  default: string;
  onChange?: (value: string, options: Record<string, unknown>, userId: string) => void;
}

interface FoundryApplicationV2 {
  readonly rendered: boolean;
  readonly minimized: boolean;
  readonly element: HTMLElement;
  render(options?: { force?: boolean; focus?: boolean }): Promise<unknown>;
  close(options?: Record<string, unknown>): Promise<unknown>;
  maximize(): Promise<unknown>;
  bringToFront(): void;
}

interface FoundryApplicationV2Class {
  new (options?: Record<string, unknown>): FoundryApplicationV2;
  DEFAULT_OPTIONS: Record<string, unknown>;
}

/** The `getSceneControlButtons` hook hands over the whole control set keyed by layer name. */
interface SceneControlSet {
  [control: string]: { tools?: Record<string, SceneControlTool>; [key: string]: unknown } | undefined;
}

interface SceneControlTool {
  name: string;
  title: string;
  icon: string;
  order?: number;
  button?: boolean;
  visible?: boolean;
  onChange?: () => void;
}
