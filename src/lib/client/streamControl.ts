// When a screen's session stream is open (12-phone-app:7). An open stream keeps a Cloud Run instance billed as
// active, so a tab nobody looks at must not hold one: a hidden tab closes it after 60 s, and a screen with no
// session change and no input for 20 min pauses until someone taps it. Kiosk screens turn the idle pause off
// (I-172): a kiosk waits on K1 with its QR for a phone, and a learned kiosk's bridge must replay as soon as a phone
// orders. Plain timers, no DOM, so it is unit-tested.

export const HIDDEN_CLOSE_MS = 60_000;
export const IDLE_PAUSE_MS = 20 * 60_000;

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

  constructor(
    private readonly opts: {
      /** Opens a new stream; called again after a hidden close or a pause. */
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
    else if (!this.paused) this.openSource();
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
    this.closeSource();
  }

  private armIdle(): void {
    clearTimeout(this.idleTimer);
    if (this.opts.idlePause === false) return;
    this.idleTimer = setTimeout(() => {
      this.paused = true;
      clearTimeout(this.hiddenTimer);
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
