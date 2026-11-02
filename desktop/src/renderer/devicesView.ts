import {
  type DeviceSummary,
  MAX_DEVICE_NAME_LENGTH,
  type RenameDeviceResult,
} from '../ipc/contract';
import {
  createButton,
  createElement,
  language,
  requireElement,
  showProblem,
  translate,
} from './page';

const list = requireElement('device-list', HTMLUListElement);
const noDevices = requireElement('no-devices', HTMLElement);
const dateFormat = new Intl.DateTimeFormat(language, { dateStyle: 'medium' });

export async function connectDevicesView(): Promise<void> {
  // Pairing, renaming and removing all end with a fresh list from the main process.
  window.ilet.onDevicesChanged(showDevices);
  showDevices(await window.ilet.listDevices());
}

function showDevices(devices: readonly DeviceSummary[]): void {
  list.replaceChildren(
    ...devices.map((device) => {
      const item = createElement('li', 'device');
      showDevice(item, device);
      return item;
    }),
  );
  list.hidden = devices.length === 0;
  noDevices.hidden = devices.length > 0;
}

function showDevice(item: HTMLLIElement, device: DeviceSummary): void {
  const info = createElement('div', 'device-info');
  info.append(
    createElement('span', 'device-name', device.name),
    createElement(
      'span',
      'device-date',
      translate('pairedOn', { date: dateFormat.format(new Date(device.pairedAt)) }),
    ),
  );
  const actions = createElement('div', 'device-actions');
  actions.append(
    createButton('link-button', translate('rename'), () => {
      showRenameForm(item, device);
    }),
    createButton('link-button danger', translate('remove'), () => {
      void window.ilet.removeDevice(device.id);
    }),
  );
  item.replaceChildren(info, actions);
}

function showRenameForm(item: HTMLLIElement, device: DeviceSummary): void {
  const form = createElement('form', 'rename-form');
  const input = createElement('input', 'text-input');
  input.type = 'text';
  input.value = device.name;
  input.maxLength = MAX_DEVICE_NAME_LENGTH;
  input.setAttribute('aria-label', translate('deviceNameLabel'));
  const save = createElement('button', 'button primary compact', translate('save'));
  save.type = 'submit';
  const cancel = createButton('button compact', translate('cancel'), () => {
    showDevice(item, device);
  });
  const problem = createElement('p', 'problem');
  problem.hidden = true;
  problem.setAttribute('role', 'alert');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void rename(device.id, input.value, problem);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      showDevice(item, device);
    }
  });
  form.append(input, save, cancel, problem);
  item.replaceChildren(form);
  input.select();
}

async function rename(id: string, name: string, problem: HTMLElement): Promise<void> {
  let result: RenameDeviceResult;
  try {
    result = await window.ilet.renameDevice(id, name);
  } catch {
    showProblem(problem, translate('unexpectedError'));
    return;
  }
  switch (result) {
    case 'renamed':
      // The renamed list arrives through onDevicesChanged.
      break;
    case 'invalid-name':
      showProblem(problem, translate('deviceNameEmpty'));
      break;
    case 'not-found':
      showProblem(problem, translate('deviceGone'));
      break;
  }
}
