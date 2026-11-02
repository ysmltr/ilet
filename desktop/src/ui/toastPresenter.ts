import { Notification } from 'electron';

import type { FileNotificationDependencies } from './fileNotifications';

/** Electron drops a notification's click handler once the object is garbage-collected. */
const KEPT_NOTIFICATIONS = 20;

/** Shows Windows notifications; recent ones stay clickable in the notification center. */
export function createToastPresenter(iconPath: string): FileNotificationDependencies['show'] {
  const recent: Notification[] = [];
  return ({ title, body }, onClick) => {
    if (!Notification.isSupported()) {
      return;
    }
    const notification = new Notification({ title, body, icon: iconPath });
    notification.on('click', onClick);
    notification.show();
    recent.push(notification);
    if (recent.length > KEPT_NOTIFICATIONS) {
      recent.shift();
    }
  };
}
