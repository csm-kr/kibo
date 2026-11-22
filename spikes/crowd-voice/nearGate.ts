// Near-voice gate, an experiment (owner 11-22, README.md): in a loud place the phone's microphone also hears the
// people around it. The person holding the phone is much louder at its microphone than anyone a step away, so the
// gate learns how loud the user is and sends silence for anything clearly quieter. Silence, not nothing: Live ends
// a turn only after it has heard silence.
// NOT used by the app. An independent review (11-22) confirmed that it can shut the user out with no way back but a
// microphone restart: nothing below the bar is learned and nothing decays, so a user who speaks 12 dB more quietly
// than before, or a louder sound of 200 to 500 ms, leaves the bar above the user's voice. See README.md "Limits".

import { frameRms } from "@/lib/voice/e2eMarks";

/** The level assumed until the user has spoken: a little under the cut-in detector's "speaking close to the phone"
 *  (BARGE_RMS, bargeIn.ts). The learned level never goes below it, so bystanders heard first cannot set it. */
export const START_LEVEL = 0.04;
/** A frame counts as the user from this share of their learned level (about 9 dB below it). */
export const NEAR_RATIO = 0.35;
/** Loud frames kept to learn the user's level from (about 2 s of speech). */
const LEVEL_FRAMES = 50;
/** Loud frames at a new level before it moves the learned one: a cough or a bump is shorter. */
export const LEARN_FRAMES = Math.ceil(LEVEL_FRAMES / 4);
/** Loud frames needed within the last WINDOW_FRAMES to open the gate. */
const OPEN_FRAMES = 2;
const WINDOW_FRAMES = 3;
/** The gate stays open for this many frames less one after the last loud one (280 ms): word ends, soft consonants. */
export const HANG_FRAMES = 8;
/** Frames held back while shut. When the gate opens on its second loud frame, the one frame before the first loud
 *  frame goes out with them (40 ms). */
export const LOOKBACK_FRAMES = 2;

export function nearGate() {
  /** RMS of the last loud frames, oldest first. */
  const levels: number[] = [];
  let held: Float32Array[] = [];
  const window: boolean[] = [];
  let hang = 0;

  /** The user's level: the upper quartile of the loud frames, so neither pauses nor one burst set it. */
  function level(): number {
    if (levels.length < LEARN_FRAMES) return START_LEVEL;
    const sorted = [...levels].sort((a, b) => a - b);
    return Math.max(START_LEVEL, sorted[Math.floor(sorted.length * 0.75)]);
  }

  const bar = () => level() * NEAR_RATIO;

  return {
    /** One microphone frame in; the frames to send now, in order: the same audio, or silence of the same length. */
    push(frame: Float32Array): Float32Array[] {
      const rms = frameRms(frame);
      const loud = rms >= bar();
      if (loud) {
        levels.push(rms);
        if (levels.length > LEVEL_FRAMES) levels.shift();
      }
      window.push(loud);
      if (window.length > WINDOW_FRAMES) window.shift();
      held.push(frame);
      if (loud && (hang > 0 || window.filter(Boolean).length >= OPEN_FRAMES)) hang = HANG_FRAMES;
      else if (hang > 0) hang--;
      if (hang > 0) {
        const out = held;
        held = [];
        return out;
      }
      const out: Float32Array[] = [];
      while (held.length > LOOKBACK_FRAMES) out.push(new Float32Array(held.shift()!.length));
      return out;
    },
  };
}
