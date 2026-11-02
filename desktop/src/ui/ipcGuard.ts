import { ipcMain } from 'electron';

import type { Logger } from '../shared/logger';
import type { ArgumentParser } from './ipcArguments';
import type { IpcSender } from './trustedSender';

/**
 * Registers IPC handlers that run only for messages from the app window's own page whose
 * arguments pass the channel's parser. Anything else is logged and dropped.
 */
export interface IpcGuard {
  /** A request that expects an answer (`ipcRenderer.invoke`); a rejected one fails in the page. */
  handle<Args extends readonly unknown[]>(
    channel: string,
    parse: ArgumentParser<Args>,
    handler: (...args: Args) => unknown,
  ): void;
  /** A message without an answer (`ipcRenderer.send`). */
  on<Args extends readonly unknown[]>(
    channel: string,
    parse: ArgumentParser<Args>,
    handler: (...args: Args) => void,
  ): void;
}

export function createIpcGuard(
  isFromAppWindow: (event: IpcSender) => boolean,
  logger: Logger,
): IpcGuard {
  const accept = <Args extends readonly unknown[]>(
    channel: string,
    event: IpcSender,
    args: readonly unknown[],
    parse: ArgumentParser<Args>,
  ): Args | undefined => {
    const parsed = isFromAppWindow(event) ? parse(args) : undefined;
    if (parsed === undefined) {
      logger.warn('rejected IPC message', { channel });
    }
    return parsed;
  };
  return {
    handle: (channel, parse, handler) => {
      ipcMain.handle(channel, (event, ...args: unknown[]) => {
        const parsed = accept(channel, event, args, parse);
        if (parsed === undefined) {
          throw new Error('IPC message rejected');
        }
        return handler(...parsed);
      });
    },
    on: (channel, parse, handler) => {
      ipcMain.on(channel, (event, ...args: unknown[]) => {
        const parsed = accept(channel, event, args, parse);
        if (parsed !== undefined) {
          handler(...parsed);
        }
      });
    },
  };
}
