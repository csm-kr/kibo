"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CARD, PRIMARY, SECONDARY } from "@/components/assistant/styles";
import { browserInfo } from "@/lib/phone/inApp";
import { frameRms } from "@/lib/voice/e2eMarks";
import {
  browserLabel,
  micLevel,
  reloadVerdict,
  summaryLine,
  tonePcm,
  type MicPermission,
  type MicResult,
  type ReloadVerdict,
  type SpeakerResult,
} from "@/lib/voice/micTest";
import { base64ToFloat32, int16ToBase64 } from "@/lib/voice/pcm";

// /mic-test: the microphone and speaker through the same pieces the phone's voice uses (useLiveVoice): the
// getUserMedia constraints, public/audio/pcm-recorder-worklet.js, and 24 kHz buffers decoded like the AI voice.
// Nothing is sent anywhere: no session, no token, no Gemini. The level is computed and dropped frame by frame.
// sessionStorage keeps one flag ("the mic was granted in this tab") so a reload can tell whether it was remembered.

const OUTPUT_RATE = 24000;
const GRANTED_KEY = "kibo-mic-test-granted";
const noSubscribe = () => () => {};

async function permission(): Promise<MicPermission> {
  try {
    const s = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return s.state;
  } catch {
    // Older Safari and some in-app browsers cannot query the microphone.
    return "unknown";
  }
}

function micOutcome(e: unknown): MicResult["outcome"] {
  const name = e instanceof Error ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no-mic";
  return "error";
}

interface Mic {
  ctx: AudioContext;
  stream: MediaStream | null;
  node: AudioWorkletNode | null;
}

function release(m: Mic) {
  if (m.node) m.node.port.onmessage = null;
  m.node?.disconnect();
  m.stream?.getTracks().forEach((t) => t.stop());
  if (m.ctx.state !== "closed") void m.ctx.close().catch(() => {});
}

const OUTCOME_TEXT: Record<MicResult["outcome"], string> = {
  ok: "Microphone works. Speak and watch the bar move.",
  denied: "The microphone was blocked. Check the browser's site settings.",
  "no-mic": "No microphone was found.",
  error: "The microphone could not start.",
};

