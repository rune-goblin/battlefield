// Foundry ships no types with the build, so the adapter declares the few it touches. Each
// wave that reaches for another global adds it here rather than widening these to `any`.
declare const foundry: {
  applications: { api: { ApplicationV2: FoundryApplicationV2Class } };
  utils: { saveDataToFile(data: string, type: string, filename: string): void };
  dice: { terms: { Die: FoundryDieClass } };
};

/** The one Foundry document call the chat adapter makes; `flags` is where it stamps the
 * committed event's ID. */
declare const ChatMessage: {
  create(data: {
    content: string;
    rolls?: FoundryRoll[];
    flags?: Record<string, Record<string, unknown>>;
  }): Promise<unknown>;
};

declare const Roll: {
  /** Builds a Roll from terms that are already evaluated (or all unevaluated); the chat
   * adapter hands it one `Die` term carrying the recorded face. */
  fromTerms(terms: FoundryDieTerm[]): FoundryRoll;
};

interface FoundryDieResult { result: number; active: boolean }

interface FoundryDieTerm {
  /** A synchronous draw through the platform's own generator (`CONFIG.Dice.randomUniform()`),
   * the seam the dice port uses. */
  randomFace(): number;
}

interface FoundryDieClass {
  new (data: { faces: number; results?: FoundryDieResult[] }): FoundryDieTerm;
}

interface FoundryRoll {
  readonly total: number | undefined;
}

declare const Hooks: {
  once(hook: 'init' | 'ready', handler: () => void): number;
  on(hook: 'getSceneControlButtons', handler: (controls: SceneControlSet) => void): number;
  /** Fired on every client when a user connects or disconnects, which is when `activeGM` can
   * move from one client to another. */
  on(hook: 'userConnected', handler: () => void): number;
};

declare const game: {
  modules: { get(id: string): { api?: unknown } | undefined };
  settings: {
    register(namespace: string, key: string, data: FoundryWorldSettingConfig): void;
    get(namespace: string, key: string): string;
    set(namespace: string, key: string, value: string): Promise<string>;
  };
  user: FoundryUser | null;
  users: {
    /** The first active GM by ID, the same answer on every client, or null with none online. */
    activeGM: FoundryUser | null;
    get(id: string): FoundryUser | undefined;
    filter(test: (user: FoundryUser) => boolean): FoundryUser[];
  };
  /** The socket.io client Foundry connects with. Absent before the connection opens. */
  socket: {
    emit(channel: string, message: unknown): void;
    on(channel: string, handler: (message: unknown) => void): void;
  } | null;
};

interface FoundryUser {
  id: string;
  /** Connected right now. `isGM` covers assistants too, so the primary comes from `activeGM`. */
  active: boolean;
  isGM: boolean;
}

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
