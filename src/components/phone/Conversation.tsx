"use client";

import { pt } from "@/lib/i18n/phone";
import type { ChatMessage } from "@/lib/phone/chat";
import type { Locale } from "@/types/menu";

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
