"use client";

import { Keyboard, KeyboardOff, Mic, Volume2, VolumeX } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import type { VoiceState } from "@/hooks/useLiveVoice";
import { pt, type PhoneTextKey } from "@/lib/i18n/phone";
import type { Locale } from "@/types/menu";
import { StatusChip } from "./Conversation";
import { useAiText } from "./language";
import { COMPACT, FOCUS, ICON, PRESS, PRIMARY_SMALL, SECONDARY_SMALL } from "./ui";

// The bottom dock (docs/UI_GUIDE.md "Phone design"): one 88px round mic in the middle, [Type] on the left, the AI
// voice switch on the right; at most 150px tall at 390x844. The text field appears only after [Type].
// Under the mic: what the button does now. Above the dock: what is happening, as a status pill. Color is never the
// only signal. Hold to talk (owner 11-22, I-431): a tap starts voice; after that the microphone is sent only while
// the mic is held.

const STATUS: Partial<Record<VoiceState, PhoneTextKey>> = {
  connecting: "micConnecting",
  listening: "micListening",
  thinking: "micThinking",
  speaking: "micSpeaking",
  reconnecting: "reconnecting",
};

/** Voice is running (or getting there). */
export function voiceActive(state: VoiceState): boolean {
  return state !== "off" && state !== "error";
}

/** Voice is connected: holding the mic talks. */
export function voiceConnected(state: VoiceState): boolean {
  return state === "ready" || state === "listening" || state === "thinking" || state === "speaking";
}

/** The mic is held to talk: connected, or getting the connection back (a hold then waits for it). */
function micHolds(state: VoiceState): boolean {
  return voiceConnected(state) || state === "reconnecting";
}

/** The words under a mic: what the button does now. */
export function micAction(state: VoiceState): PhoneTextKey {
  if (!voiceActive(state)) return "micTap";
  if (!micHolds(state)) return "micCancel";
  return state === "listening" ? "micRelease" : "micHold";
}

/** No scrolling, text selection or long-press menu starts on a held mic. */
export const HOLD = "touch-none select-none [-webkit-touch-callout:none]";

/**
 * A mic button's events. Voice off: a tap starts it (`tap`; while it first connects, the same tap cancels). Starting
 * stays on the click, which browsers count as the gesture audio and the microphone prompt need. Connected: the
 * microphone is sent from pointer or key down until it comes up, leaves or is taken away. Whether a press is a tap or
 * a hold is decided when it goes down, so a hold that outlives the connection (the socket dropped meanwhile) never
 * ends as a tap that turns voice off.
 */
export function useMicEvents(state: VoiceState, on: { tap(): void; press(): void; release(): void }) {
  // The press now down (or the last one) began as a hold: its click is not a tap.
  const holding = useRef(false);
  const handlers = useRef(on);
  useEffect(() => {
    handlers.current = on;
  });
  // The button goes away under the finger (the review opens): the hold ends with it.
  useEffect(() => () => handlers.current.release(), []);

  const down = () => {
    holding.current = micHolds(state);
    if (holding.current) on.press();
    return holding.current;
  };
  const talkKey = (e: KeyboardEvent) => e.key === " " || e.key === "Enter";
  return {
    onClick: () => {
      if (holding.current) holding.current = false;
      else if (!micHolds(state)) on.tap();
    },
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      // The hold goes on when the finger slides off the button.
      if (down()) e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerUp: () => on.release(),
    onPointerCancel: () => {
      // No click follows a cancelled press.
      holding.current = false;
      on.release();
    },
    onLostPointerCapture: () => on.release(),
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      if (!talkKey(e)) return;
      // No click from a key that holds (nor from its repeats): it would be read as a tap.
      if (e.repeat ? holding.current : down()) e.preventDefault();
    },
    onKeyUp: (e: KeyboardEvent<HTMLButtonElement>) => {
      if (!talkKey(e) || !holding.current) return;
      e.preventDefault();
      holding.current = false;
      on.release();
    },
    onBlur: () => on.release(),
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
  };
}

export function MicState({ state, locale }: { state: VoiceState; locale: Locale }) {
  const key = STATUS[state];
  return key ? <span className="sr-only">{pt(key, locale)} </span> : null;
}

// One width for both side buttons, so [Type] and the voice switch sit the same distance from their edges (qa 10-16 F13).
const SIDE = `${COMPACT} min-w-20 text-ink active:bg-kibo-tint disabled:opacity-60`;

