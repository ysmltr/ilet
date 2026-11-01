import { isAppUrl } from './appUrl';

/** The parts of an Electron IPC event that tell where a message came from. */
export interface IpcSender {
  readonly sender: unknown;
  readonly senderFrame: { readonly url: string; readonly parent: unknown } | null;
}

/**
 * IPC is accepted only from the top frame of our own window while it shows our own page. A
 * message from another window, from an iframe, or from a page that got there by navigating
 * away is refused.
 */
export function isFromAppWindow(event: IpcSender, appWebContents: unknown): boolean {
  const frame = event.senderFrame;
  return (
    event.sender === appWebContents &&
    frame !== null &&
    frame.parent === null &&
    isAppUrl(frame.url)
  );
}
