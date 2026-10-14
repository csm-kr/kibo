"use client";

import { useState } from "react";
import { useQrSrc } from "@/hooks/useQrSrc";
import type { CommandReply } from "@/lib/client/api";
import type { CommandType } from "@/lib/commands/schemas";
import { kt } from "@/lib/i18n/kiosk";
import type { KioskData } from "@/types/menu";
import type { Session } from "@/types/session";
import { ModalLayer } from "./ModalLayer";
import { PairCode } from "./PairCode";
import { FOCUS, SCRIM } from "./styles";

// The row under the header on K2, K3, K6 and K7: dine chip, and the small QR or "phone connected" (Flow B).
// The QR sheet is absolute, so it covers the nearest positioned screen root. Canvas px.

export function KioskToolbar(props: {
  kiosk: KioskData;
  session: Session;
  claimUrl: string | null;
  pairCode?: string | null;
  pairUrl?: string | null;
  send(type: CommandType, args: object): Promise<CommandReply | null>;
  /** Absent in /demo, which hides [Connect another phone] (see KioskScreen). */
  onClaimUrl?(claimUrl: string, pairCode?: string): void;
  /** K3's 2 s "AI가 담았어요: …" line; it takes this row instead of covering the tiles (I-045). */
  status?: string | null;
  /**
   * KIBO's English subtitle of that line ("AI added: Cheeseburger set · …"). Not the kiosk's own UI, so it is KIBO
   * blue, and it gets its own row under this one (R-006): the kiosk screen moves down while it shows.
   */
  subtitle?: string | null;
}) {
  const { kiosk, session, onClaimUrl } = props;
  const [qrOpen, setQrOpen] = useState(false);
  // The server refuses a new QR once payment has started.
  const canReissue = onClaimUrl !== undefined && session.status !== "paying" && session.status !== "paid";

  async function connectOtherPhone() {
    const reply = await props.send("reissueClaim", {});
    if (reply?.claimUrl) {
      onClaimUrl?.(reply.claimUrl, reply.pairCode);
      setQrOpen(true);
    }
  }

  const status = props.status ?? null;
  return (
    <>
      <div className="flex h-28 flex-none items-center bg-(--k-panel) px-12">
        {/* Positioned here, not on the row: the QR sheet must cover the screen root, not this row. */}
        <div className="relative flex h-full min-w-0 flex-1 items-center">
          {/* While the status shows, the row's own controls are hidden (not focusable) rather than covered. */}
          <div className={`flex min-w-0 flex-1 items-center justify-between gap-6 ${status ? "invisible" : ""}`}>
            <ToolbarItems
              kiosk={kiosk}
              session={session}
              claimUrl={props.claimUrl}
              canReissue={canReissue}
              onConnect={connectOtherPhone}
              onQr={() => setQrOpen(true)}
            />
          </div>
          <div aria-live="polite" className="pointer-events-none absolute inset-0 flex items-center">
            {status && (
              <p className="k-text-40 w-full truncate rounded-full bg-(--k-primary-dark) px-12 py-3 text-center font-bold text-white">
                {status}
              </p>
            )}
          </div>
        </div>
        {qrOpen && <QrSheet kiosk={kiosk} claimUrl={props.claimUrl} pairCode={props.pairCode} pairUrl={props.pairUrl} onClose={() => setQrOpen(false)} />}
      </div>
      {props.subtitle && (
        <p data-kiosk-subtitle lang="en" className="k-text-40 flex flex-none items-center gap-6 bg-[#3446D4] px-12 py-4 text-white">
          <span className="flex-none rounded-full bg-white px-4 font-display font-bold text-[#3446D4]">KIBO</span>
          <span className="min-w-0">{props.subtitle}</span>
        </p>
      )}
    </>
  );
}

function ToolbarItems(props: {
  kiosk: KioskData;
  session: Session;
  claimUrl: string | null;
  canReissue: boolean;
  onConnect(): Promise<void>;
  onQr(): void;
}) {
  const { kiosk, session, canReissue } = props;
  const { locale, domain } = kiosk;
  return (
    <>
      {session.dineOption ? (
        <span className="k-text-40 rounded-full bg-(--k-primary) px-8 py-2 font-bold text-white">
          {kt(session.dineOption === "eat_in" ? "dineChip" : "takeOutChip", locale)}
        </span>
      ) : (
        <span />
      )}
      {session.phoneConnectedAt !== null ? (
        <div className="flex items-center gap-6">
          <span className="k-text-40 flex items-center gap-3 font-bold text-(--k-primary-dark)">
            <PhoneIcon />
            {kt("phoneConnectedShort", locale)}
          </span>
          {canReissue && (
            <button
              type="button"
              onClick={() => void props.onConnect()}
              className={`k-text-40 min-h-22 rounded-full border-4 border-[#1E1B18] bg-white px-8 font-bold ${FOCUS}`}
            >
              {kt("connectOtherPhone", locale)}
            </button>
          )}
        </div>
      ) : (
        <SmallQrButton claimUrl={props.claimUrl} label={kt("openQr", locale, domain)} onOpen={props.onQr} />
      )}
    </>
  );
}

function PhoneIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M10.5 18h3" />
    </svg>
  );
}

/** Flow B: the small QR; tapping it shows the QR large. The cart is kept when a phone joins. */
function SmallQrButton(props: { claimUrl: string | null; label: string; onOpen(): void }) {
  const src = useQrSrc(props.claimUrl);
  return (
    <button
      type="button"
      onClick={props.onOpen}
      disabled={!props.claimUrl}
      className={`k-text-40 flex min-h-22 items-center gap-4 rounded-full border-4 border-(--k-primary) bg-white py-1 pr-8 pl-2 font-bold text-(--k-primary-dark) ${FOCUS}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={72} height={72} className="size-18 rounded-full" />
      ) : (
        <span className="size-18" />
      )}
      {props.label}
    </button>
  );
}

function QrSheet(props: { kiosk: KioskData; claimUrl: string | null; pairCode?: string | null; pairUrl?: string | null; onClose(): void }) {
  const { locale, domain } = props.kiosk;
  const src = useQrSrc(props.claimUrl);
  return (
    <ModalLayer className={`${SCRIM} flex items-center justify-center p-12`} onClick={props.onClose}>
      <section
        role="dialog"
        aria-modal
        aria-labelledby="qr-title"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col items-center gap-10 rounded-[48px] bg-(--k-bg) p-12 text-center"
      >
        <h2 id="qr-title" className="k-text-56 font-bold">
          {kt("qrSheetTitle", locale)}
        </h2>
        {src && props.claimUrl ? (
          // A data URL, so next/image would add nothing.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={kt("qrAlt", locale, domain)} data-claim-url={props.claimUrl} width={600} height={600} className="size-150" />
        ) : (
          <p className="k-text-40 flex size-150 items-center justify-center rounded-[32px] bg-(--k-panel) p-8 text-[#4B463F]">
            {kt("qrLoading", locale)}
          </p>
        )}
        <p className="k-text-40 text-[#4B463F]">{kt("qrSheetHint", locale, domain)}</p>
        <PairCode kiosk={props.kiosk} claimUrl={props.claimUrl} pairCode={props.pairCode} pairUrl={props.pairUrl} className="w-full text-left" />
        <button
          type="button"
          onClick={props.onClose}
          className={`k-text-48 min-h-32 w-full rounded-full border-4 border-[#1E1B18] bg-white font-bold ${FOCUS}`}
        >
          {kt("close", locale)}
        </button>
      </section>
    </ModalLayer>
  );
}
