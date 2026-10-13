"use client";

import { useEffect, useRef } from "react";
import { pt } from "@/lib/i18n/phone";
import type { ChatMessage } from "@/lib/phone/chat";
import type { Locale } from "@/types/menu";
import { FOCUS } from "./ui";

// Conversation in the phone design (docs/UI_GUIDE.md "Phone design"). Model text is plain React text, never HTML.

const BUBBLE: Record<ChatMessage["role"], string> = {
  user: "self-end rounded-br-sm bg-kibo-bubble text-ink",
  model: "self-start rounded-bl-sm bg-white text-ink shadow-card",
  notice: "self-stretch bg-staff-tint text-staff-ink",
};

/** One message: the last two are large (20px), older ones 16px (heuristic 8). */
export function Bubble({ m, locale, large = true }: { m: ChatMessage; locale: Locale; large?: boolean }) {
  const who = m.role === "user" ? pt("you", locale) : pt("assistant", locale);
  return (
    <p className={`max-w-[88%] rounded-tile px-4 py-3 ${large ? "text-xl" : "text-base"} ${BUBBLE[m.role]}`}>
      {m.role !== "notice" && <span className="sr-only">{who}: </span>}
      {m.text}
    </p>
  );
}

/** P3: only the last two messages large; older ones behind "Earlier messages" (heuristic 8). */
export function Messages({ messages, locale, working }: { messages: ChatMessage[]; locale: Locale; working: boolean }) {
  const older = messages.slice(0, -2);
  const latest = messages.slice(-2);
  const lastId = messages.at(-1)?.id ?? 0;
  const endRef = useRef<HTMLDivElement>(null);
  // The user usually taps a suggestion or Send at the bottom; the answer appears up here, so bring it into view.
  useEffect(() => {
    if (lastId > 0 || working) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lastId, working]);
  if (messages.length === 0) return null;
  return (
    <div ref={endRef} className="flex scroll-mt-4 flex-col gap-2">
      {older.length > 0 && (
        <details className="flex flex-col gap-2">
          <summary className={`flex min-h-14 cursor-pointer items-center rounded-tile px-2 text-base font-semibold text-muted ${FOCUS}`}>
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
        <Bubble key={m.id} m={m} locale={locale} />
      ))}
    </div>
  );
}

/** Other screens show only the newest reply or notice, so an answer or an error is never lost. */
export function LastMessage({ messages, locale }: { messages: ChatMessage[]; locale: Locale }) {
  const last = messages.at(-1);
  if (!last || last.role === "user") return null;
  return (
    <div className="flex flex-col">
      <Bubble m={last} locale={locale} />
    </div>
  );
}

/** A small state pill above the dock ("Listening…", "Working…"); the dot is decoration, the words carry the state. */
export function StatusChip({ text, tone = "kibo" }: { text: string; tone?: "kibo" | "warn" }) {
  return (
    <p
      role="status"
      className={`flex w-fit items-center gap-2 rounded-full px-3 py-1 text-base font-semibold ${
        tone === "warn" ? "bg-staff-tint text-staff-ink" : "bg-white text-kibo-deep shadow-card"
      }`}
    >
      <span aria-hidden className={`size-2 rounded-full ${tone === "warn" ? "bg-staff-ink" : "bg-kibo"}`} />
      {text}
    </p>
  );
}
