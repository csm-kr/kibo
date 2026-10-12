"use client";

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
}) {
  const { kiosk, lines } = props;
  const { locale, domain } = kiosk;
  const count = lines.reduce((n, l) => n + l.line.qty, 0);
  const hasPending = lines.some((l) => l.pending);
  return (
    <section aria-label={vocabularyOf(kiosk).cart[locale]} className="flex flex-none flex-col gap-6 border-t-4 border-[#E2DACB] bg-white px-12 py-8">
      <div className="flex items-baseline justify-between">
        <span className="k-text-48 font-bold">
          {count}
          {kt("cartCount", locale, domain)}
        </span>
        <span className="k-text-56 font-display font-bold text-(--k-primary)">{formatWon(props.total, locale)}</span>
      </div>
      {/* Focusable: with three or more lines the row scrolls, and a keyboard must reach it too (WCAG 2.1.1). */}
      <ul tabIndex={0} className={`flex h-38 gap-6 overflow-x-auto px-2 py-2 ${FOCUS}`}>
        {lines.length === 0 && (
          <li className="k-text-40 flex items-center text-[#4B463F]">{kt("cartEmpty", locale, domain)}</li>
        )}
        {lines.map(({ line, pending }) => {
          const label = lineLabel(kiosk, line, locale);
          const ring = line.lineId === props.ringLineId;
          return (
            <li
              key={ring ? `${line.lineId}:${props.ringKey}` : line.lineId}
              className={`flex max-w-130 flex-none flex-col justify-center rounded-[32px] border-4 px-8 ${
                pending ? "border-dashed border-[#4B463F] bg-(--k-panel)" : "border-[#E2DACB] bg-(--k-bg)"
              } ${ring ? "k-ring" : ""}`}
            >
              <span className="k-text-40 truncate font-bold">
                {label.title} ×{line.qty}
              </span>
              <span className="k-text-40 truncate text-[#4B463F]">
                {pending ? kt("pending", locale, domain) : label.detail || formatWon(line.unitPrice * line.qty, locale)}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-8">
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
          className={`k-text-56 min-h-32 flex-1 rounded-full bg-(--k-accent) font-bold text-[#1E1B18] disabled:bg-[#E2DACB] disabled:text-[#4B463F] ${FOCUS}`}
        >
          {kt("order", locale, domain)}
        </button>
      </div>
    </section>
  );
}
