"use client";

import { Keyboard, Mic, Volume2, VolumeX, X } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import type { VoiceState } from "@/hooks/useLiveVoice";
import { pt, type PhoneTextKey } from "@/lib/i18n/phone";
import type { Locale } from "@/types/menu";
import { StatusChip } from "./Conversation";
import { COMPACT, FOCUS, ICON, PRESS, PRIMARY_SMALL, SECONDARY_SMALL } from "./ui";

// The bottom dock (docs/UI_GUIDE.md "Phone design"): one 88px round mic in the middle, [Type] on the left, the AI
// voice switch on the right; at most 150px tall at 390x844. The text field appears only after [Type].
// Under the mic: what a tap does. Above the dock: what is happening, as a status pill. Color is never the only signal.

const STATUS: Partial<Record<VoiceState, PhoneTextKey>> = {
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

/** The words under a mic: what a tap does now. */
export function micAction(state: VoiceState): PhoneTextKey {
  if (!voiceActive(state)) return "micTap";
  return state === "connecting" || state === "reconnecting" ? "micCancel" : "micEnd";
}

/** The mic's state in words for screen readers, before what a tap does; its visible pill sits above the dock. */
export function MicState({ state, locale }: { state: VoiceState; locale: Locale }) {
  const key = STATUS[state];
  return key ? <span className="sr-only">{pt(key, locale)} </span> : null;
}

const SIDE = `${COMPACT} text-ink active:bg-kibo-tint disabled:opacity-60`;

export function Dock(props: {
  state: VoiceState;
  locale: Locale;
  /** The mic: no session or token yet. */
  disabled: boolean;
  /** [Send]: a message or a command is on its way. */
  sendDisabled?: boolean;
  onMic(): void;
  voiceOutput: boolean;
  onVoiceOutput(on: boolean): void;
  typing: boolean;
  onTyping(open: boolean): void;
  onSend(text: string): void;
  placeholder?: string;
  /** Extra pills above the dock ("Working…", a /demo voice timer). */
  status?: ReactNode;
  /** One plain sentence at the top of the dock: why voice stopped, or the noise hint. */
  note?: string | null;
  /** /demo after its message limit: shown instead of the text field, and [Type] goes away. */
  limit?: ReactNode;
  /** Receives the text field, so the panel can focus it when voice gives way to text. */
  inputElement?: (el: HTMLInputElement | null) => void;
}) {
  const { state, locale } = props;
  const typing = props.typing && !props.limit;
  const active = voiceActive(state);
  const statusKey = STATUS[state];
  const noteId = useId();
  // One filled primary per screen (I-142): while the text field is open, [Send] is the primary and the mic steps back.
  const micLook = active
    ? `border-[3px] border-kibo bg-white text-kibo ${state === "listening" ? "kibo-listen" : ""}`
    : typing
      ? "bg-kibo-tint text-kibo"
      : "bg-kibo text-white";
  return (
    <div className="flex flex-none flex-col gap-2">
      {(statusKey || props.status) && (
        <div className="flex flex-wrap justify-center gap-2 px-4">
          {statusKey && <StatusChip text={pt(statusKey, locale)} />}
          {props.status}
        </div>
      )}
      <div className="flex flex-col gap-3 rounded-t-sheet bg-white px-4 pt-3 pb-3 shadow-dock">
        {props.note && (
          <p id={noteId} className="rounded-tile bg-staff-tint px-4 py-2 text-base text-staff-ink">
            {props.note}
          </p>
        )}
        {props.limit}
        {typing && (
          <TypingSheet
            locale={locale}
            disabled={props.sendDisabled ?? false}
            placeholder={props.placeholder}
            describedBy={props.note ? noteId : undefined}
            onSend={props.onSend}
            inputElement={props.inputElement}
          />
        )}
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4">
          {props.limit ? (
            <span />
          ) : (
            <button type="button" aria-expanded={typing} onClick={() => props.onTyping(!typing)} className={`${SIDE} mt-4 justify-self-start`}>
              {typing ? <X {...ICON} /> : <Keyboard {...ICON} />}
              <span>{pt(typing ? "closeTyping" : "typeButton", locale)}</span>
            </button>
          )}
          <button
            type="button"
            data-voice-state={state}
            disabled={props.disabled}
            onClick={props.onMic}
            // gap-3: the listening pulse grows 12px past the circle and must not touch the label.
            className={`flex flex-col items-center gap-3 rounded-tile disabled:opacity-60 ${PRESS} ${FOCUS}`}
          >
            <span className={`flex size-22 items-center justify-center rounded-full ${micLook}`}>
              <Mic size={32} strokeWidth={2} aria-hidden />
            </span>
            <span className="text-base leading-normal font-semibold text-ink">
              <MicState state={state} locale={locale} />
              {pt(micAction(state), locale)}
            </span>
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={props.voiceOutput}
            onClick={() => props.onVoiceOutput(!props.voiceOutput)}
            className={`${SIDE} mt-4 justify-self-end`}
          >
            {props.voiceOutput ? <Volume2 {...ICON} /> : <VolumeX {...ICON} />}
            <span className="sr-only">{pt("aiVoice", locale)}</span>
            <span aria-hidden>{pt(props.voiceOutput ? "voiceOn" : "voiceOff", locale)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The text field and [Send]; 500 characters, like /api/chat. Opens with a 200ms rise (a fade with reduced motion).
 * `quiet`: [Send] is tinted, where another filled button already leads the screen (P4's [Yes, pay now], I-142).
 */
export function TypingSheet(props: {
  locale: Locale;
  disabled: boolean;
  placeholder?: string;
  quiet?: boolean;
  describedBy?: string;
  onSend(text: string): void;
  inputElement?: (el: HTMLInputElement | null) => void;
}) {
  // Destructured: the lint reads any prop next to a ref callback as a ref.
  const { locale, disabled, placeholder, quiet, describedBy, onSend, inputElement } = props;
  const [text, setText] = useState("");
  const inputId = useId();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    onSend(text);
    setText("");
  }
  return (
    <form onSubmit={submit} className="kibo-sheet-in flex gap-2">
      <label htmlFor={inputId} className="sr-only">
        {pt("inputLabel", locale)}
      </label>
      <input
        ref={inputElement}
        id={inputId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        enterKeyHint="send"
        autoComplete="off"
        aria-describedby={describedBy}
        placeholder={placeholder ?? pt("inputPlaceholder", locale)}
        className={`min-h-14 min-w-0 flex-1 rounded-tile border border-field bg-white px-4 text-xl placeholder:text-[#6B655C] ${FOCUS}`}
      />
      <button type="submit" disabled={disabled || !text.trim()} className={quiet ? SECONDARY_SMALL : PRIMARY_SMALL}>
        {pt("send", locale)}
      </button>
    </form>
  );
}
