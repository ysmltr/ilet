import { Menu, Tray } from 'electron';

import type { Translate } from '../i18n/messages';

export interface TrayActions {
  readonly open: () => void;
  readonly openReceiveFolder: () => void;
  readonly quit: () => void;
}

/** ilet's icon next to the clock. The app keeps running there while its window is closed. */
export class AppTray {
  private readonly tray: Tray;

  constructor(
    iconPath: string,
    private readonly translate: Translate,
    actions: TrayActions,
  ) {
    this.tray = new Tray(iconPath);
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: translate('trayOpen'), click: actions.open },
        { label: translate('trayOpenFolder'), click: actions.openReceiveFolder },
        { type: 'separator' },
        { label: translate('trayQuit'), click: actions.quit },
      ]),
    );
    this.tray.on('click', actions.open);
    this.showPublicNetworkWarning(false);
  }

  /** Removes the icon at once; otherwise Windows may show it until the mouse passes over it. */
  destroy(): void {
    this.tray.destroy();
  }

  /** The tooltip tells when a Public network keeps phones out. */
  showPublicNetworkWarning(onPublicNetwork: boolean): void {
    this.tray.setToolTip(
      this.translate(onPublicNetwork ? 'trayTooltipPublicNetwork' : 'trayTooltip'),
    );
  }
}
