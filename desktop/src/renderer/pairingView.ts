import type { MessageKey } from '../i18n/messages';
import type { PairingEvent, StartPairingResult } from '../ipc/contract';
import { requireElement, showView, translate } from './page';
import { drawQrCode } from './qrCanvas';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

const qrCanvas = requireElement('qr-canvas', HTMLCanvasElement);
const countdown = requireElement('countdown', HTMLElement);
const resultMessage = requireElement('result-message', HTMLElement);
const resultButton = requireElement('result-button', HTMLButtonElement);

let countdownTimer: number | undefined;

export function connectPairingView(): void {
  window.ilet.onPairingEvent(handlePairingEvent);
  requireElement('start-button', HTMLButtonElement).addEventListener('click', () => {
    void startPairing();
  });
  resultButton.addEventListener('click', () => {
    void startPairing();
  });
  requireElement('cancel-button', HTMLButtonElement).addEventListener('click', () => {
    window.ilet.cancelPairing();
    showHome();
  });
  requireElement('done-button', HTMLButtonElement).addEventListener('click', showHome);
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

function handlePairingEvent(event: PairingEvent): void {
  switch (event.type) {
    case 'paired':
      showResult(translate('pairedWith', { name: event.deviceName }), 'pairAnother');
      break;
    case 'expired':
      showResult(translate('codeExpired'), 'createNewCode');
      break;
    case 'cancelled':
      showHome();
      break;
  }
}

function showHome(): void {
  stopCountdown();
  showView('home');
}

/** Device names come from the phone, so they are set as text, never as HTML. */
function showResult(message: string, buttonLabel: MessageKey): void {
  stopCountdown();
  resultMessage.textContent = message;
  resultButton.textContent = translate(buttonLabel);
  showView('result');
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
