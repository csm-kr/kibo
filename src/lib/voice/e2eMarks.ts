// Test-only latency marks for e2e/voice.live.spec.ts (docs/TESTING.md "Latency"). On only when the page URL has
// `?e2e=1`; then they live on `window.__kiboVoiceTimings` as performance.now() values. No audio or text is kept.

/** A frame of the TTS fixture at or above this RMS is speech; the fixture's padding is digital silence. */
const VOICED_RMS = 0.01;
/** Longer than any pause inside a fixture sentence (≤ 0.5 s), shorter than its 2 s tail: the utterance is over. */
const UTTERANCE_END_MS = 1500;
/** Silence this long is the gap between two plays of the file (2 s tail + 1 s lead), not a pause inside it. */
const GAP_MS = 1000;

export interface VoiceMarks {
  /** Frames go to Live only after 1 s of silence: the fake mic loops a file and may start mid-sentence. */
  open: boolean;
  quietSince: number | null;
  /** One utterance was sent; from now on only silent frames go, so the looping file never speaks twice. */
  done: boolean;
  lastVoiced: number | null;
  /** The last voiced frame sent before the model's first output: the end of the user's speech. */
  speechEnd: number | null;
  firstOutput: number | null;
  firstAudio: number | null;
  firstTool: number | null;
}

declare global {
  interface Window {
    __kiboVoiceTimings?: VoiceMarks;
  }
}

export function newMarks(): VoiceMarks {
  return { open: false, quietSince: null, done: false, lastVoiced: null, speechEnd: null, firstOutput: null, firstAudio: null, firstTool: null };
}

/** The marks when the page runs under the voice E2E, else null. */
export function e2eMarks(): VoiceMarks | null {
  if (typeof window === "undefined" || new URLSearchParams(window.location.search).get("e2e") !== "1") return null;
  window.__kiboVoiceTimings ??= newMarks();
  return window.__kiboVoiceTimings;
}

export function frameRms(frame: Float32Array): number {
  let sum = 0;
  for (const x of frame) sum += x * x;
  return frame.length ? Math.sqrt(sum / frame.length) : 0;
}

/** Whether this mic frame may be sent; records when speech was last heard. */
export function e2eFrame(m: VoiceMarks, rms: number, now: number): boolean {
  const voiced = rms >= VOICED_RMS;
  if (!m.open) {
    m.quietSince = voiced ? null : (m.quietSince ?? now);
    if (m.quietSince === null || now - m.quietSince < GAP_MS) return false;
    m.open = true;
  }
  if (m.done) return !voiced;
  if (voiced) m.lastVoiced = now;
  else if (m.lastVoiced !== null && now - m.lastVoiced >= UTTERANCE_END_MS) m.done = true;
  return true;
}

/** The model produced output: a tool call, a transcript or an audio chunk. */
export function e2eOutput(m: VoiceMarks, kind: "tool" | "text" | "audio", now: number) {
  if (m.lastVoiced === null) return;
  if (m.firstOutput === null) {
    m.firstOutput = now;
    m.speechEnd = m.lastVoiced;
    // The reply mutes the mic (half-duplex) before 1.5 s of silence may have gone by; the utterance is over anyway.
    m.done = true;
  }
  if (kind === "audio" && m.firstAudio === null) m.firstAudio = now;
  if (kind === "tool" && m.firstTool === null) m.firstTool = now;
}
