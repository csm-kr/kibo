"use client";

import { MessageCircle } from "lucide-react";
import { useId } from "react";
import { pt } from "@/lib/i18n/phone";
import type { Locale } from "@/types/menu";
import { FOCUS, ICON, PRESS } from "./ui";

// "Try saying" in the phone design (docs/UI_GUIDE.md "Phone design"): soft tinted cards, not input-like boxes.
// 20px text, the phone body size (UI_GUIDE "Type"). A tap sends the sentence.

export function Suggestions(props: { examples: string[]; locale: Locale; disabled: boolean; onPick(text: string): void }) {
  const titleId = useId();
  if (props.examples.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-base font-semibold text-muted">
        {pt("examples", props.locale)}
      </h2>
      <div className="flex flex-col gap-2">
        {props.examples.map((text) => (
          <button
            key={text}
            type="button"
            disabled={props.disabled}
            onClick={() => props.onPick(text)}
            className={`flex min-h-14 items-start gap-3 rounded-tile bg-kibo-tint px-4 py-3 text-left text-xl text-kibo-deep active:bg-kibo-tint-pressed disabled:opacity-60 ${PRESS} ${FOCUS}`}
          >
            {/* As tall as the first text line, so the icon centres on it without an off-scale margin. */}
            <span className="flex h-7 flex-none items-center text-kibo">
              <MessageCircle {...ICON} />
            </span>
            <span>{text}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
