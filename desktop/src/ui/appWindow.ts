import { type BrowserWindow, dialog } from 'electron';

import { type IpcSender, isFromAppWindow } from './trustedSender';

export interface Confirmation {
  readonly title: string;
  readonly message: string;
  readonly detail: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

const CONFIRM_BUTTON = 0;
const CANCEL_BUTTON = 1;

/**
 * The app's only window. It is created the first time it is shown, and closing it only hides
 * it: ilet keeps receiving files from the tray until the user quits.
 */
export class AppWindow {
  private window: BrowserWindow | undefined;
  private closingAllowed = false;
  private readonly showListeners = new Set<() => void>();
  private readonly hideListeners = new Set<() => void>();

  constructor(private readonly createWindow: () => BrowserWindow) {}

  show(): void {
    if (this.window === undefined) {
      // A new window shows itself once its page is ready.
      this.window = this.create();
      return;
    }
    if (this.window.isMinimized()) {
      this.window.restore();
    }
    this.window.show();
    this.window.focus();
  }

  /** Lets the window really close, so the app can quit. */
  allowClosing(): void {
    this.closingAllowed = true;
  }

  isSender(event: IpcSender): boolean {
    return this.window !== undefined && isFromAppWindow(event, this.window.webContents);
  }

  send(channel: string, payload: unknown): void {
    if (this.window !== undefined && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, payload);
    }
  }

  onShow(listener: () => void): void {
    this.showListeners.add(listener);
  }

  onHide(listener: () => void): void {
    this.hideListeners.add(listener);
  }

  /** Asks in a dialog that belongs to the window. Cancel is the default answer. */
  async confirm(confirmation: Confirmation): Promise<boolean> {
    if (this.window === undefined) {
      return false;
    }
    const { response } = await dialog.showMessageBox(this.window, {
      type: 'warning',
      title: confirmation.title,
      message: confirmation.message,
      detail: confirmation.detail,
      buttons: [confirmation.confirmLabel, confirmation.cancelLabel],
      defaultId: CANCEL_BUTTON,
      cancelId: CANCEL_BUTTON,
      noLink: true,
    });
    return response === CONFIRM_BUTTON;
  }

  /** Resolves to the folder the user picked, or `undefined` when they cancelled. */
  async chooseFolder(title: string, defaultPath: string): Promise<string | undefined> {
    if (this.window === undefined) {
      return undefined;
    }
    const { canceled, filePaths } = await dialog.showOpenDialog(this.window, {
      title,
      defaultPath,
      properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'],
    });
    return canceled ? undefined : filePaths[0];
  }

  private create(): BrowserWindow {
    const window = this.createWindow();
    window.on('close', (event) => {
      if (!this.closingAllowed) {
        event.preventDefault();
        window.hide();
      }
    });
    // Windows is shutting down or the user is signing out: the window must not hold that up.
    window.on('session-end', () => {
      this.closingAllowed = true;
    });
    window.on('show', () => {
      for (const listener of this.showListeners) {
        listener();
      }
    });
    window.on('hide', () => {
      for (const listener of this.hideListeners) {
        listener();
      }
    });
    window.on('closed', () => {
      this.window = undefined;
    });
    return window;
  }
}
