// Speech held back while the phone has no connection (I-439, owner 11-22: "the first press does not take my voice").
// A hold may begin while voice still connects, or reconnects: its frames wait here and go up when the connection
// opens, oldest first, each hold followed by its end signal. So a sentence reaches Live whole or not at all, never
// with its head cut off.
//
// The waiting frames go up four times faster than real time, not all at once: in spikes/crowd-voice/first-press.ts
// Live lost 2 of 12 whole sentences sent in one burst, and none sent at four times speed (README there).

/** After the last frame of a released hold: tell Live its audio ended. */
export const END = Symbol("end of a hold");

/** The microphone's frame length (public/audio/pcm-recorder-worklet.js). */
const FRAME_MS = 40;
/** One waiting frame goes up every this many ms. */
export const CATCH_UP_GAP_MS = FRAME_MS / 4;
/** No more than this much speech waits; a connection that takes longer has failed the hold (useLiveVoice ends it). */
const MAX_FRAMES = 15_000 / FRAME_MS;

export function heldBack(maxFrames = MAX_FRAMES) {
  let queue: (string | typeof END)[] = [];
  /** Frames at the end of the queue that belong to the hold not ended yet. */
  let open = 0;
  const frames = () => queue.reduce((n, x) => (x === END ? n : n + 1), 0);
  return {
    /** Something waits to go up: a new frame must queue behind it. */
    get waiting(): boolean {
      return queue.length > 0;
    },
    /** One frame of the hold now down. False when the limit is reached: the frame is not taken. */
    add(frame: string): boolean {
      if (frames() >= maxFrames) return false;
      queue.push(frame);
      open++;
      return true;
    },
    /** The hold was released: its end signal follows its last waiting frame. */
    end(): void {
      if (queue.length > 0 && queue[queue.length - 1] !== END) queue.push(END);
      open = 0;
    },
    /** Forgets the waiting frames of the hold not ended yet (a short tap, or a hold that cannot arrive whole). */
    dropOpen(): void {
      queue.splice(queue.length - open, open);
      open = 0;
    },
    /** The next thing to send, or null. */
    next(): string | typeof END | null {
      const x = queue.shift();
      if (x === undefined) return null;
      // A frame of the open hold left the queue.
      if (x !== END && queue.length < open) open = queue.length;
      return x;
    },
    clear(): void {
      queue = [];
      open = 0;
    },
  };
}
