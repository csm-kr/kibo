"use client";

import { Undo2 } from "lucide-react";
import Image from "next/image";
import { useId, type ReactNode } from "react";
import { findItem } from "@/lib/adapters/catalog";
import { itemCount, pt, qtyText } from "@/lib/i18n/phone";
import { formatWon, lineLabel } from "@/lib/kiosk/menu";
import type { KioskData, Locale } from "@/types/menu";
import type { CartLine } from "@/types/session";
import { useAiText } from "./language";
import { CARD, ICON, QUIET } from "./ui";

// The cart in the phone design (docs/UI_GUIDE.md "Phone design"). Every line comes from session state and menu data,
// never from model text (docs/ARCHITECTURE.md "Agent tools"). Prices use the kiosk's format (I-137).

export function OrderLines({ kiosk, cart, locale }: { kiosk: KioskData; cart: CartLine[]; locale: Locale }) {
  // An AI-only language (14-final:4): the name as the kiosk shows it, in Korean, with the English name under it, so a
  // visitor can match the kiosk screen; the AI never translates names.
  const both = useAiText().ai !== null;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {cart.map((line) => {
        const item = findItem(kiosk, line.itemId);
        const { title, detail } = lineLabel(kiosk, line, locale);
        const korean = both ? lineLabel(kiosk, line, "ko").title : null;
        return (
          // The name never shrinks below its longest word; when the row cannot also hold the price (320px wide), the
          // price wraps to its own row on the right instead of running into the name.
          <li key={line.lineId} data-line-id={line.lineId} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-3">
            {/* A learned kiosk has no photos, only a placeholder that reads as a broken picture (I-103). */}
            {item && kiosk.kind !== "learned" && (
              <Image src={item.image} alt="" width={48} height={48} className="size-12 flex-none rounded-[12px] bg-cream object-cover" />
            )}
            <div className="flex-1">
              {korean && (
                <p lang="ko" className="text-xl leading-snug font-semibold">
                  {korean}
                </p>
              )}
              <p className={korean ? "text-base text-muted" : "text-xl leading-snug font-semibold"}>{title}</p>
              {detail && <p className="text-base text-muted">{detail}</p>}
            </div>
            <div className="ml-auto flex flex-none flex-col items-end gap-1">
              <p className="text-xl font-semibold tabular-nums">{formatWon(line.unitPrice * line.qty, locale)}</p>
              <p className="rounded-full bg-cream px-2 text-base text-muted tabular-nums">{qtyText(line.qty, locale)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function OrderTotal({ total, locale }: { total: number; locale: Locale }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-xl font-semibold">{pt("total", locale)}</span>
      <span className="font-display text-[2rem] leading-tight font-bold tabular-nums">{formatWon(total, locale)}</span>
    </div>
  );
}

/**
 * P3 cart card: "Your order · 2 items", a quiet [Undo] (left out where the server would refuse it), the lines and the
 * total. `status` is a line about the kiosk under the title.
 */
export function OrderCard(props: {
  kiosk: KioskData;
  cart: CartLine[];
  total: number;
  locale: Locale;
  canUndo: boolean;
  onUndo?: () => void;
  status?: ReactNode;
}) {
  const { kiosk, cart, locale } = props;
  const titleId = useId();
  const count = cart.reduce((n, line) => n + line.qty, 0);
  return (
    <section aria-labelledby={titleId} className={`${CARD} flex flex-col gap-2`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="text-xl font-bold">
          {pt("cartTitle", locale, kiosk.domain)}
          {count > 0 && <span className="font-normal text-muted"> · {itemCount(count, locale)}</span>}
        </h2>
        {props.onUndo && (
          <button type="button" onClick={props.onUndo} disabled={!props.canUndo} className={`${QUIET} -mr-2`}>
            <Undo2 {...ICON} />
            {pt("undo", locale)}
          </button>
        )}
      </div>
      {props.status}
      {cart.length === 0 ? (
        <p className="py-3 text-xl text-muted">{pt("cartEmpty", locale, kiosk.domain)}</p>
      ) : (
        <OrderLines kiosk={kiosk} cart={cart} locale={locale} />
      )}
      <div className="border-t border-line pt-3">
        <OrderTotal total={props.total} locale={locale} />
      </div>
    </section>
  );
}
