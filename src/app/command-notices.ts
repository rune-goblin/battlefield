import type { CommandResult } from '../runtime/commands.js';
import type { NotificationService } from './notifications.js';

/** A refused command. One notice at a time: the newest refusal replaces the last. */
export const COMMAND_NOTICE = 'command';
/** A write that never reached the store. It stands until a save gets through. */
export const STORAGE_NOTICE = 'storage';

/**
 * Every command a view submits ends here. The view awaits the result before it reads state,
 * and a refusal reaches the player through the app's own notifications rather than a throw.
 */
export function commandReporter(notifications: NotificationService) {
  return async function run(pending: Promise<CommandResult>): Promise<CommandResult> {
    const result = await pending;
    if (result.ok) {
      notifications.dismiss(COMMAND_NOTICE);
      notifications.dismiss(STORAGE_NOTICE);
    } else if (result.reason === 'timeout') {
      // Nothing was refused: the authority never answered, and the command may yet commit.
      // The `authority` notice speaks for that, raised from where the host watches the table.
    } else if (result.reason === 'storage') {
      notifications.show({
        id: STORAGE_NOTICE, title: 'Changes could not be saved', message: result.message, tone: 'warning',
      });
    } else {
      notifications.show({
        id: COMMAND_NOTICE, title: 'Action unavailable', message: result.message, tone: 'error',
      });
    }
    return result;
  };
}
