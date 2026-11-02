import type { MessageKey } from '../i18n/messages';
import type {
  ChooseReceiveFolderResult,
  ReceiveFolderProblem,
  SettingsSummary,
} from '../ipc/contract';
import { requireElement, showProblem, translate } from './page';

const PROBLEM_MESSAGES: Readonly<Record<ReceiveFolderProblem, MessageKey>> = {
  'not-a-folder': 'folderNotAFolder',
  'system-folder': 'folderSystem',
  'not-writable': 'folderNotWritable',
  'cannot-mark-files': 'folderCannotMark',
};

const folderPath = requireElement('receive-folder', HTMLElement);
const folderProblem = requireElement('folder-problem', HTMLElement);
const startWithWindows = requireElement('start-with-windows', HTMLInputElement);
const startWithWindowsNote = requireElement('start-with-windows-note', HTMLElement);

export async function connectSettingsView(): Promise<void> {
  requireElement('change-folder', HTMLButtonElement).addEventListener('click', () => {
    void chooseFolder();
  });
  requireElement('open-folder', HTMLButtonElement).addEventListener('click', () => {
    window.ilet.openReceiveFolder();
  });
  startWithWindows.addEventListener('change', () => {
    void changeStartWithWindows(startWithWindows.checked);
  });
  showSettings(await window.ilet.getSettings());
}

function showSettings(settings: SettingsSummary): void {
  folderPath.textContent = settings.receiveFolder;
  folderPath.title = settings.receiveFolder;
  startWithWindows.checked = settings.startWithWindows;
  startWithWindows.disabled = !settings.startWithWindowsAvailable;
  startWithWindowsNote.hidden = settings.startWithWindowsAvailable;
}

async function chooseFolder(): Promise<void> {
  folderProblem.hidden = true;
  let result: ChooseReceiveFolderResult;
  try {
    result = await window.ilet.chooseReceiveFolder();
  } catch {
    showProblem(folderProblem, translate('unexpectedError'));
    return;
  }
  switch (result.status) {
    case 'changed':
      showSettings(result.settings);
      break;
    case 'cancelled':
      break;
    case 'rejected':
      showProblem(folderProblem, translate(PROBLEM_MESSAGES[result.problem]));
      break;
  }
}

async function changeStartWithWindows(enabled: boolean): Promise<void> {
  try {
    showSettings(await window.ilet.setStartWithWindows(enabled));
  } catch {
    // Show what is really set, not what was clicked.
    showSettings(await window.ilet.getSettings());
  }
}
