import { getContext, setContext } from 'svelte';
import { createNotificationService, type NotificationService } from './notifications.js';

const key = Symbol('notifications');
export const provideNotifications = () => setContext(key, createNotificationService());
export const useNotifications = () => getContext<NotificationService>(key);
