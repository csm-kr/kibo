"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useNow } from "@/hooks/useNow";
import { backInSeconds, kt, receiptInSeconds } from "@/lib/i18n/kiosk";
import { formatWon, lineLabel } from "@/lib/kiosk/menu";
import { doneCountdown } from "@/lib/kiosk/timers";
import type { KioskData } from "@/types/menu";
import type { Session } from "@/types/session";
import { Header } from "./KioskScreen";
import { CARD_SHADOW, FOCUS } from "./styles";

// K8 (status `paid`, docs/UX.md A10–A11): receipt question, then the order number in the top third with what was
// paid under it, like a receipt (#1 item 20), and a visible 10 s countdown before the attract screen (WCAG 2.2.1).
// Nothing prints. Canvas px.

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
  const receiptTitle = useId();
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
        // Scrolls rather than clips if larger text spacing makes the number, the receipt and the countdown taller than
        // the screen (WCAG 1.4.12); the receipt's list gives way first.
        <div className="flex min-h-0 flex-1 flex-col items-center gap-10 overflow-y-auto px-12 pt-16 pb-12">
          {/* The number on a ticket-like card, the one thing to remember. */}
          <div className={`flex w-full flex-none flex-col items-center gap-8 rounded-[48px] bg-white px-12 py-16 text-center ${CARD_SHADOW}`}>
            <h1 className="k-text-56 flex items-center gap-4 font-bold text-[#4B463F]">
              <DoneIcon />
              {kt("orderNumber", locale, domain)}
            </h1>
            <p className="font-display text-[240px] leading-none font-bold text-(--k-primary)">{session.orderNumber}</p>
            <span aria-hidden className="h-0 w-full border-t-4 border-dashed border-[#E2DACB]" />
            <p className="k-text-56 font-bold">{kt("pickupHint", locale, domain)}</p>
          </div>
          {/* What was paid, like a receipt: each line as the cart bar names it, then the total (#1 item 20). */}
          <section
            data-receipt
            aria-labelledby={receiptTitle}
            className={`flex min-h-0 w-full flex-col gap-6 rounded-[48px] bg-white px-12 py-10 ${CARD_SHADOW}`}
          >
            <h2 id={receiptTitle} className="k-text-48 flex-none font-bold text-[#4B463F]">
              {kt("paidList", locale, domain)}
            </h2>
            {/* Focusable: a long order scrolls here, and a keyboard must reach it too (WCAG 2.1.1, I-067). */}
            <ul tabIndex={0} className={`flex min-h-0 flex-col gap-6 overflow-y-auto ${FOCUS}`}>
              {session.cart.map((line) => {
                const label = lineLabel(kiosk, line, locale);
                return (
                  <li key={line.lineId} className="flex flex-none items-start justify-between gap-8">
                    <div className="flex min-w-0 flex-col gap-2">
                      <span className="k-text-48 font-bold">
                        {label.title} ×{line.qty}
                      </span>
                      {label.detail && <span className="k-text-40 text-[#4B463F]">{label.detail}</span>}
                    </div>
                    <span className="k-text-48 flex-none font-display font-bold">{formatWon(line.unitPrice * line.qty, locale)}</span>
                  </li>
                );
              })}
            </ul>
            <span aria-hidden className="h-0 w-full flex-none border-t-4 border-dashed border-[#E2DACB]" />
            <div className="flex flex-none items-baseline justify-between gap-6">
              <span className="k-text-48 font-bold">{kt("total", locale)}</span>
              <span className="k-text-72 font-display font-bold text-(--k-primary)">{formatWon(session.total, locale)}</span>
            </div>
          </section>
          {!keepNumber && (
            <p role="timer" className="k-text-48 mt-auto flex-none rounded-full bg-(--k-panel) px-12 py-6 font-bold text-[#33302B]">
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
