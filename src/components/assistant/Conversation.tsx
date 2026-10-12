"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { pt } from "@/lib/i18n/phone";
import type { ChatMessage } from "@/lib/phone/chat";
import type { Locale } from "@/types/menu";
import { CHIP, FOCUS } from "./styles";

// Model text is shown as plain React text (escaped), never as HTML, and never goes into the session.

const BUBBLE: Record<ChatMessage["role"], string> = {
  user: "self-end bg-[#15171C] text-white",
  model: "self-start bg-[#EEF0FD] text-[#1F2A8A]",
  notice: "self-stretch border-2 border-[#7A2E0E] bg-[#FFF1CC] text-[#7A2E0E]",
};

function Bubble({ m, locale, large }: { m: ChatMessage; locale: Locale; large: boolean }) {
  const who = m.role === "user" ? pt("you", locale) : pt("assistant", locale);
  return (
    <p className={`max-w-[92%] rounded-[18px] px-4 py-2 ${large ? "text-xl" : "text-base"} ${BUBBLE[m.role]}`}>
      {m.role !== "notice" && <span className="sr-only">{who}: </span>}
      {m.text}
    </p>
  );
}

/** P3: only the last two messages large; older ones behind "Earlier messages" (heuristic 8). */
export function Conversation(props: { messages: ChatMessage[]; locale: Locale; working: boolean }) {
  const { messages, locale, working } = props;
  const older = messages.slice(0, -2);
  const latest = messages.slice(-2);
  const lastId = messages.at(-1)?.id ?? 0;
  const endRef = useRef<HTMLDivElement>(null);
  // The user usually taps a chip or Send at the bottom; the answer appears up here, so bring it into view.
  useEffect(() => {
    if (lastId > 0 || working) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lastId, working]);
  if (messages.length === 0 && !working) return null;
  return (
    <div ref={endRef} className="flex scroll-mt-4 flex-col gap-2">
      {older.length > 0 && (
        <details className="flex flex-col gap-2">
          <summary className={`flex min-h-14 cursor-pointer items-center rounded-[18px] px-2 text-base font-bold text-[#4B463F] ${FOCUS}`}>
            {pt("earlier", locale)}
          </summary>
          <div className="flex flex-col gap-2 pb-2">
            {older.map((m) => (
              <Bubble key={m.id} m={m} locale={locale} large={false} />
            ))}
          </div>
        </details>
      )}
      {latest.map((m) => (
        <Bubble key={m.id} m={m} locale={locale} large />
      ))}
      {props.working && (
        <p role="status" className="self-start rounded-[18px] bg-white px-4 py-2 text-xl text-[#4B463F]">
          {pt("working", locale)}
        </p>
      )}
    </div>
  );
}

/** Other screens show only the newest reply or notice, so an answer or an error is never lost. */
export function LastMessage({ messages, locale }: { messages: ChatMessage[]; locale: Locale }) {
  const last = messages.at(-1);
  if (!last || last.role === "user") return null;
  return (
    <div className="flex flex-col">
      <Bubble m={last} locale={locale} large />
    </div>
  );
}

export function Examples(props: { examples: string[]; locale: Locale; disabled: boolean; onPick(text: string): void }) {
  const titleId = useId();
  if (props.examples.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-base font-bold text-[#4B463F]">
        {pt("examples", props.locale)}
      </h2>
      <div className="flex flex-col gap-2">
        {props.examples.map((text) => (
          <button key={text} type="button" disabled={props.disabled} onClick={() => props.onPick(text)} className={CHIP}>
            {text}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Text input + [Send]; 500 characters, like /api/chat. */
export function Composer(props: {
  locale: Locale;
  disabled: boolean;
  hint?: string;
  /** Defaults to a MALO BURGER example; a learned kiosk passes one from its own menu. */
  placeholder?: string;
  onSend(text: string): void;
  /** Receives the input element, so the panel can focus it when voice gives way to text. */
  inputElement?: (el: HTMLInputElement | null) => void;
}) {
  const { inputElement } = props;
  const [text, setText] = useState("");
  const inputId = useId();
  const hintId = useId();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || props.disabled) return;
    props.onSend(text);
    setText("");
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      {props.hint && (
        <p id={hintId} className="text-base text-[#4B463F]">
          {props.hint}
        </p>
      )}
      <div className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          {pt("inputLabel", props.locale)}
        </label>
        <input
          ref={inputElement}
          id={inputId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          enterKeyHint="send"
          autoComplete="off"
          placeholder={props.placeholder ?? pt("inputPlaceholder", props.locale)}
          aria-describedby={props.hint ? hintId : undefined}
          className={`min-h-14 min-w-0 flex-1 rounded-[18px] border-2 border-[#15171C] bg-white px-4 text-xl placeholder:text-[#6B655C] ${FOCUS}`}
        />
        <button
          type="submit"
          disabled={props.disabled || !text.trim()}
          className={`flex min-h-14 min-w-14 flex-none items-center justify-center rounded-[18px] bg-[#3446D4] px-4 text-xl font-bold text-white disabled:opacity-60 ${FOCUS}`}
        >
          {pt("send", props.locale)}
        </button>
      </div>
    </form>
  );
}
