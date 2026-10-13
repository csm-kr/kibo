"use client";

import { useNow } from "@/hooks/useNow";
import { ping } from "@/lib/client/api";
import { kt, secondsLeftText, type KioskTextKey } from "@/lib/i18n/kiosk";
import { idleWarning, phonePaused, staffBannerVisible } from "@/lib/kiosk/timers";
import type { KioskData } from "@/types/menu";
import type { Session, StaffReason } from "@/types/session";
import { ModalLayer } from "./ModalLayer";
import { FOCUS } from "./styles";

// KX banners on every screen (docs/UX.md "Exception flows"). Fixed copy only: the session holds a reason code,
// never model text. The strips are in the flow at the top of the kiosk and push the screen down, so they never
// cover a tile, the category rail or the QR (I-045, R-006); the idle warning is a modal above everything.

const STAFF_TEXT: Record<StaffReason, KioskTextKey> = {
  unknown_info: "staffCalled",
  user_request: "staffCalled",
  stuck: "staffCalled",
  learned_mismatch: "staffMismatch",
};

export function KioskBanners(props: { kiosk: KioskData; session: Session; kioskToken: string | null; clockOffset: number }) {
  const { kiosk, session, clockOffset } = props;
  const locale = kiosk.locale;
  const now = useNow();
  const staff = session.staffCalled && staffBannerVisible(session, now, clockOffset) ? session.staffCalled : null;
  const paused = phonePaused(session, now, clockOffset);
  const idle = idleWarning(session, now, clockOffset);

  function keepGoing() {
    if (!props.kioskToken) return;
    // The extended expiresAt comes back through the stream; a failed ping leaves the warning up.
    ping({ sessionId: session.sessionId, token: props.kioskToken, active: true }).catch(() => {});
  }

  return (
    <>
      {(staff || paused) && (
        <div className="flex flex-none flex-col border-b-4 border-[#7A2E0E] bg-[#FFF1CC] text-[#7A2E0E]">
          {staff && (
            <p role="status" className="k-text-48 flex items-center gap-8 px-12 py-8 font-bold">
              <BellIcon />
              {kt(STAFF_TEXT[staff.reasonCode], locale)}
            </p>
          )}
          {paused && (
            <p role="status" className="k-text-40 flex items-center gap-8 px-12 py-8">
              <PhoneOffIcon />
              {kt("phonePaused", locale)}
            </p>
          )}
        </div>
      )}
      {idle.show && (
        // Above sheets (SCRIM is z-20): the warning must win over whatever is open.
        <ModalLayer className="absolute inset-0 z-30 flex items-center justify-center bg-[#1E1B18]/60 p-12">
          <section role="alertdialog" aria-modal aria-labelledby="idle-title" className="flex w-full flex-col items-center gap-10 rounded-[48px] bg-(--k-bg) p-12 text-center">
            <h2 id="idle-title" className="k-text-72 font-bold">
              {kt("idleQuestion", locale, kiosk.domain)}
            </h2>
            <p role="timer" className="k-text-56 font-display font-bold text-[#7A2E0E]">
              {secondsLeftText(idle.secondsLeft, locale)}
            </p>
            <button
              type="button"
              onClick={keepGoing}
              className={`k-text-56 min-h-36 w-full rounded-full bg-(--k-accent) font-bold text-[#1E1B18] ${FOCUS}`}
            >
              {kt("idleContinue", locale)}
            </button>
          </section>
        </ModalLayer>
      )}
    </>
  );
}

function BellIcon() {
  return (
    <svg width="72" height="72" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M3 3l18 18" />
    </svg>
  );
}
