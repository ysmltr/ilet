import type { ServerCore } from '../app/serverCore';
import { formatBytes } from '../i18n/formatting';
import type { Language, Translate } from '../i18n/messages';
import { IpcChannel, type OutboxSummary } from '../ipc/contract';
import { MAX_FILES_PER_SEND, sendNameOf, type SendResult } from '../outbox/outbox';
import { errorCodeOf } from '../shared/errors';
import type { Logger } from '../shared/logger';
import type { AppWindow } from './appWindow';
import { droppedPathsArgument, noArguments, outboxIdArgument } from './ipcArguments';
import type { IpcGuard } from './ipcGuard';
import { sendFailureQuestion, sendMessage, sendQuestion, type SendTarget } from './sendDialogs';

export interface SendFlow {
  /** Files from Explorer's Send to menu: the window opens and the user confirms them. */
  sendFromExplorer(paths: readonly string[]): Promise<void>;
}

export interface OutboxIpcDependencies {
  readonly guard: IpcGuard;
  readonly core: Pick<ServerCore, 'outbox' | 'devices' | 'settings'>;
  readonly window: AppWindow;
  readonly translate: Translate;
  readonly language: Language;
  /** Whether Explorer's Send to menu offers ilet. */
  readonly sendToMenu: boolean;
  readonly logger: Logger;
}

/**
 * The files waiting for phones, with Cancel, and the three ways to add some. The page never sends
 * a path: files come from ilet's own file dialog, from a drop that the preload script reads, or
 * from Explorer's Send to, and a drop and Send to are confirmed first (THREAT_MODEL.md T43).
 */
export function connectOutbox(dependencies: OutboxIpcDependencies): SendFlow {
  const { guard, core, window, translate, logger } = dependencies;
  const { outbox, devices } = core;

  const summary = (): OutboxSummary => {
    const deviceNames = new Map(devices.list().map(({ id, name }) => [id, name]));
    return {
      files: outbox.list().flatMap(({ id, deviceId, name, sizeBytes }) => {
        const deviceName = deviceNames.get(deviceId);
        return deviceName === undefined ? [] : [{ id, name, sizeBytes, deviceName }];
      }),
      sendToMenu: dependencies.sendToMenu,
    };
  };

  // One dialog at a time: a drop made while another is being asked about waits for it.
  let pendingFlow: Promise<void> = Promise.resolve();
  const oneAtATime = (flow: () => Promise<void>): Promise<void> => {
    const next = pendingFlow.then(flow).catch((error: unknown) => {
      logger.error('could not send files', { error: errorCodeOf(error) });
    });
    pendingFlow = next;
    return next;
  };

  const tell = async (message: string): Promise<void> => {
    await window.ask(sendMessage(message, translate));
  };

  const chooseDevice = async (
    paths: readonly string[],
    targets: readonly SendTarget[],
  ): Promise<string | undefined> => {
    const now = new Date();
    const names = paths.map((sourcePath) => sendNameOf(sourcePath, now));
    const { question, targets: offered } = sendQuestion(names, targets, translate);
    // A device removed while the dialog is open gets nothing: the outbox checks again.
    return offered[await window.ask(question)]?.id;
  };

  /** `confirm`: ask even with one device. Only files from ilet's own file dialog skip it. */
  const send = async (paths: readonly string[], confirm: boolean): Promise<void> => {
    const targets = devices.list();
    if (targets.length === 0) {
      await tell(translate('noDeviceToSendTo'));
      return;
    }
    if (paths.length > MAX_FILES_PER_SEND) {
      await tell(translate('tooManyFiles', { max: String(MAX_FILES_PER_SEND) }));
      return;
    }
    const deviceId =
      confirm || targets.length > 1 ? await chooseDevice(paths, targets) : targets[0]?.id;
    if (deviceId === undefined) {
      return;
    }
    let result: SendResult;
    try {
      result = await outbox.send(deviceId, paths);
    } catch (error) {
      logger.error('could not send files', { error: errorCodeOf(error) });
      await tell(translate('sendFailed'));
      return;
    }
    if (result.failed.length > 0) {
      const maxFileSize = formatBytes(
        core.settings.current.maxFileSizeBytes,
        dependencies.language,
      );
      await window.ask(sendFailureQuestion(result.failed, maxFileSize, translate));
    }
  };

  guard.handle(IpcChannel.getOutbox, noArguments, summary);
  guard.handle(IpcChannel.chooseFilesToSend, noArguments, () =>
    oneAtATime(async () => {
      const paths = await window.chooseFiles(translate('chooseFilesTitle'));
      if (paths.length > 0) {
        await send(paths, false);
      }
    }),
  );
  guard.handle(IpcChannel.cancelOutboxFile, outboxIdArgument, (id) => outbox.cancel(id));
  guard.on(IpcChannel.dropFiles, droppedPathsArgument, (paths) => {
    void oneAtATime(() => send(paths, true));
  });
  outbox.onChange(() => {
    window.send(IpcChannel.outboxChanged, summary());
  });

  return {
    sendFromExplorer: (paths) =>
      oneAtATime(async () => {
        await window.showAndWait();
        await send(paths, true);
      }),
  };
}
