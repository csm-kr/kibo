// Barge-in (owner 10-18): half-duplex shuts the mic while the AI speaks, so a person who talked over it lost their
// words and the AI kept going. While the mic is shut, each frame is checked here; loud speech for most of a short
// window means the person is talking, so the phone stops the AI and sends the frames kept since, start included.
// Echo cancellation leaves the AI's own voice low; the first frames of each shut stretch measure what is left of it,
// and the person must be clearly louder. The phone never cuts in on the order review (useLiveVoice.ts).

/** Mic frame RMS that counts as the person speaking close to the phone. */
export const BARGE_RMS = 0.05;
/** Loud frames needed within the last WINDOW_FRAMES (40 ms each): about a quarter second of speech. */
export const BARGE_FRAMES = 6;
const WINDOW_FRAMES = 8;
/** The first frames of a shut stretch only measure the echo (the person is listening as the AI starts). */
export const CALIBRATE_FRAMES = 6;
/** How much louder than the loudest echo frame the person must be. */
export const ECHO_FACTOR = 3;
/** Frames kept while the mic is shut and sent on a cut-in, so the first words are not lost (about half a second). */
export const PREROLL_FRAMES = 12;

export function bargeIn() {
  let kept: Float32Array[] = [];
  let window: boolean[] = [];
  let heard = 0;
  let echo = 0;
  const reset = () => {
    kept = [];
    window = [];
    heard = 0;
    echo = 0;
  };
  return {
    /** One frame heard while the mic is shut; true when the person is cutting in. */
    push(frame: Float32Array, rms: number): boolean {
      kept.push(frame);
      if (kept.length > PREROLL_FRAMES) kept.shift();
      if (++heard <= CALIBRATE_FRAMES) {
        echo = Math.max(echo, rms);
        return false;
      }
      window.push(rms >= Math.max(BARGE_RMS, echo * ECHO_FACTOR));
      if (window.length > WINDOW_FRAMES) window.shift();
      return window.filter(Boolean).length >= BARGE_FRAMES;
    },
    /** The kept frames, oldest first; the detector starts over. */
    take(): Float32Array[] {
      const out = kept;
      reset();
      return out;
    },
    reset,
  };
}
