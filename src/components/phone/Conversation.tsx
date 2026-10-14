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
    <p data-bubble={m.role} className={`max-w-[88%] rounded-tile px-4 py-3 ${large ? "text-xl" : "text-base"} ${BUBBLE[m.role]}`}>
      {m.role !== "notice" && <span className="sr-only">{who}: </span>}
      {m.shown ?? m.text}
    </p>
  );
}

/** P3: only the last two messages large; older ones behind "Earlier messages" (heuristic 8). */
export function Messages({ messages, locale }: { messages: ChatMessage[]; locale: Locale }) {
  const older = messages.slice(0, -2);
  const latest = messages.slice(-2);
  if (messages.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
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
  const ref = useRef<HTMLDivElement>(null);
  const shownId = last && last.role !== "user" ? last.id : 0;
  // A reply that lands below the fold (under P4's bottom bar or the dock) would go unread (15-judge-fixes:2).
  useEffect(() => {
    if (shownId > 0) keepInView(ref.current, ref.current);
  }, [shownId]);
  if (!last || last.role === "user") return null;
  return (
    <div ref={ref} className="flex flex-col">
      <Bubble m={last} locale={locale} />
    </div>
  );
}

/**
 * Scrolls the phone's scroll area so everything from the top of `from` to the bottom of `to` is in view, with
 * `reserve` px kept free at the bottom (for the cart summary that may appear there). When it does not fit, its top
 * goes to the top, so the start of a reply is never cut. Instant, so reduced motion needs nothing more.
 */
export function keepInView(from: Element | null, to: Element | null, reserve = 0) {
  const area = from?.closest("[data-phone-scroll]");
  if (!from || !to || !area) return;
  const box = area.getBoundingClientRect();
  const gap = 16;
  const top = from.getBoundingClientRect().top - gap;
  const bottom = to.getBoundingClientRect().bottom + gap + reserve;
  if (top < box.top || bottom - top > box.height) area.scrollTop += top - box.top;
  else if (bottom > box.bottom) area.scrollTop += bottom - box.bottom;
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
