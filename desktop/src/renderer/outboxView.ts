import { formatBytes } from '../i18n/formatting';
import type { OutboxFileSummary, OutboxSummary } from '../ipc/contract';
import {
  createButton,
  createElement,
  language,
  requireElement,
  showProblem,
  translate,
} from './page';

/** `dragover` repeats while files are held over the window; without it the overlay goes. */
const OVERLAY_TIMEOUT_MS = 250;
const FILES_DRAG_TYPE = 'Files';

const card = requireElement('outbox-card', HTMLElement);
const list = requireElement('outbox-list', HTMLUListElement);
const empty = requireElement('outbox-empty', HTMLElement);
const problem = requireElement('outbox-problem', HTMLElement);
const chooseButton = requireElement('choose-files', HTMLButtonElement);
const sendToHint = requireElement('send-to-hint', HTMLElement);
const overlay = requireElement('drop-overlay', HTMLElement);

/**
 * The files waiting for phones. The page picks no files itself: the main process shows the file
 * dialog, and dropped files go from the preload script to the main process without the page.
 */
export async function connectOutboxView(): Promise<void> {
  chooseButton.addEventListener('click', () => {
    problem.hidden = true;
    chooseButton.disabled = true;
    window.ilet
      .chooseFilesToSend()
      .catch(() => {
        showProblem(problem, translate('unexpectedError'));
      })
      .finally(() => {
        chooseButton.disabled = false;
      });
  });
  window.ilet.onOutboxChanged(showOutbox);
  // Renaming or removing a device changes the names in the list, and whether it is shown.
  window.ilet.onDevicesChanged((devices) => {
    card.hidden = devices.length === 0;
    void refresh();
  });
  showDropOverlay();
  card.hidden = (await window.ilet.listDevices()).length === 0;
  await refresh();
}

async function refresh(): Promise<void> {
  showOutbox(await window.ilet.getOutbox());
}

function showOutbox({ files, sendToMenu }: OutboxSummary): void {
  list.replaceChildren(...files.map(fileItem));
  list.hidden = files.length === 0;
  empty.hidden = files.length > 0;
  sendToHint.hidden = !sendToMenu;
}

function fileItem(file: OutboxFileSummary): HTMLLIElement {
  const item = createElement('li', 'file');
  const info = createElement('div', 'file-info');
  info.append(
    createElement('span', 'file-name', file.name),
    createElement(
      'span',
      'file-detail',
      translate('outboxFileDetail', {
        size: formatBytes(file.sizeBytes, language),
        device: file.deviceName,
      }),
    ),
  );
  const cancel = createButton('link-button danger', translate('cancel'), () => {
    cancel.disabled = true;
    // On success the shorter list arrives through onOutboxChanged.
    window.ilet.cancelOutboxFile(file.id).catch(() => {
      cancel.disabled = false;
      showProblem(problem, translate('outboxCancelFailed'));
    });
  });
  item.append(info, cancel);
  return item;
}

/** Only shows where files can be dropped; the preload script reads the drop itself. */
function showDropOverlay(): void {
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const hide = (): void => {
    clearTimeout(hideTimer);
    overlay.hidden = true;
  };
  window.addEventListener('dragover', (event) => {
    if (event.dataTransfer?.types.includes(FILES_DRAG_TYPE) !== true) {
      return;
    }
    overlay.hidden = false;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, OVERLAY_TIMEOUT_MS);
  });
  window.addEventListener('drop', hide);
}
