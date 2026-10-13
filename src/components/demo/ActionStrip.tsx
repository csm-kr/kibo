"use client";

import { useState } from "react";
import { FOCUS } from "@/components/assistant/styles";
import type { AgentAction } from "@/lib/agent/actions";
import { actionRow } from "@/lib/demo/actions";
import { pt } from "@/lib/i18n/phone";
import type { KioskData, Locale } from "@/types/menu";
import type { SessionStatus } from "@/types/session";

// D2 "What the AI did" (/demo only): each tool call Gemini made and what the KIBO server answered, in plain words
// from menu data plus the tool name and result code. Not announced (aria-live): the cart announcements already are.

/** Open by default where it fits next to the phone without crowding it (docs/UI_QA.md judge laptop 1440×900). */
const OPEN_FROM = "(min-width: 1440px)";

interface Props {
  kiosk: KioskData;
  actions: AgentAction[];
  locale: Locale;
  status: SessionStatus | null;
}

export function ActionStrip({ kiosk, actions, locale, status }: Props) {
  // Mounted only after the demo order starts, so the browser width is known.
  const [open, setOpen] = useState(() => typeof window !== "undefined" && window.matchMedia(OPEN_FROM).matches);
  const newestFirst = [...actions].reverse();

  // The confirm card needs the phone's full height: even folded, the strip pushed [Yes, pay now] below the fold at
  // 1440×900 (I-129, R-009). It steps aside until the order leaves the review, then comes back as it was.
  if (status === "confirming") return null;

  return (
    <section
      data-action-strip
      aria-labelledby="demo-actions-title"
      // Shrinks (down to its toggle) before the phone above it does; the phone keeps its own minimum (DemoApp).
      className="flex max-h-[36%] min-h-18 shrink flex-col gap-2 rounded-[26px] border border-[#E2DACB] bg-white p-2 text-[#15171C]"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="demo-actions"
        onClick={() => setOpen(!open)}
        className={`flex min-h-14 w-full flex-none items-center gap-2 rounded-[18px] px-3 text-left text-base font-bold active:bg-[#F3EEE4] ${FOCUS}`}
      >
        <span id="demo-actions-title" className="flex-1">
          {pt("aiActions", locale)}
        </span>
        {!open && actions.length > 0 && (
          <span data-action-count className="flex h-8 min-w-8 items-center justify-center rounded-full bg-[#15171C] px-2 text-base text-white">
            {actions.length}
          </span>
        )}
        <Chevron open={open} />
      </button>
      {open && (
        // Legend and rows scroll together, so a short screen still reaches every row; focusable for keyboard scrolling (I-067).
        <div
          id="demo-actions"
          lang={locale}
          role="group"
          aria-labelledby="demo-actions-title"
          tabIndex={0}
          className={`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-[18px] px-3 pb-2 ${FOCUS}`}
        >
          <p className="text-base text-[#4B463F]">{pt("aiActionsLegend", locale)}</p>
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
                    className={`flex flex-col border-l-4 pl-3 ${ok ? "border-[#3446D4]" : "border-[#7A2E0E]"}`}
                  >
                    <span className="text-lg font-bold">{row.text}</span>
                    <span className={`font-mono text-base ${ok ? "text-[#4B463F]" : "text-[#7A2E0E]"}`}>{row.tech}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
      <path d={open ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} />
    </svg>
  );
}
