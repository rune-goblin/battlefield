export type NotificationTone = 'info' | 'success' | 'warning' | 'error';
export interface Notification {
  /** Reuse an ID to replace a message rather than stack copies during a drag or retry. */
  id: string;
  title: string;
  message: string;
  tone: NotificationTone;
}

/** Local presentation state. Each app instance owns its service; nothing enters a save. */
export function createNotificationService() {
  let messages: readonly Notification[] = [];
  const listeners = new Set<(messages: readonly Notification[]) => void>();
  const publish = () => { for (const listener of listeners) listener(messages); };
  return {
    subscribe(listener: (messages: readonly Notification[]) => void) {
      listeners.add(listener);
      listener(messages);
      return () => { listeners.delete(listener); };
    },
    show(message: Notification) {
      const previous = messages.find(n => n.id === message.id);
      if (previous?.title === message.title && previous.message === message.message && previous.tone === message.tone) return;
      messages = [...messages.filter(n => n.id !== message.id), { ...message }];
      publish();
    },
    dismiss(id: string) {
      if (!messages.some(n => n.id === id)) return;
      messages = messages.filter(n => n.id !== id);
      publish();
    },
    clear() { messages = []; publish(); },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
