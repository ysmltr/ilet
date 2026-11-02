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
  checkNetwork: 'network:check',
  networkChanged: 'network:changed',
  openNetworkSettings: 'network:open-settings',
} as const;

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

export interface SettingsSummary {
  readonly receiveFolder: string;
  readonly startWithWindows: boolean;
  /** Only the installed app can start with Windows; a development build cannot. */
  readonly startWithWindowsAvailable: boolean;
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

  /** Reads the network categories again. */
  checkNetwork(): Promise<NetworkStatus>;
  onNetworkChanged(listener: (status: NetworkStatus) => void): void;
  openNetworkSettings(): void;
}
