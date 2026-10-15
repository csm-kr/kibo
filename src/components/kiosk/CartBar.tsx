"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { vocabularyOf } from "@/lib/adapters/catalog";
import { kt } from "@/lib/i18n/kiosk";
import { formatWon, lineLabel } from "@/lib/kiosk/menu";
import type { KioskData } from "@/types/menu";
import type { CartLine } from "@/types/session";
import { FOCUS } from "./styles";

export interface ShownLine {
  line: CartLine;
  /** Shown before the server accepted it (optimistic touch add). */
  pending: boolean;
}

// Bottom cart bar on K3: count and total, line chips, [Clear all] and [Order] (primary bottom right, UX heuristic 4).

export function CartBar(props: {
  kiosk: KioskData;
  lines: ShownLine[];
  total: number;
  ringLineId: string | null;
  ringKey: string | null;
  onClear(): void;
  onOrder(): void;
  /** Standalone /kiosk: [처음으로], first in the button row (bottom left). */
  startOver?: ReactNode;
}) {
  const { kiosk, lines } = props;
  const { locale, domain } = kiosk;
  const count = lines.reduce((n, l) => n + l.line.qty, 0);
  const hasPending = lines.some((l) => l.pending);
  const row = useRef<HTMLUListElement>(null);
  const more = useMoreToTheRight(row, lines.length);
  return (
    // A white panel lifted over the menu, like a real kiosk's cart drawer (14-final:2).
    <section
      aria-label={vocabularyOf(kiosk).cart[locale]}
      className="relative z-10 flex flex-none flex-col gap-6 rounded-t-[48px] bg-white px-12 pt-10 pb-8 shadow-[0_-12px_32px_rgb(30_27_24/0.12)]"
    >
      <div className="flex items-baseline justify-between">
        <span className="k-text-48 font-bold">
          {count}
          {kt("cartCount", locale, domain)}
        </span>
        <span className="k-text-72 font-display font-bold text-(--k-primary)">{formatWon(props.total, locale)}</span>
      </div>
      {/* Focusable: with three or more lines the row scrolls, and a keyboard must reach it too (WCAG 2.1.1). */}
      <div className="relative">
      <ul ref={row} tabIndex={0} className={`flex h-38 gap-6 overflow-x-auto px-2 py-2 ${FOCUS}`}>
        {lines.length === 0 && (
          <li className="k-text-40 flex items-center text-[#4B463F]">{kt("cartEmpty", locale, domain)}</li>
        )}
        {lines.map(({ line, pending }) => {
          const label = lineLabel(kiosk, line, locale);
          const ring = line.lineId === props.ringLineId;
          return (
            <li
              key={ring ? `${line.lineId}:${props.ringKey}` : line.lineId}
              className={`flex max-w-full flex-none flex-col justify-center rounded-[32px] border-4 px-8 ${
                pending ? "border-dashed border-[#4B463F] bg-(--k-panel)" : "border-transparent bg-(--k-panel)"
              } ${ring ? "k-ring" : ""}`}
            >
              <span className="k-text-40 truncate font-bold">
                {label.title} ×{line.qty}
              </span>
              {/* Name ×qty over the line price, like a real kiosk's cart: the options stay on K6 and in KIBO's
                  subtitle, so two hero lines fit the row whole (owner decision, GitHub #1 item 1, I-244). */}
              <span className="k-text-40 truncate text-[#4B463F]">
                {pending ? kt("pending", locale, domain) : formatWon(line.unitPrice * line.qty, locale)}
              </span>
            </li>
          );
        })}
      </ul>
      {/* A chip cut at the edge read as broken (I-244): fade it out while the row scrolls on. Not a mask, which
          would also clip the row's focus ring. */}
      {more && (
        <div aria-hidden data-cart-more className="pointer-events-none absolute inset-y-0 right-0 w-40 bg-linear-to-r from-white/0 to-white" />
      )}
      </div>
      <div className="flex gap-8">
        {props.startOver}
        <button
          type="button"
          onClick={props.onClear}
          disabled={lines.length === 0}
          className={`k-text-40 min-h-32 rounded-full border-4 border-[#1E1B18] bg-white px-10 font-bold disabled:border-[#E2DACB] disabled:text-[#4B463F] ${FOCUS}`}
        >
          {kt("clearAll", locale)}
        </button>
        <button
          type="button"
          onClick={props.onOrder}
          disabled={lines.length === 0 || hasPending}
          className={`k-text-56 flex min-h-32 flex-1 items-center justify-center gap-4 rounded-full bg-(--k-accent) font-bold text-[#1E1B18] disabled:bg-[#E2DACB] disabled:text-[#4B463F] ${FOCUS}`}
        >
          {kt("order", locale, domain)}
          <svg width="56" height="56" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </section>
  );
}

/** True while the chip row holds more than it shows to its right. */
function useMoreToTheRight(row: RefObject<HTMLUListElement | null>, count: number): boolean {
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const check = () => setMore(el.scrollWidth - el.scrollLeft - el.clientWidth > 1);
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [row, count]);
  return more;
}
