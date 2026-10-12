"use client";

import Image from "next/image";
import { useId, type ReactNode } from "react";
import { findItem } from "@/lib/adapters/catalog";
import { phonePrice, pt, qtyText } from "@/lib/i18n/phone";
import { lineLabel } from "@/lib/kiosk/menu";
import type { KioskData, Locale } from "@/types/menu";
import type { CartLine } from "@/types/session";
import { CARD, SMALL } from "./styles";

// Every line comes from session state and menu data, never from model text (docs/ARCHITECTURE.md "Agent tools").

export function CartLines({ kiosk, cart, locale }: { kiosk: KioskData; cart: CartLine[]; locale: Locale }) {
  return (
    <ul className="flex flex-col divide-y divide-[#E2DACB]">
      {cart.map((line) => {
        const item = findItem(kiosk, line.itemId);
        const { title, detail } = lineLabel(kiosk, line, locale);
        return (
          <li key={line.lineId} className="flex items-start gap-3 py-3">
            {item && (
              <Image src={item.image} alt="" width={64} height={64} className="size-16 flex-none rounded-[18px] object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xl font-bold">{title}</p>
              {detail && <p className="text-base text-[#4B463F]">{detail}</p>}
            </div>
            <div className="flex-none text-right">
              <p className="text-base text-[#4B463F]">{qtyText(line.qty, locale)}</p>
              <p className="text-xl font-bold">{phonePrice(line.unitPrice * line.qty, locale)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function TotalRow({ total, locale }: { total: number; locale: Locale }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-t-2 border-[#15171C] pt-3">
      <span className="text-xl font-bold">{pt("total", locale)}</span>
      <span className="font-display text-[2rem] font-bold">{phonePrice(total, locale)}</span>
    </div>
  );
}

/**
 * P3 cart card: the whole order and total, readable on the phone alone, with [Undo] (left out where the server would
 * refuse it). `status` is a line about the kiosk, under the title.
 */
export function CartCard(props: {
  kiosk: KioskData;
  cart: CartLine[];
  total: number;
  locale: Locale;
  canUndo: boolean;
  onUndo?: () => void;
  status?: ReactNode;
}) {
  const { kiosk, cart, total, locale } = props;
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={`${CARD} flex flex-col gap-2`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="text-xl font-bold">
          {pt("cartTitle", locale)}
        </h2>
        {props.onUndo && (
          <button type="button" onClick={props.onUndo} disabled={!props.canUndo} className={SMALL}>
            <UndoIcon />
            {pt("undo", locale)}
          </button>
        )}
      </div>
      {props.status}
      {cart.length === 0 ? (
        <p className="py-3 text-xl text-[#4B463F]">{pt("cartEmpty", locale)}</p>
      ) : (
        <CartLines kiosk={kiosk} cart={cart} locale={locale} />
      )}
      <TotalRow total={total} locale={locale} />
    </section>
  );
}

function UndoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}
