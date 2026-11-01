import { createTranslator, isMessageKey, type MessageKey, resolveLanguage } from '../i18n/messages';
import type { IletBridge, PairingEvent, StartPairingResult } from '../ipc/contract';
import { drawQrCode } from './qrCanvas';

declare global {
  interface Window {
    readonly ilet: IletBridge;
  }
}

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

const language = resolveLanguage(navigator.languages);
const translate = createTranslator(language);

const views = {
  idle: requireElement('idle-view', HTMLElement),
  code: requireElement('code-view', HTMLElement),
  result: requireElement('result-view', HTMLElement),
};
const qrCanvas = requireElement('qr-canvas', HTMLCanvasElement);
const countdown = requireElement('countdown', HTMLElement);
const resultMessage = requireElement('result-message', HTMLElement);
const resultButton = requireElement('result-button', HTMLButtonElement);

let countdownTimer: number | undefined;

function requireElement<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`missing element #${id}`);
  }
  return element;
}

function translatePage(): void {
  document.documentElement.lang = language;
  document.title = translate('windowTitle');
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset['i18n'];
    if (key !== undefined && isMessageKey(key)) {
      element.textContent = translate(key);
    }
  }
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n-label]')) {
    const key = element.dataset['i18nLabel'];
    if (key !== undefined && isMessageKey(key)) {
      element.setAttribute('aria-label', translate(key));
    }
  }
}

function showView(visible: keyof typeof views): void {
  for (const [name, view] of Object.entries(views)) {
    view.hidden = name !== visible;
  }
}

/** Device names come from the phone, so they are set as text, never as HTML. */
function showResult(message: string, buttonLabel: MessageKey): void {
  stopCountdown();
  resultMessage.textContent = message;
  resultButton.textContent = translate(buttonLabel);
  showView('result');
}

async function startPairing(): Promise<void> {
  let result: StartPairingResult;
  try {
    result = await window.ilet.startPairing();
  } catch {
    showResult(translate('unexpectedError'), 'tryAgain');
    return;
  }
  if (result.status === 'no-network') {
    showResult(translate('noNetwork'), 'tryAgain');
    return;
  }
  drawQrCode(qrCanvas, result.qr);
  startCountdown(result.expiresAt);
  showView('code');
}

function cancelPairing(): void {
  window.ilet.cancelPairing();
  stopCountdown();
  showView('idle');
}

function startCountdown(expiresAt: number): void {
  stopCountdown();
  const update = (): void => {
    const secondsLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / MS_PER_SECOND));
    countdown.textContent = translate('expiresIn', { time: formatMinutesAndSeconds(secondsLeft) });
    if (secondsLeft === 0) {
      showResult(translate('codeExpired'), 'createNewCode');
    }
  };
  update();
  countdownTimer = window.setInterval(update, MS_PER_SECOND);
}

function stopCountdown(): void {
  window.clearInterval(countdownTimer);
  countdownTimer = undefined;
}

function formatMinutesAndSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
}

function handlePairingEvent(event: PairingEvent): void {
  switch (event.type) {
    case 'paired':
      showResult(translate('pairedWith', { name: event.deviceName }), 'pairAnother');
      break;
    case 'expired':
      showResult(translate('codeExpired'), 'createNewCode');
      break;
  }
}

translatePage();
window.ilet.onPairingEvent(handlePairingEvent);
requireElement('start-button', HTMLButtonElement).addEventListener('click', () => {
  void startPairing();
});
resultButton.addEventListener('click', () => {
  void startPairing();
});
requireElement('cancel-button', HTMLButtonElement).addEventListener('click', cancelPairing);
