import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTranslator } from '../../src/i18n/messages';
import {
  deliveryNotifications,
  FileNotifications,
  type NotificationContent,
  type ReceivedFileNotice,
} from '../../src/ui/fileNotifications';

const QUIET_PERIOD_MS = 3_000;

interface Shown {
  readonly content: NotificationContent;
  readonly click: () => void;
}

function setUp(): { notifications: FileNotifications; shown: Shown[]; revealed: string[] } {
  const shown: Shown[] = [];
  const revealed: string[] = [];
  const notifications = new FileNotifications({
    show: (content, click) => shown.push({ content, click }),
    reveal: (filePath) => revealed.push(filePath),
    translate: createTranslator('en'),
  });
  return { notifications, shown, revealed };
}

function file(name: string): ReceivedFileNotice {
  return {
    filePath: `C:\\Users\\Yesim\\Downloads\\ilet\\${name}`,
    fileName: name,
    deviceName: 'iPhone',
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FileNotifications', () => {
  it('announces a file at once and reveals it, without opening it, when clicked', () => {
    const { notifications, shown, revealed } = setUp();
    notifications.fileReceived(file('IMG_0001.JPG'));

    expect(shown.map(({ content }) => content)).toEqual([
      { title: 'File received', body: 'IMG_0001.JPG from iPhone' },
    ]);
    shown[0]?.click();
    expect(revealed).toEqual(['C:\\Users\\Yesim\\Downloads\\ilet\\IMG_0001.JPG']);
  });

  it('sums up the files of a burst in one notification that reveals the latest', () => {
    const { notifications, shown, revealed } = setUp();
    for (const name of ['1.JPG', '2.JPG', '3.JPG']) {
      notifications.fileReceived(file(name));
    }
    expect(shown).toHaveLength(1);

    vi.advanceTimersByTime(QUIET_PERIOD_MS);

    expect(shown[1]?.content).toEqual({
      title: '2 more files received',
      body: 'Latest: 3.JPG from iPhone',
    });
    shown[1]?.click();
    expect(revealed).toEqual(['C:\\Users\\Yesim\\Downloads\\ilet\\3.JPG']);
  });

  it('says "1 more file" for a single extra file', () => {
    const { notifications, shown } = setUp();
    notifications.fileReceived(file('1.JPG'));
    notifications.fileReceived(file('2.JPG'));
    vi.advanceTimersByTime(QUIET_PERIOD_MS);

    expect(shown[1]?.content.title).toBe('1 more file received');
  });

  it('shows at most one notification per quiet period during a long burst', () => {
    const { notifications, shown } = setUp();
    for (let second = 0; second < 10; second++) {
      notifications.fileReceived(file(`${String(second)}.JPG`));
      vi.advanceTimersByTime(1_000);
    }
    expect(shown.length).toBeLessThanOrEqual(Math.ceil(10_000 / QUIET_PERIOD_MS));
  });

  it('announces the next file at once after a quiet period', () => {
    const { notifications, shown } = setUp();
    notifications.fileReceived(file('1.JPG'));
    vi.advanceTimersByTime(QUIET_PERIOD_MS);
    notifications.fileReceived(file('2.JPG'));

    expect(shown.map(({ content }) => content.title)).toEqual(['File received', 'File received']);
  });
});

describe('deliveryNotifications', () => {
  it('announces files the phone fetched, sums up a burst and opens the window', () => {
    const shown: Shown[] = [];
    let windowOpened = 0;
    const notifications = deliveryNotifications(
      (content, click) => shown.push({ content, click }),
      createTranslator('en'),
      () => {
        windowOpened += 1;
      },
    );
    for (const name of ['report.pdf', 'a.jpg', 'b.jpg']) {
      notifications.add({ fileName: name, deviceName: 'iPhone' });
    }
    vi.advanceTimersByTime(QUIET_PERIOD_MS);

    expect(shown.map(({ content }) => content)).toEqual([
      { title: 'File sent', body: 'report.pdf is on iPhone' },
      { title: '2 more files sent', body: 'Latest: b.jpg on iPhone' },
    ]);
    shown[1]?.click();
    expect(windowOpened).toBe(1);
  });
});
