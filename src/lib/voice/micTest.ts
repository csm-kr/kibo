import type { BrowserInfo } from "@/lib/phone/inApp";

// Pure helpers for /mic-test, the team's real-phone check of the microphone and the AI voice's playback path
// before recording (docs/plan/SCHEDULE.md). Nothing here records, uploads or stores audio.

export type MicPermission = "granted" | "denied" | "prompt" | "unknown";

export interface MicResult {
  outcome: "ok" | "denied" | "no-mic" | "error";
  /** navigator.permissions before the tap and after getUserMedia; "unknown" where the browser cannot tell. */
  before: MicPermission;
  after: MicPermission;
  /** The AudioContext's rate (what the worklet runs at) and the mic track's own, when it reports one. */
  contextRate: number | null;
  trackRate: number | null;
  /** Highest micLevel seen, 0..1. */
  peak: number;
}

export interface SpeakerResult {
  /** AudioContext.state right after the tap's resume(); iOS plays nothing unless it is "running". */
  state: AudioContextState | "error";
  played: boolean;
}

export type ReloadVerdict =
  | "test, reload, test again"
  | "remembered"
  | "not remembered"
  | "denied"
  | "unknown, did the browser ask again?";

export interface MicTestReport {
  browser: BrowserInfo;
  secure: boolean;
  worklet: boolean;
  mic: MicResult | null;
  speaker: SpeakerResult | null;
  reload: ReloadVerdict;
}

/** RMS of a frame on a -60..0 dB scale, 0..1, so quiet speech still moves the meter. */
export function micLevel(rms: number): number {
  if (rms <= 0) return 0;
  return Math.max(0, Math.min(1, (20 * Math.log10(rms) + 60) / 60));
}

const FADE_MS = 10;

/** A sine tone as 16-bit PCM, faded in and out so it does not click. Half of full scale. */
export function tonePcm(hz: number, ms: number, rate: number): Int16Array {
  const n = Math.round((rate * ms) / 1000);
  const fade = Math.max(1, Math.round((rate * FADE_MS) / 1000));
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const gain = Math.min(1, i / fade, (n - 1 - i) / fade);
    out[i] = Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * gain * 0.5 * 0x7fff);
  }
  return out;
}

/** After a grant in this tab and a reload, the permission state before the next test says whether it was kept. */
export function reloadVerdict(grantedEarlier: boolean, before: MicPermission): ReloadVerdict {
  if (!grantedEarlier) return "test, reload, test again";
  if (before === "granted") return "remembered";
  if (before === "prompt") return "not remembered";
  if (before === "denied") return "denied";
  return "unknown, did the browser ask again?";
}

/** "iOS Safari", "Android Chrome"; a desktop browser by its family alone. */
export function browserLabel(b: BrowserInfo): string {
  return b.os === "other" ? b.family : `${b.os} ${b.family}`;
}

/** One line the tester pastes into the team chat. No audio, transcript or identifier beyond the browser family. */
export function summaryLine(r: MicTestReport): string {
  const yes = (b: boolean) => (b ? "yes" : "no");
  let mic = "not tested";
  if (r.mic) {
    mic = `${r.mic.outcome} (${r.mic.before} -> ${r.mic.after})`;
    if (r.mic.contextRate) mic += `, ${r.mic.contextRate} Hz`;
    if (r.mic.trackRate) mic += `, track ${r.mic.trackRate} Hz`;
    if (r.mic.outcome === "ok") mic += `, peak ${Math.round(r.mic.peak * 100)}%`;
  }
  const speaker = r.speaker ? `${r.speaker.state} after tap, tone ${r.speaker.played ? "played" : "not played"}` : "not tested";
  return [
    "KIBO mic-test",
    browserLabel(r.browser),
    `in-app: ${r.browser.inApp ?? "no"}`,
    `https: ${yes(r.secure)}`,
    `worklet: ${yes(r.worklet)}`,
    `mic: ${mic}`,
    `speaker: ${speaker}`,
    `reload: ${r.reload}`,
  ].join(" | ");
}
