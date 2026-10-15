"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { FOCUS, PRESS } from "@/components/phone/ui";
import type { AgentAction } from "@/lib/agent/actions";
import { actionRow } from "@/lib/demo/actions";
import { pt } from "@/lib/i18n/phone";
import type { KioskData, Locale } from "@/types/menu";
import type { SessionStatus } from "@/types/session";
import { ScrollFade } from "./ScrollFade";

// D2 "What the AI did" (/demo only): each tool call Gemini made and what the KIBO server answered, in plain words
// from menu data plus the tool name and result code. Not announced (aria-live): the cart announcements already are.
// A white card with the phone's soft shadow (docs/UI_GUIDE.md "Phone design"), so /demo reads as one product.

interface Props {
  kiosk: KioskData;
  actions: AgentAction[];
  locale: Locale;
  status: SessionStatus | null;
  /** In the scenario column beside the phone (from 1440px wide), so it never takes the phone's height (I-084). */
  beside: boolean;
}

export function ActionStrip({ kiosk, actions, locale, status, beside }: Props) {
  const [open, setOpen] = useState(beside);
  const newestFirst = [...actions].reverse();

  // Under the phone, the confirm card needs the phone's full height: even folded, the strip pushed [Yes, pay now]
  // below the fold (I-129, R-009). It steps aside until the order leaves the review, then comes back as it was.
  // The end card after payment needs it too: [Try again] and the other places (design QA 10-15, #1 14).
  if ((status === "confirming" || status === "paid") && !beside) return null;

  return (
    <section
      data-action-strip
      aria-labelledby="demo-actions-title"
      // Shrinks (down to its toggle) before the phone or the guide above it does; the phone keeps its own minimum (DemoApp).
      className="flex max-h-[40%] min-h-18 shrink flex-col gap-2 rounded-sheet bg-white p-2 text-ink shadow-card"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="demo-actions"
        onClick={() => setOpen(!open)}
        className={`flex min-h-14 w-full flex-none items-center gap-2 rounded-tile px-3 text-left text-base font-bold active:bg-kibo-tint ${PRESS} ${FOCUS}`}
      >
        <span id="demo-actions-title" className="flex-1">
          {pt("aiActions", locale)}
        </span>
        {!open && actions.length > 0 && (
          <span data-action-count className="flex h-8 min-w-8 items-center justify-center rounded-full bg-kibo-tint px-2 text-base font-semibold text-kibo-deep">
            {actions.length}
          </span>
        )}
        {open ? <ChevronUp size={20} strokeWidth={2} aria-hidden /> : <ChevronDown size={20} strokeWidth={2} aria-hidden />}
      </button>
      {open && (
        // Legend and rows scroll together, so a short screen still reaches every row; focusable for keyboard scrolling (I-067).
        <div
          id="demo-actions"
          lang={locale}
          role="group"
          aria-labelledby="demo-actions-title"
          tabIndex={0}
          className={`flex min-h-0 flex-1 scroll-pb-8 flex-col gap-2 overflow-y-auto rounded-tile px-3 pb-2 ${FOCUS}`}
        >
          {/* Under the phone the strip has about 80px open (1280x720): the rows come first there (design QA 10-15, #1 15). */}
          {beside && <p className="text-base text-muted">{pt("aiActionsLegend", locale)}</p>}
          {actions.length === 0 ? (
            <p className="text-base text-[#33302B]">{pt("aiActionsEmpty", locale)}</p>
          ) : (
            <ul aria-label={pt("aiActionsList", locale)} className="flex flex-col gap-2">
              {newestFirst.map((a, i) => {
                const row = actionRow(kiosk, a, locale);
                const ok = a.code === "ok";
                return (
                  <li
                    key={actions.length - i}
                    data-action-tool={a.tool}
                    data-action-code={a.code}
                    className={`flex flex-col border-l-4 pl-3 ${ok ? "border-kibo" : "border-staff-ink"}`}
                  >
                    {/* One typeface and the panel's 16px; tabular figures keep the timings in line (design QA 10-15, #1 5). */}
                    <span className="text-base font-bold">{row.text}</span>
                    <span className={`text-base tabular-nums ${ok ? "text-muted" : "text-staff-ink"}`}>{row.tech}</span>
                    {row.note && <span className="text-base text-muted">{row.note}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          <ScrollFade className="-bottom-2 -mx-3 -mt-10 to-white" />
        </div>
      )}
    </section>
  );
}
