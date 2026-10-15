"use client";

import type { AgentAction } from "@/lib/agent/actions";
import { actionRow } from "@/lib/demo/actions";
import { pt } from "@/lib/i18n/phone";
import type { KioskData, Locale } from "@/types/menu";
import { FOCUS_INSIDE } from "./column";
import { ScrollFade } from "./ScrollFade";

// D2 "What the AI did" (/demo only): each tool call Gemini made and what the KIBO server answered, in plain words
// from menu data plus the tool name and result code. Not announced (aria-live): the cart announcements already are.
// The panel behind the third column's "What the AI did" tab, beside the phone at every judge size (#1 E), so it never
// takes the phone's height (I-084); the tab shows the count.

interface Props {
  kiosk: KioskData;
  actions: AgentAction[];
  locale: Locale;
}

export function ActionStrip({ kiosk, actions, locale }: Props) {
  const newestFirst = [...actions].reverse();
  return (
    // Its first 8px do not scroll, as the scenarios' (ScenarioGuide).
    <div data-action-strip className="flex min-h-0 flex-1 flex-col pt-2 text-ink">
      {/* Legend and rows scroll together, so a short screen still reaches every row; focusable for keyboard scrolling
          (I-067), with its ring inside the card, which clips what lies outside it. */}
      <div
        id="demo-actions"
        lang={locale}
        role="group"
        aria-label={pt("aiActions", locale)}
        tabIndex={0}
        className={`flex min-h-0 flex-1 scroll-pb-8 flex-col gap-2 overflow-y-auto px-4 pt-2 pb-4 ${FOCUS_INSIDE}`}
      >
        <p className="text-base text-muted">{pt("aiActionsLegend", locale)}</p>
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
        <ScrollFade className="-bottom-4 -mx-4 -mt-10 to-white" />
      </div>
    </div>
  );
}
