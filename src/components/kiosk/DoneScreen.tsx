"use client";

import { useEffect, useRef, useState } from "react";
import { useNow } from "@/hooks/useNow";
import { backInSeconds, kt, receiptInSeconds } from "@/lib/i18n/kiosk";
import { doneCountdown } from "@/lib/kiosk/timers";
import type { KioskData } from "@/types/menu";
import type { Session } from "@/types/session";
import { Header } from "./KioskScreen";
import { CARD_SHADOW, FOCUS } from "./styles";

// K8 (status `paid`, docs/UX.md A10–A11): receipt question, then the order number with a visible 10 s countdown
// before the attract screen (WCAG 2.2.1). Nothing prints. Canvas px.

export function DoneScreen(props: {
  kiosk: KioskData;
  session: Session;
  clockOffset: number;
  /** /demo: no countdown back to K1; the order number stays until the demo moves on. */
  keepNumber: boolean;
  onNewSession(): void;
  /** The order number is on screen (after the receipt question): /demo's English step line follows it (#1 item 13). */
  onNumberShown?(sessionId: string): void;
}) {
  const { kiosk, session, clockOffset } = props;
  const { locale, domain } = kiosk;
  const now = useNow();
  // Server time when the order number appeared; the 10 s run from there, not from payment.
  const [numberAt, setNumberAt] = useState<number | null>(null);
  const ended = useRef(false);

  // Nobody answering the receipt question must not leave the kiosk on this screen, so it moves on after 10 s.
  const receiptLeft = doneCountdown(session.paidAt ?? 0, now, clockOffset);
  const showNumber = numberAt !== null || receiptLeft === 0;
  const left = doneCountdown(numberAt ?? now + clockOffset, now, clockOffset);
  if (showNumber && numberAt === null) setNumberAt(now + clockOffset);

  const { onNewSession, keepNumber, onNumberShown } = props;
  useEffect(() => {
    if (showNumber) onNumberShown?.(session.sessionId);
  }, [showNumber, onNumberShown, session.sessionId]);

  useEffect(() => {
    if (keepNumber || numberAt === null || left > 0 || ended.current) return;
    ended.current = true;
    onNewSession();
  }, [keepNumber, numberAt, left, onNewSession]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Header kiosk={kiosk} />
      {!showNumber ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-16 px-12">
          <span className="flex size-64 items-center justify-center rounded-full bg-(--k-primary-tint)">
            <ReceiptIcon />
          </span>
          <h1 className="k-text-72 text-center font-bold">{kt("receiptQuestion", locale)}</h1>
          <div className="grid w-full grid-cols-2 gap-8">
            <button
              type="button"
              onClick={() => setNumberAt(now + clockOffset)}
              className={`k-text-56 min-h-36 rounded-full border-4 border-[#1E1B18] bg-white font-bold ${FOCUS}`}
            >
              {kt("receiptNo", locale)}
            </button>
            <button
              type="button"
              onClick={() => setNumberAt(now + clockOffset)}
              className={`k-text-56 min-h-36 rounded-full bg-(--k-accent) font-bold text-[#1E1B18] ${FOCUS}`}
            >
              {kt("receiptYes", locale)}
            </button>
          </div>
          <p role="timer" className="k-text-40 text-[#4B463F]">
            {receiptInSeconds(receiptLeft, locale, domain)}
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-10 px-12 text-center">
          {/* The number on a ticket-like card, the one thing to remember. */}
          <div className={`flex w-full flex-col items-center gap-8 rounded-[48px] bg-white px-12 py-16 ${CARD_SHADOW}`}>
            <h1 className="k-text-56 flex items-center gap-4 font-bold text-[#4B463F]">
              <DoneIcon />
              {kt("orderNumber", locale, domain)}
            </h1>
            <p className="font-display text-[240px] leading-none font-bold text-(--k-primary)">{session.orderNumber}</p>
            <span aria-hidden className="h-0 w-full border-t-4 border-dashed border-[#E2DACB]" />
            <p className="k-text-56 font-bold">{kt("pickupHint", locale, domain)}</p>
          </div>
          {!keepNumber && (
            <p role="timer" className="k-text-48 mt-12 rounded-full bg-(--k-panel) px-12 py-6 font-bold text-[#33302B]">
              {backInSeconds(left, locale)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DoneIcon() {
  return (
    <span aria-hidden className="flex size-16 flex-none items-center justify-center rounded-full bg-(--k-primary)">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

function ReceiptIcon() {
  return (
    <svg width="200" height="200" viewBox="0 0 24 24" aria-hidden fill="none" stroke="#1E1B18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2.5h12v19l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z" />
      <path d="M9 7.5h6M9 11h6M9 14.5h4" />
    </svg>
  );
}
