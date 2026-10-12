"use client";

import type { VoiceState } from "@/hooks/useLiveVoice";
import { pt, voiceSecondsLeft, type PhoneTextKey } from "@/lib/i18n/phone";
import type { Locale } from "@/types/menu";
import { FOCUS } from "./styles";

// The mic button and the AI voice switch above the text input (docs/UX.md A5, P3). The label names the state, so
// color is never the only signal; the pulse runs only while listening and is static with reduced motion.

const LABEL: Record<VoiceState, PhoneTextKey> = {
  off: "micTap",
  error: "micTap",
  connecting: "micConnecting",
  listening: "micListening",
  thinking: "micThinking",
  speaking: "micSpeaking",
  reconnecting: "reconnecting",
};

/** Voice is running (or getting there): a tap stops it. */
export function voiceActive(state: VoiceState): boolean {
  return state !== "off" && state !== "error";
}

export function VoiceControls(props: {
  state: VoiceState;
  locale: Locale;
  disabled: boolean;
  onMic(): void;
  voiceOutput: boolean;
  onVoiceOutput(on: boolean): void;
  /** Shown when set (a /demo order under 60 s of voice). */
  secondsLeft: number | null;
}) {
  const { state, locale } = props;
  const active = voiceActive(state);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-voice-state={state}
          disabled={props.disabled}
          onClick={props.onMic}
          className={`flex min-h-22 flex-[1_1_14rem] items-center gap-3 rounded-full px-3 py-3 text-left disabled:opacity-60 ${
            active ? "border-[3px] border-[#3446D4] bg-white text-[#15171C]" : "bg-[#3446D4] text-white active:bg-[#2735A8]"
          } ${FOCUS}`}
        >
          <span
            className={`relative flex size-16 flex-none items-center justify-center rounded-full ${
              active ? "bg-[#3446D4] text-white" : "bg-white text-[#3446D4]"
            } ${state === "listening" ? "kibo-listen" : ""}`}
          >
            <MicIcon />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-xl font-bold">{pt(LABEL[state], locale)}</span>
            {active && <span className="text-base text-[#4B463F]">{pt("micStop", locale)}</span>}
          </span>
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={props.voiceOutput}
          onClick={() => props.onVoiceOutput(!props.voiceOutput)}
          className={`flex min-h-22 min-w-22 flex-none flex-col items-center justify-center rounded-[18px] border-2 border-[#15171C] bg-white px-3 text-base font-bold text-[#15171C] active:bg-[#F3EEE4] ${FOCUS}`}
        >
          <SpeakerIcon off={!props.voiceOutput} />
          <span>{pt("aiVoice", locale)}</span>
          <span aria-hidden className="font-normal">
            {pt(props.voiceOutput ? "on" : "off", locale)}
          </span>
        </button>
      </div>
      {props.secondsLeft !== null && (
        <p role="timer" className="text-base font-bold text-[#7A2E0E]">
          {voiceSecondsLeft(props.secondsLeft, locale)}
        </p>
      )}
    </div>
  );
}

export function MicIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}

function SpeakerIcon({ off }: { off: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      {off ? <path d="m16 9.5 5 5m0-5-5 5" /> : <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />}
    </svg>
  );
}
