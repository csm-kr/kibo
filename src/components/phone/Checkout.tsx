"use client";

import { Keyboard, Mic, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import type { VoiceState } from "@/hooks/useLiveVoice";
import { payMethodHint, pt } from "@/lib/i18n/phone";
import { formatWon } from "@/lib/kiosk/menu";
import type { KioskData, Locale } from "@/types/menu";
import type { CartLine } from "@/types/session";
import { micAction, MicState, voiceActive } from "./Dock";
import { OrderLines, OrderTotal } from "./OrderCard";
import { CARD, COMPACT, FOCUS, ICON, PRESS, PRIMARY, SECONDARY } from "./ui";

// Confirm (P4), pay (P5) and done (P6) in the phone design (docs/UI_GUIDE.md "Phone design"): one focused task each.

/**
 * P4, the scrolling part: the lines from session state and [Pick more]. `total` puts the total in the card, where no
 * bottom bar holds it (a learned kiosk). `after` sits between the card and [Pick more].
 */
export function ConfirmCard(props: {
  kiosk: KioskData;
  cart: CartLine[];
  locale: Locale;
  /** The dine option's name from menu data, when the kiosk has one. */
  dine?: string;
  total?: number;
  after?: ReactNode;
  onPickMore(): void;
  pickMoreDisabled?: boolean;
  /** Focus moves to the title when the screen opens (the phone; not the design preview). */
  autoFocus?: boolean;
}) {
  const { kiosk, locale, autoFocus } = props;
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (autoFocus) titleRef.current?.focus();
  }, [autoFocus]);
  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="phone-confirm-title" className={`${CARD} flex flex-col gap-1`}>
        <h1 id="phone-confirm-title" ref={titleRef} tabIndex={-1} className="text-2xl font-bold outline-none">
          {pt("confirmTitle", locale, kiosk.domain)}
        </h1>
        {props.dine && <p className="text-xl text-muted">{props.dine}</p>}
        <OrderLines kiosk={kiosk} cart={props.cart} locale={locale} />
        {props.total !== undefined && (
          <div className="border-t border-line pt-3">
            <OrderTotal total={props.total} locale={locale} />
          </div>
        )}
      </section>
      {props.after}
      <button type="button" disabled={props.pickMoreDisabled} onClick={props.onPickMore} className={SECONDARY}>
        {pt("pickMore", locale)}
      </button>
    </div>
  );
}

/**
 * P4, the fixed bottom: the total, [Yes, pay now] (88px, the screen's only filled button, I-142) and a tinted mic
 * with [Type], so the total and the button are always fully on screen (I-134). `typingSheet` is the open text field.
 */
export function ConfirmBar(props: {
  total: number;
  locale: Locale;
  onPay(): void;
  payDisabled?: boolean;
  voice: VoiceState;
  micDisabled?: boolean;
  onMic(): void;
  typing?: boolean;
  onTyping(open: boolean): void;
  typingSheet?: ReactNode;
  note?: string | null;
  /** /demo after its message limit: shown instead of the text field, and [Type] goes away. */
  limit?: ReactNode;
}) {
  const { locale } = props;
  const active = voiceActive(props.voice);
  const typing = props.typing && !props.limit;
  return (
    <div className="flex flex-none flex-col gap-3 rounded-t-sheet bg-white px-4 pt-3 pb-3 shadow-dock">
      <OrderTotal total={props.total} locale={locale} />
      <button type="button" onClick={props.onPay} disabled={props.payDisabled} className={`${PRIMARY} min-h-22`}>
        {pt("payNow", locale)}
      </button>
      {props.note && <p className="rounded-tile bg-staff-tint px-4 py-2 text-base text-staff-ink">{props.note}</p>}
      {props.limit}
      {typing && props.typingSheet}
      <div className="flex gap-2">
        {!props.limit && (
          <button
            type="button"
            aria-expanded={typing}
            onClick={() => props.onTyping(!typing)}
            className={`${COMPACT} min-h-22 text-ink active:bg-kibo-tint`}
          >
            {typing ? <X {...ICON} /> : <Keyboard {...ICON} />}
            <span>{pt(typing ? "closeTyping" : "typeButton", locale)}</span>
          </button>
        )}
        <button
          type="button"
          data-voice-state={props.voice}
          disabled={props.micDisabled}
          onClick={props.onMic}
          className={`flex min-h-22 flex-1 items-center gap-3 rounded-full bg-kibo-tint px-3 text-left text-kibo-deep active:bg-kibo-tint-pressed disabled:opacity-60 ${PRESS} ${FOCUS}`}
        >
          <span
            className={`flex size-14 flex-none items-center justify-center rounded-full bg-white text-kibo ${
              active ? "border-[3px] border-kibo" : ""
            } ${props.voice === "listening" ? "kibo-listen" : ""}`}
          >
            <Mic {...ICON} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-xl font-semibold">
              <MicState state={props.voice} locale={locale} />
              {pt(micAction(props.voice), locale)}
            </span>
            <span className="text-base">{pt("sayYes", locale)}</span>
          </span>
        </button>
      </div>
    </div>
  );
}

