"use client";

import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import type { CommandReply } from "@/lib/client/api";
import type { CommandType } from "@/lib/commands/schemas";
import { kt } from "@/lib/i18n/kiosk";
import { formatWon } from "@/lib/kiosk/menu";
import type { KioskData } from "@/types/menu";
import type { Session } from "@/types/session";
import { Header } from "./KioskScreen";
import { KioskToolbar } from "./KioskToolbar";
import { FOCUS } from "./styles";

// K7 virtual payment (status `paying`, docs/UX.md A9): method → insert card → approving → cardAction.
// No real card, network or bank: the "insert card" button stands in for the card reader. Only cardAction,
// which the server accepts in `paying` from the kiosk alone, reaches `paid`. Canvas px.

const APPROVE_MS = 1500;

type Step = "method" | "insert" | "approving";

export function PaymentScreen(props: {
  kiosk: KioskData;
  session: Session;
  claimUrl: string | null;
  send(type: CommandType, args: object): Promise<CommandReply | null>;
  onClaimUrl(claimUrl: string): void;
  /** /demo's card stand-in: each "tap" event inserts the card as if the button below were pressed. */
  cardTap?: EventTarget;
}) {
  const { kiosk, session, send, cardTap } = props;
  const locale = kiosk.locale;
  const [step, setStep] = useState<Step>("method");
  const [busy, setBusy] = useState(false);
  const approveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(approveTimer.current), []);

  function insertCard() {
    setStep("approving");
    approveTimer.current = setTimeout(async () => {
      // On success the stream moves to `paid` and this screen goes away; on failure the error bar explains.
      if (!(await send("cardAction", {}))) setStep("insert");
    }, APPROVE_MS);
  }

  const onCardTap = useEffectEvent(() => {
    if (step !== "approving") insertCard();
  });
  useEffect(() => {
    if (!cardTap) return;
    const on = () => onCardTap();
    cardTap.addEventListener("tap", on);
    return () => cardTap.removeEventListener("tap", on);
  }, [cardTap]);

  async function editOrder() {
    if (busy) return;
    setBusy(true);
    await send("editOrder", {});
    setBusy(false);
  }

  return (
    <div className="relative flex h-full flex-col">
      <Header kiosk={kiosk} />
      <KioskToolbar kiosk={kiosk} session={session} claimUrl={props.claimUrl} send={send} onClaimUrl={props.onClaimUrl} />

      <div className="flex min-h-0 flex-1 flex-col px-12 pt-12">
        {step === "method" && (
          <>
            <h1 className="k-text-72 pb-12 font-bold">{kt("payMethodTitle", locale)}</h1>
            <div className="grid grid-cols-3 gap-8">
              <MethodButton label={kt("payCard", locale)} onClick={() => setStep("insert")} icon={<CardIcon />} />
              <MethodButton label={kt("payEasy", locale)} note={kt("notSupported", locale)} icon={<PhonePayIcon />} />
              <MethodButton label={kt("payCoupon", locale)} note={kt("notSupported", locale)} icon={<CouponIcon />} />
            </div>
          </>
        )}

        {step === "insert" && (
          <>
            <h1 className="k-text-72 font-bold">{kt("insertCard", locale)}</h1>
            <p className="k-text-40 pt-4 text-[#4B463F]">{kt("virtualPayment", locale)}</p>
            <CardSlot />
            <button
              type="button"
              onClick={insertCard}
              className={`k-text-56 min-h-36 w-full rounded-full bg-(--k-accent) font-bold text-[#1E1B18] ${FOCUS}`}
            >
              {kt("insertCardButton", locale)}
            </button>
          </>
        )}

        {step === "approving" && (
          <div role="status" className="flex flex-1 flex-col items-center justify-center gap-10">
            <CardIcon size={240} />
            <p className="k-text-72 font-bold">{kt("approving", locale)}</p>
          </div>
        )}
      </div>

      <section className="flex flex-none flex-col gap-8 border-t-4 border-[#E2DACB] bg-white px-12 py-10">
        <div className="flex items-baseline justify-between gap-6">
          <span className="k-text-48 font-bold">{kt("total", locale)}</span>
          <span className="k-text-72 font-display font-bold text-(--k-primary)">{formatWon(session.total)}</span>
        </div>
        {step !== "approving" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void editOrder()}
            className={`k-text-48 min-h-32 rounded-full border-4 border-[#1E1B18] bg-white px-12 font-bold disabled:opacity-60 ${FOCUS}`}
          >
            {kt("editOrder", locale)}
          </button>
        )}
      </section>
    </div>
  );
}

function MethodButton(props: { label: string; note?: string; icon: ReactNode; onClick?(): void }) {
  const enabled = Boolean(props.onClick);
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={props.onClick}
      className={`flex min-h-100 flex-col items-center justify-center gap-6 rounded-[32px] border-[6px] p-6 text-center ${
        enabled
          ? "border-(--k-primary) bg-white text-(--k-primary-dark) active:bg-(--k-primary-tint)"
          : "border-[#E2DACB] bg-[#F3EEE4] text-[#4B463F]"
      } ${FOCUS}`}
    >
      {props.icon}
      <span className="k-text-56 font-bold">{props.label}</span>
      {props.note && <span className="k-text-40">{props.note}</span>}
    </button>
  );
}

/** A plain slot drawing with a card sliding toward it and an arrow pointing at the real slot below the screen. */
function CardSlot() {
  return (
    <div aria-hidden className="flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden py-8">
      <div className="k-card-insert flex h-72 w-110 flex-col justify-between rounded-[32px] bg-(--k-primary) p-8">
        <span className="h-14 w-20 rounded-[12px] bg-(--k-accent)" />
        <span className="h-6 w-60 rounded-full bg-(--k-primary-tint)" />
      </div>
      <div className="h-8 w-130 rounded-full bg-[#1E1B18]" />
      <svg width="160" height="160" viewBox="0 0 24 24" fill="none" stroke="#1E1B18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4v15" />
        <path d="M6 13l6 6 6-6" />
      </svg>
    </div>
  );
}

function CardIcon({ size = 128 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 9.5h19" />
      <path d="M6 15h4" />
    </svg>
  );
}

function PhonePayIcon() {
  return (
    <svg width="128" height="128" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M10.5 18h3" />
      <path d="M9.5 9.5h5v3h-5z" />
    </svg>
  );
}

function CouponIcon() {
  return (
    <svg width="128" height="128" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7.5V6h18v1.5a2.5 2.5 0 0 0 0 5V18H3v-5.5a2.5 2.5 0 0 0 0-5Z" />
      <path d="M14 6v12" strokeDasharray="1.5 2" />
    </svg>
  );
}
