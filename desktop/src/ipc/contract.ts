/**
 * The contract between the main process and the window. The preload script exposes exactly
 * `IletBridge` as `window.ilet`; nothing else from Electron or Node.js reaches the page.
 */
import { MAX_DISPLAY_NAME_LENGTH } from '../protocol/constants';

export const BRIDGE_NAME = 'ilet';

/** The longest device name the window may send, in UTF-16 code units (its input field's limit). */
export const MAX_DEVICE_NAME_LENGTH = MAX_DISPLAY_NAME_LENGTH;

export const IpcChannel = {
  startPairing: 'pairing:start',
  cancelPairing: 'pairing:cancel',
  pairingEvent: 'pairing:event',
  listDevices: 'devices:list',
  renameDevice: 'devices:rename',
  removeDevice: 'devices:remove',
  devicesChanged: 'devices:changed',
  getSettings: 'settings:get',
  chooseReceiveFolder: 'settings:choose-receive-folder',
  openReceiveFolder: 'settings:open-receive-folder',
  setStartWithWindows: 'settings:set-start-with-windows',
  openStartupSettings: 'settings:open-startup-settings',
  checkNetwork: 'network:check',
  networkChanged: 'network:changed',
  openNetworkSettings: 'network:open-settings',
  getOutbox: 'outbox:get',
  outboxChanged: 'outbox:changed',
  chooseFilesToSend: 'outbox:choose-files',
  cancelOutboxFile: 'outbox:cancel',
  /** Sent by the preload script itself, never by the page: the paths of a drop the user made. */
  dropFiles: 'outbox:drop-files',
} as const;

/**
 * The most paths one drop carries. More than the main process sends at once, so that a larger
 * drop still gets its "too many files" message.
 */
export const MAX_DROPPED_PATHS = 1000;

/** QR code modules, row by row (`true` is dark), quiet zone included. */
export type QrMatrix = readonly (readonly boolean[])[];

export type StartPairingResult =
  | { readonly status: 'started'; readonly qr: QrMatrix; readonly expiresAt: number }
  | { readonly status: 'no-network' };

/** `cancelled`: the window was hidden, which invalidates the code on screen. */
export type PairingEvent =
  | { readonly type: 'paired'; readonly deviceName: string }
  | { readonly type: 'expired' }
  | { readonly type: 'cancelled' };

/** Device names come from phones, so the window only ever shows them as text. */
export interface DeviceSummary {
  readonly id: string;
  readonly name: string;
  /** ISO 8601 timestamp. */
  readonly pairedAt: string;
}

export type RenameDeviceResult = 'renamed' | 'invalid-name' | 'not-found';

/**
 * Where the user turns starting with Windows on and off:
 * - `checkbox`: in ilet's settings (the installer's version).
 * - `windows-settings`: on the Startup page of Windows Settings (the Microsoft Store version).
 * - `unavailable`: nowhere, in a development build.
 */
export type StartWithWindowsControl = 'checkbox' | 'windows-settings' | 'unavailable';

export interface SettingsSummary {
  readonly receiveFolder: string;
  /** Always false unless the control is the checkbox. */
  readonly startWithWindows: boolean;
  readonly startWithWindowsControl: StartWithWindowsControl;
}

export type ReceiveFolderProblem =
  'not-a-folder' | 'system-folder' | 'not-writable' | 'cannot-mark-files';

export type ChooseReceiveFolderResult =
  | { readonly status: 'changed'; readonly settings: SettingsSummary }
  | { readonly status: 'cancelled' }
  | { readonly status: 'rejected'; readonly problem: ReceiveFolderProblem };

export interface NetworkStatus {
  /** Network adapters (not virtual ones) on networks that Windows classifies as Public. */
  readonly publicNetworks: readonly string[];
  /** Network adapters on networks managed by an organization (Domain), which stay blocked. */
  readonly domainNetworks: readonly string[];
}

/** File names are cleaned, device names come from phones: the window shows both only as text. */
export interface OutboxFileSummary {
  readonly id: string;
  readonly name: string;
  readonly sizeBytes: number;
  readonly deviceName: string;
}

export interface OutboxSummary {
  /** The files waiting for phones, oldest first. */
  readonly files: readonly OutboxFileSummary[];
  /** Explorer's Send to menu offers ilet: only the installed app adds it. */
  readonly sendToMenu: boolean;
}

export interface IletBridge {
  startPairing(): Promise<StartPairingResult>;
  cancelPairing(): void;
  onPairingEvent(listener: (event: PairingEvent) => void): void;

  listDevices(): Promise<readonly DeviceSummary[]>;
  renameDevice(id: string, name: string): Promise<RenameDeviceResult>;
  /** The main process asks the user to confirm. Resolves to whether the device was removed. */
  removeDevice(id: string): Promise<boolean>;
  onDevicesChanged(listener: (devices: readonly DeviceSummary[]) => void): void;

  getSettings(): Promise<SettingsSummary>;
  /** The user picks the folder in a system dialog; the page never sends a path. */
  chooseReceiveFolder(): Promise<ChooseReceiveFolderResult>;
  openReceiveFolder(): void;
  setStartWithWindows(enabled: boolean): Promise<SettingsSummary>;
  /** Opens the Startup page of Windows Settings; only when that is where the switch is. */
  openStartupSettings(): void;

  /** Reads the network categories again. */
  checkNetwork(): Promise<NetworkStatus>;
  onNetworkChanged(listener: (status: NetworkStatus) => void): void;
  openNetworkSettings(): void;

  getOutbox(): Promise<OutboxSummary>;
  onOutboxChanged(listener: (outbox: OutboxSummary) => void): void;
  /**
   * The user picks the files in a system dialog and, with several phones, the phone in another;
   * the page never sends a path. Dropped files go to the main process without the page.
   */
  chooseFilesToSend(): Promise<void>;
  /** Resolves to whether the file was still waiting. */
  cancelOutboxFile(id: string): Promise<boolean>;
}
