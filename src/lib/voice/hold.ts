// Hold to talk (owner 11-22, I-431): the microphone goes to Live only while the user holds the mic button. With an
// open microphone in a loud place Live also heard the people around the phone: it never got the silence that ends
// a turn, and it answered and ordered for bystanders (spikes/crowd-voice/README.md). On release the phone tells
// Live the audio ended, so the turn closes without waiting for silence, and sends nothing until the next hold.
// Nothing recorded before the press is ever sent.

/** A hold shorter than this was a tap, not a word: the screen says to keep holding. */
export const SHORT_HOLD_MS = 400;

export function holdToTalk() {
  let held = false;
  let since = 0;
  /** A frame went to Live in this hold, so a release has something to end. */
  let sent = false;
  return {
    get held() {
      return held;
    },
    press(now: number) {
      if (held) return;
      held = true;
      since = now;
      sent = false;
    },
    /** One microphone frame: whether it goes to Live. `canSend`: connected, and the AI's voice is not playing. */
    frame(canSend: boolean): boolean {
      if (!held || !canSend) return false;
      sent = true;
      return true;
    },
    /**
     * The AI began an answer. A hold still down is over. True when frames went up in it: they are the start of a
     * sentence Live has not been told the end of (a second hold begun before the first one's answer).
     */
    answered(): boolean {
      const open = held && sent;
      held = false;
      sent = false;
      return open;
    },
    /** The button came up. `end`: tell Live the audio ended. `short`: it was only a tap. */
    release(now: number): { end: boolean; short: boolean } {
      if (!held) return { end: false, short: false };
      const out = { end: sent, short: now - since < SHORT_HOLD_MS };
      held = false;
      sent = false;
      return out;
    },
  };
}
