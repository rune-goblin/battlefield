export type NotificationTone = 'info' | 'success' | 'warning' | 'error';
export interface Notification {
  /** Reuse an ID to replace a message rather than stack copies during a drag or retry. */
  id: string;
  title: string;
  message: string;
  tone: NotificationTone;
  /** Clears itself after this many milliseconds, for a notice nobody has to dismiss by hand. */
  expiresInMs?: number;
}

/** Local presentation state. Each app instance owns its service; nothing enters a save. */
export function createNotificationService() {
  let messages: readonly Notification[] = [];
  const listeners = new Set<(messages: readonly Notification[]) => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const publish = () => { for (const listener of listeners) listener(messages); };
  const cancel = (id: string) => {
    const timer = timers.get(id);
    if (timer === undefined) return;
    clearTimeout(timer);
    timers.delete(id);
  };
  const dismiss = (id: string) => {
    cancel(id);
    if (!messages.some((n) => n.id === id)) return;
    messages = messages.filter((n) => n.id !== id);
    publish();
  };
  return {
    subscribe(listener: (messages: readonly Notification[]) => void) {
      listeners.add(listener);
      listener(messages);
      return () => { listeners.delete(listener); };
    },
    show(message: Notification) {
      const previous = messages.find(n => n.id === message.id);
      const same = previous?.title === message.title && previous.message === message.message
        && previous.tone === message.tone && previous.expiresInMs === message.expiresInMs;
      // A reused ID replaces the running notice and whatever timer was clearing it. An
      // identical expiring notice keeps its text on screen without a republish, and still
      // restarts the clock: two commits summarized the same way are two events, and the second
      // must not inherit what the first had left to run.
      cancel(message.id);
      if (!same) {
        messages = [...messages.filter(n => n.id !== message.id), { ...message }];
        publish();
      }
      if (message.expiresInMs !== undefined) timers.set(message.id, setTimeout(() => dismiss(message.id), message.expiresInMs));
    },
    dismiss,
    clear() {
      for (const id of [...timers.keys()]) cancel(id);
      messages = [];
      publish();
    },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
