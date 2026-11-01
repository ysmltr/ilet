import { hashPresentedSecret, issueSecret, secretHashesEqual } from '../auth/secrets';
import { PAIRING_SECRET_TTL_MS } from '../protocol/constants';

export interface PairingCode {
  /** Goes into the QR code on screen only; it is never stored or logged. */
  readonly secret: string;
  readonly expiresAt: number;
}

interface ActiveCode {
  readonly secretHash: Buffer;
  readonly expiresAt: number;
  readonly expiryTimer: NodeJS.Timeout;
}

type ExpiryListener = () => void;

/**
 * The one-time pairing secret behind the QR code (PROTOCOL.md section 4.1). At most one code
 * exists. It ends when it is used, when it expires, when a new code is started, or when the
 * QR code is closed.
 */
export class PairingCodes {
  private active: ActiveCode | undefined;
  private readonly expiryListeners = new Set<ExpiryListener>();

  constructor(
    private readonly now: () => number,
    private readonly lifetimeMs: number = PAIRING_SECRET_TTL_MS,
  ) {}

  start(): PairingCode {
    this.cancel();
    const { value, hash } = issueSecret();
    const expiresAt = this.now() + this.lifetimeMs;
    const expiryTimer = setTimeout(() => {
      this.expire();
    }, this.lifetimeMs);
    this.active = { secretHash: hash, expiresAt, expiryTimer };
    return { secret: value, expiresAt };
  }

  isActive(): boolean {
    return this.active !== undefined && this.now() < this.active.expiresAt;
  }

  cancel(): void {
    if (this.active !== undefined) {
      clearTimeout(this.active.expiryTimer);
      this.active = undefined;
    }
  }

  /**
   * True at most once per code: a correct secret within the lifetime ends the code. A wrong
   * secret leaves it active, so an attacker's guesses cannot cancel the user's pairing.
   */
  redeem(presentedSecret: string): boolean {
    const presentedHash = hashPresentedSecret(presentedSecret);
    if (
      this.active === undefined ||
      presentedHash === undefined ||
      !this.isActive() ||
      !secretHashesEqual(presentedHash, this.active.secretHash)
    ) {
      return false;
    }
    this.cancel();
    return true;
  }

  onExpired(listener: ExpiryListener): void {
    this.expiryListeners.add(listener);
  }

  private expire(): void {
    this.active = undefined;
    for (const listener of this.expiryListeners) {
      listener();
    }
  }
}