/** P5: the card goes into the kiosk. The picture points right, toward a kiosk beside the phone; `/demo` mirrors it. */
export function PayCard(props: { total: number; locale: Locale; mirrored?: boolean }) {
  const { locale } = props;
  const hint = payMethodHint(locale);
  return (
    <section className={`${CARD} flex flex-col items-center gap-4 text-center`}>
      <CardIntoKiosk mirrored={props.mirrored} />
      <h1 className="text-2xl font-bold">{pt("payTitle", locale)}</h1>
      <p className="text-xl">
        {hint.pre}
        <strong lang="ko" className="font-bold">
          {hint.label}
        </strong>
        {hint.gloss}
        {hint.post}
      </p>
      <p className="flex w-full flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3">
        <span className="text-xl font-semibold">{pt("total", locale)}</span>
        <span className="font-display text-[2rem] leading-tight font-bold tabular-nums">{formatWon(props.total, locale)}</span>
      </p>
    </section>
  );
}

/** P6: the order number, kept until the user closes it. Without `onDone` (/demo), the end card follows instead. */
export function DoneCard(props: { orderNumber: number; locale: Locale; domain?: KioskData["domain"]; onDone?: () => void }) {
  const { locale } = props;
  const ticket = props.domain === "ticket";
  return (
    <div className="flex flex-col gap-4">
      <section className={`${CARD} flex flex-col items-center gap-2 py-8 text-center`}>
        <h1 className="text-xl font-semibold text-muted">{pt(ticket ? "referenceNumber" : "orderNumber", locale)}</h1>
        {/* Proportional figures: the tabular "1" of Space Grotesk has a foot that reads oddly at this size. A little
            tracking keeps a 7 and a 1 from touching. */}
        <p className="font-display text-[7.5rem] leading-none font-bold tracking-[0.04em] text-kibo proportional-nums">{props.orderNumber}</p>
        <p className="text-xl">{pt(ticket ? "takeTickets" : "pickup", locale)}</p>
      </section>
      {props.onDone && (
        <button type="button" onClick={props.onDone} className={PRIMARY}>
          {pt("done", locale)}
        </button>
      )}
    </div>
  );
}

/** Stroke picture in the icon set's style (round caps and joins): a card sliding into a kiosk's card slot. */
function CardIntoKiosk({ mirrored }: { mirrored?: boolean }) {
  return (
    <svg
      viewBox="0 0 160 120"
      width="200"
      height="150"
      aria-hidden
      fill="none"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={mirrored ? "-scale-x-100" : undefined}
    >
      {/* Kiosk: body, screen, card slot */}
      <rect x="96" y="8" width="52" height="104" rx="8" stroke="#4B463F" />
      <rect x="104" y="18" width="36" height="44" rx="4" stroke="#4B463F" />
      <path d="M108 80h28" stroke="#15171C" />
      {/* Card, on its way to the slot */}
      <rect x="20" y="64" width="56" height="34" rx="5" fill="#EEF0FD" stroke="#3446D4" />
      <path d="M20 74h56M28 88h14" stroke="#3446D4" />
      {/* Motion line toward the slot */}
      <path d="M80 80h16m-6-6 6 6-6 6" stroke="#3446D4" />
    </svg>
  );
}