export function Dock(props: {
  state: VoiceState;
  locale: Locale;
  /** The mic: no session or token yet. */
  disabled: boolean;
  /** [Send]: a message or a command is on its way. */
  sendDisabled?: boolean;
  /** A tap on the mic while voice is off (start) or connecting (cancel). */
  onMic(): void;
  /** The connected mic went down, and came up: the microphone is sent in between. */
  onMicPress(): void;
  onMicRelease(): void;
  voiceOutput: boolean;
  onVoiceOutput(on: boolean): void;
  /** False on a small phone with larger text: the AI voice switch moves to the app bar's sheet (15-judge-fixes:2). */
  voiceSwitch?: boolean;
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
  /**
   * The phone: while the text field has focus (the on-screen keyboard is up), the 88px mic shrinks to 56px without
   * its label, so a small screen keeps room for the conversation. /demo runs on a laptop, where no keyboard covers it.
   */
  compactWhileTyping?: boolean;
}) {
  const { state, locale } = props;
  const ai = useAiText();
  const typing = props.typing && !props.limit;
  const active = voiceActive(state);
  const [inputFocused, setInputFocused] = useState(false);
  const compact = Boolean(props.compactWhileTyping) && typing && inputFocused && !active;
  const statusKey = STATUS[state];
  const noteId = useId();
  const mic = useMicEvents(state, { tap: props.onMic, press: props.onMicPress, release: props.onMicRelease });
  // One filled primary per screen (I-142): while the text field is open, [Send] is the primary and the mic steps back.
  // Waiting for a hold it is filled like at rest; ringed white while held or while the AI thinks or speaks.
  const micLook =
    active && state !== "ready"
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
            onFocusChange={setInputFocused}
          />
        )}
        <div className={`grid grid-cols-[1fr_auto_1fr] gap-4 ${compact ? "items-center" : "items-start"}`}>
          {props.limit ? (
            <span />
          ) : (
            <button
              type="button"
              aria-expanded={typing}
              // Open, it only hides the field and the keyboard ("Close" read as ending the order, 15-judge-fixes:2).
              aria-label={typing ? pt("closeTyping", locale) : undefined}
              onClick={() => props.onTyping(!typing)}
              className={`${SIDE} ${compact ? "" : "mt-4"} justify-self-start`}
            >
              {typing ? <KeyboardOff {...ICON} /> : <Keyboard {...ICON} />}
              <span>{pt(typing ? "closeTypingShort" : "typeButton", locale)}</span>
            </button>
          )}
          <button
            type="button"
            data-voice-state={state}
            data-compact={compact || undefined}
            disabled={props.disabled}
            {...mic}
            // gap-3: the listening pulse grows 12px past the circle and must not touch the label.
            className={`flex flex-col items-center rounded-tile disabled:opacity-60 ${compact ? "" : "gap-3"} ${HOLD} ${PRESS} ${FOCUS}`}
          >
            {/* While the keyboard is up, a 56px circle; its words stay for screen readers. */}
            <span className={`flex items-center justify-center rounded-full ${compact ? "size-14" : "size-22"} ${micLook}`}>
              <Mic size={compact ? 24 : 32} strokeWidth={2} aria-hidden />
            </span>
            <span className={compact ? "sr-only" : "text-base leading-normal font-semibold text-ink"}>
              <MicState state={state} locale={locale} />
              <span lang={ai.lang}>{ai.t(micAction(state), locale)}</span>
            </span>
          </button>
          {props.voiceSwitch === false ? (
            <span />
          ) : (
            <button
              type="button"
              role="switch"
              aria-checked={props.voiceOutput}
              onClick={() => props.onVoiceOutput(!props.voiceOutput)}
              className={`${SIDE} ${compact ? "" : "mt-4"} justify-self-end`}
            >
              {props.voiceOutput ? <Volume2 {...ICON} /> : <VolumeX {...ICON} />}
              <span className="sr-only">{pt("aiVoice", locale)}</span>
              <span aria-hidden>{pt(props.voiceOutput ? "voiceOn" : "voiceOff", locale)}</span>
            </button>
          )}
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
  /**
   * The field gained or lost focus. Losing it is reported a moment later and only if focus did not come back, so a
   * tap on [Send] lands before the dock changes height under the finger.
   */
  onFocusChange?: (focused: boolean) => void;
}) {
  // Destructured: the lint reads any prop next to a ref callback as a ref.
  const { locale, disabled, placeholder, quiet, describedBy, onSend, inputElement, onFocusChange } = props;
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
        onFocus={() => onFocusChange?.(true)}
        onBlur={(e) => {
          const field = e.currentTarget;
          setTimeout(() => {
            if (document.activeElement !== field) onFocusChange?.(false);
          }, 300);
        }}
        placeholder={placeholder ?? pt("inputPlaceholder", locale)}
        // A 12px inset leaves the hints room at 320px wide with larger text in English too (#1 30, I-133).
        className={`min-h-14 min-w-0 flex-1 rounded-tile border border-field bg-white px-3 text-xl placeholder:text-[#6B655C] ${FOCUS}`}
      />
      <button type="submit" disabled={disabled || !text.trim()} className={quiet ? SECONDARY_SMALL : PRIMARY_SMALL}>
        {pt("send", locale)}
      </button>
    </form>
  );
}