export function MicTest() {
  const ua = useSyncExternalStore<string | null>(noSubscribe, () => navigator.userAgent, () => null);
  const secure = useSyncExternalStore<boolean | null>(noSubscribe, () => window.isSecureContext, () => null);
  const worklet = useSyncExternalStore<boolean | null>(noSubscribe, () => typeof AudioWorkletNode === "function", () => null);
  const info = ua === null ? null : browserInfo(ua);

  const [mic, setMic] = useState<MicResult | null>(null);
  const [micBusy, setMicBusy] = useState(false);
  const [level, setLevel] = useState(0);
  const [speaker, setSpeaker] = useState<SpeakerResult | null>(null);
  const [speakerBusy, setSpeakerBusy] = useState(false);
  const [reload, setReload] = useState<ReloadVerdict>("test, reload, test again");
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const running = useRef<Mic | null>(null);
  /** Read once, at the first test of this page load, before this load sets the flag. */
  const grantedEarlier = useRef<boolean | null>(null);

  useEffect(() => () => void (running.current && release(running.current)), []);

  function stopMic() {
    if (running.current) release(running.current);
    running.current = null;
    setLevel(0);
  }

  async function testMic() {
    stopMic();
    setCopied(null);
    // Made inside the tap, as useLiveVoice does: iOS starts audio only from a user gesture.
    const m: Mic = { ctx: new AudioContext(), stream: null, node: null };
    void m.ctx.resume();
    running.current = m;
    setMicBusy(true);
    const before = await permission();
    if (grantedEarlier.current === null) {
      try {
        grantedEarlier.current = sessionStorage.getItem(GRANTED_KEY) === "1";
      } catch {
        grantedEarlier.current = false;
      }
      setReload(reloadVerdict(grantedEarlier.current, before));
    }
    let outcome: MicResult["outcome"] = "ok";
    let peak = 0;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("No getUserMedia", "NotFoundError");
      m.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      await m.ctx.audioWorklet.addModule("/audio/pcm-recorder-worklet.js");
      const node = new AudioWorkletNode(m.ctx, "pcm-recorder");
      node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        const l = micLevel(frameRms(e.data));
        setLevel(l);
        if (l > peak) {
          peak = l;
          setMic((r) => (r ? { ...r, peak } : r));
        }
      };
      m.ctx.createMediaStreamSource(m.stream).connect(node);
      // The node outputs silence; connecting it keeps the browser pulling audio through it.
      node.connect(m.ctx.destination);
      m.node = node;
    } catch (e) {
      outcome = micOutcome(e);
      release(m);
      if (running.current === m) running.current = null;
    }
    const after = await permission();
    if (outcome === "ok") {
      try {
        sessionStorage.setItem(GRANTED_KEY, "1");
      } catch {
        // Private mode: the reload check then says "test, reload, test again".
      }
    }
    setMic({
      outcome,
      before,
      after,
      contextRate: outcome === "ok" ? m.ctx.sampleRate : null,
      trackRate: m.stream?.getAudioTracks()[0]?.getSettings().sampleRate ?? null,
      peak,
    });
    setMicBusy(false);
  }

  async function testSpeaker() {
    setCopied(null);
    setSpeakerBusy(true);
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      setSpeaker({ state: "error", played: false });
      setSpeakerBusy(false);
      return;
    }
    // resume() inside the tap; it may never settle on a blocked context, so wait at most 1 s.
    await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 1000))]);
    const state = ctx.state;
    // The tone goes through the AI voice's decode and buffer path: 16-bit PCM as base64, a 24 kHz buffer.
    const data = base64ToFloat32(int16ToBase64(tonePcm(440, 600, OUTPUT_RATE)));
    const buf = ctx.createBuffer(1, data.length, OUTPUT_RATE);
    buf.copyToChannel(data, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const played = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 3000);
      src.onended = () => {
        clearTimeout(timer);
        resolve(true);
      };
      src.start();
    });
    void ctx.close().catch(() => {});
    setSpeaker({ state, played });
    setSpeakerBusy(false);
  }

  const line =
    info && secure !== null && worklet !== null && (mic || speaker)
      ? summaryLine({ browser: info, secure, worklet, mic, speaker, reload })
      : null;

  async function copy() {
    if (!line) return;
    try {
      await navigator.clipboard.writeText(line);
      setCopied("yes");
    } catch {
      setCopied("failed");
    }
  }

  const pct = Math.round(level * 100);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4 text-xl">
      <header className="flex flex-col gap-2">
        <h1 className="text-[28px] font-bold leading-tight">Microphone and speaker test</h1>
        <p className="text-base text-[#4B463F]">For the KIBO team, before recording. No order starts and nothing is sent or saved.</p>
      </header>

      <section className={CARD} aria-labelledby="browser-h">
        <h2 id="browser-h" className="mb-2 text-xl font-bold">
          This browser
        </h2>
        {info ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-base text-[#4B463F]">Browser</dt>
            <dd data-testid="browser">{browserLabel(info)}</dd>
            <dt className="text-base text-[#4B463F]">In-app</dt>
            <dd data-testid="in-app">{info.inApp ? `Yes, ${info.inApp}` : "No"}</dd>
            <dt className="text-base text-[#4B463F]">https</dt>
            <dd>{secure ? "Yes" : "No, the microphone needs https"}</dd>
            <dt className="text-base text-[#4B463F]">AudioWorklet</dt>
            <dd>{worklet ? "Supported" : "Not supported"}</dd>
          </dl>
        ) : (
          <p>Reading the browser…</p>
        )}
        {info?.inApp && (
          <p className="mt-2 text-base">
            In-app browsers often block the microphone. Run the test here, then open this page in Safari or Chrome and
            compare.
          </p>
        )}
      </section>

      <section className={`${CARD} flex flex-col gap-3`} aria-labelledby="mic-h">
        <h2 id="mic-h" className="text-xl font-bold">
          Microphone
        </h2>
        <button type="button" className={PRIMARY} onClick={() => void testMic()} disabled={micBusy}>
          {micBusy ? "Starting…" : mic ? "Test microphone again" : "Test microphone"}
        </button>
        <p className="flex justify-between text-base text-[#4B463F]" aria-hidden="true">
          <span>Level</span>
          <span>{pct}%</span>
        </p>
        <div
          role="meter"
          aria-label="Microphone level"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          data-testid="mic-level"
          className="h-8 w-full overflow-hidden rounded-full border-2 border-[#15171C] bg-[#F3EEE4]"
        >
          <div className="h-full bg-[#3446D4]" style={{ width: `${pct}%` }} />
        </div>
        {mic && (
          <div className="flex flex-col gap-1" aria-live="polite">
            <p>{OUTCOME_TEXT[mic.outcome]}</p>
            <p className="text-base text-[#4B463F]">
              Permission before: {mic.before}, after: {mic.after}
              {mic.contextRate ? ` · ${mic.contextRate} Hz` : ""}
              {mic.trackRate ? ` (track ${mic.trackRate} Hz)` : ""}
              {mic.outcome === "ok" ? ` · peak ${Math.round(mic.peak * 100)}%` : ""}
            </p>
          </div>
        )}
        {mic?.outcome === "ok" && (
          <button type="button" className={SECONDARY} onClick={stopMic}>
            Stop microphone
          </button>
        )}
      </section>

      <section className={`${CARD} flex flex-col gap-3`} aria-labelledby="speaker-h">
        <h2 id="speaker-h" className="text-xl font-bold">
          Speaker
        </h2>
        <p className="text-base">Plays a short beep the way the AI voice plays. On iPhone, try with the silent switch on and off.</p>
        <button type="button" className={PRIMARY} onClick={() => void testSpeaker()} disabled={speakerBusy}>
          {speakerBusy ? "Playing…" : "Test speaker"}
        </button>
        {speaker && (
          <p aria-live="polite">
            {speaker.state === "running" ? "Audio started after the tap." : `Audio did not start (${speaker.state}).`}{" "}
            {speaker.played ? "Did you hear a beep?" : "The beep did not play."}
          </p>
        )}
      </section>

      <section className={`${CARD} flex flex-col gap-2`} aria-labelledby="reload-h">
        <h2 id="reload-h" className="text-xl font-bold">
          Permission remembered on reload?
        </h2>
        <ol className="list-decimal pl-6 text-base">
          <li>Tap Test microphone and allow it.</li>
          <li>Reload this page.</li>
          <li>Tap Test microphone again. If the browser asks again, it does not remember.</li>
        </ol>
        <p className="text-base text-[#4B463F]">The result line says &quot;reload: remembered&quot; where the browser can tell.</p>
      </section>

      {line && (
        <section className={`${CARD} flex flex-col gap-3`} aria-labelledby="result-h">
          <h2 id="result-h" className="text-xl font-bold">
            Result
          </h2>
          <p data-testid="result-line" className="select-all text-base [overflow-wrap:anywhere]">
            {line}
          </p>
          <button type="button" className={SECONDARY} onClick={() => void copy()}>
            Copy result
          </button>
          {copied && (
            <p aria-live="polite" className="text-base">
              {copied === "yes" ? "Copied. Paste it in the team chat." : "Copy failed. Press and hold the line to select it."}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
