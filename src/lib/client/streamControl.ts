// When a screen's session stream is open (12-phone-app:7). An open stream keeps a Cloud Run instance billed as
// active, so a tab nobody looks at must not hold one: a hidden tab closes it after 60 s, and a screen with no
// session change and no input for 20 min pauses until someone taps it. Kiosk screens turn the idle pause off
// (I-172): a kiosk waits on K1 with its QR for a phone, and a learned kiosk's bridge must replay as soon as a phone
// orders. A stream the server refused for good (a 429 or 503 reply closes EventSource) is reopened after 3 s, 6 s,
// 12 s, … up to 30 s (I-033). Plain timers, no DOM, so it is unit-tested.

export const HIDDEN_CLOSE_MS = 60_000;
export const IDLE_PAUSE_MS = 20 * 60_000;
/** The first wait before reopening a refused stream; each failure in a row doubles it, up to RETRY_MAX_MS. */
export const RETRY_FIRST_MS = 3_000;
export const RETRY_MAX_MS = 30_000;

export interface Closable {
  close(): void;
}

export class StreamControl {
  private source: Closable | null = null;
  private hidden = false;
  private paused = false;
  private stopped = false;
  private hiddenTimer: ReturnType<typeof setTimeout> | undefined;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  /** Failures in a row since the last successful open. */
  private failures = 0;

  constructor(
    private readonly opts: {
      /** Opens a new stream; called again after a hidden close, a pause or a refusal. */
      open: () => Closable;
      onPause: (paused: boolean) => void;
      idleMs?: number;
      /** False on kiosk screens: never pause while visible; the hidden close still applies. Default true. */
      idlePause?: boolean;
    },
  ) {}

  start(hidden: boolean): void {
    this.openSource();
    this.armIdle();
    this.setHidden(hidden);
  }

  setHidden(hidden: boolean): void {
    if (this.stopped) return;
    this.hidden = hidden;
    clearTimeout(this.hiddenTimer);
    if (hidden) this.hiddenTimer = setTimeout(() => this.closeSource(), HIDDEN_CLOSE_MS);
    // While a retry waits, it decides when to reopen.
    else if (!this.paused && this.retryTimer === undefined) this.openSource();
  }

  /** The stream opened: the next refusal waits RETRY_FIRST_MS again. */
  opened(): void {
    this.failures = 0;
  }

  /** The stream closed for good (EventSource CLOSED). Reopens it after the next wait, if visible and not paused. */
  failed(): void {
    if (this.stopped) return;
    this.closeSource();
    clearTimeout(this.retryTimer);
    const wait = Math.min(RETRY_FIRST_MS * 2 ** this.failures, RETRY_MAX_MS);
    this.failures++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      if (!this.hidden && !this.paused) this.openSource();
    }, wait);
  }

  /** A pointer or key press, or a session change. Does not end a pause: that takes resume(). */
  activity(): void {
    if (this.stopped || this.paused) return;
    this.armIdle();
  }

  resume(): void {
    if (this.stopped || !this.paused) return;
    this.paused = false;
    this.opts.onPause(false);
    this.armIdle();
    if (!this.hidden) this.openSource();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.hiddenTimer);
    clearTimeout(this.idleTimer);
    clearTimeout(this.retryTimer);
    this.closeSource();
  }

  private armIdle(): void {
    clearTimeout(this.idleTimer);
    if (this.opts.idlePause === false) return;
    this.idleTimer = setTimeout(() => {
      this.paused = true;
      clearTimeout(this.hiddenTimer);
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
      this.closeSource();
      this.opts.onPause(true);
    }, this.opts.idleMs ?? IDLE_PAUSE_MS);
  }

  private openSource(): void {
    if (!this.source) this.source = this.opts.open();
  }

  private closeSource(): void {
    this.source?.close();
    this.source = null;
  }
}
