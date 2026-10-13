"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { CARD } from "@/components/phone/ui";
import { useNow } from "@/hooks/useNow";
import { useQrSrc } from "@/hooks/useQrSrc";
import { orderLine, phoneLink } from "@/lib/kiosk/pairing";
import type { KioskData } from "@/types/menu";
import type { Session } from "@/types/session";

// KIBO's pairing panel beside a landscape kiosk: /kiosk on a laptop and /demo "Use my phone" (docs/UX.md Flow A,
// Flow C). KIBO's surface, not the store's, so it uses the phone design (docs/UI_GUIDE.md "Phone design") at
// >= 18px. The claim token is only inside the QR, never shown as text; the session gives the read-only status.

const STEPS = ["Scan the QR or enter the code on your phone.", "Say what you want to your phone.", "Check it on your phone, then pay here."];

export function PairingPanel(props: {
  kiosk: KioskData;
  session: Session | null;
  claimUrl: string | null;
  pairCode: string | null;
  clockOffset: number;
  /** /demo: the end card ([Try again], other places) once the order is done. */
  children?: ReactNode;
}) {
  const { kiosk, session, claimUrl, pairCode, clockOffset } = props;
  const now = useNow();
  const link = phoneLink(session, now, clockOffset);
  const src = useQrSrc(claimUrl);
  const host = claimUrl ? new URL(claimUrl).host : null;

  return (
    <aside
      data-pairing-panel
      data-phone-link={link}
      lang="en"
      aria-labelledby="pairing-title"
      // Content stays at most 768px wide, so a wide laptop does not stretch the cards across the screen.
      className="flex h-full min-w-0 flex-col gap-6 overflow-y-auto bg-cream p-8 text-ink @container *:max-w-3xl"
    >
      <header className="flex items-center gap-4">
        <Image src="/kibo-logo.svg" alt="KIBO" width={118} height={32} />
        <h2 id="pairing-title" className="font-display text-[32px] leading-tight font-bold">
          Order by talking
        </h2>
      </header>

      <PhoneStatus link={link} session={session} clockOffset={clockOffset} />

      {link === "waiting" ? (
        <>
          <div className={`flex flex-col items-center gap-6 @min-[38rem]:flex-row @min-[38rem]:items-start ${CARD}`}>
            {src && claimUrl ? (
              // A data URL, so next/image would add nothing. The URL (and its token) is only inside the picture.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="QR code to order with your phone" data-panel-qr width={320} height={320} className="size-80 flex-none" />
            ) : (
              <p className="flex size-80 flex-none items-center justify-center rounded-tile bg-cream text-lg text-muted">
                Preparing the QR…
              </p>
            )}
            <div className="flex min-w-0 flex-col gap-4">
              <p className="text-xl/normal">
                Scan with your phone camera, or open
                {/* Its own line, so a host breaks only when it cannot fit (I-167). */}
                <strong className="block break-all text-kibo">{host ? `${host}/app` : "the KIBO app"}</strong>
                and enter the code.
              </p>
              {pairCode && (
                <p className="flex flex-col">
                  <span className="text-lg font-semibold text-muted">Code</span>
                  <span aria-hidden data-panel-pair-code={pairCode} className="font-display text-[64px] leading-tight font-bold tracking-wider">
                    {pairCode.slice(0, 3)} {pairCode.slice(3)}
                  </span>
                  {/* Read digit by digit, not as two numbers. */}
                  <span className="sr-only">{pairCode.split("").join(" ")}</span>
                </p>
              )}
            </div>
          </div>
          <ol className="flex flex-col gap-3">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-4 text-xl/normal">
                <span aria-hidden className="flex size-10 flex-none items-center justify-center rounded-full bg-kibo-tint text-xl/normal font-bold text-kibo-deep">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </>
      ) : (
        session && (
          <section aria-label="What the phone is doing" className={`flex flex-col gap-2 ${CARD}`}>
            <p aria-live="polite" data-panel-order className="text-[32px]/tight font-bold">
              {orderLine(session, kiosk.domain)}
            </p>
            {session.lastChange && (
              <p className="text-lg text-muted">
                Last change: {session.lastChange.source === "voice" || session.lastChange.source === "text" ? "by the AI" : session.lastChange.source === "button" ? "on the phone" : "on the kiosk"}
              </p>
            )}
          </section>
        )
      )}
      {props.children}
    </aside>
  );
}

function PhoneStatus({ link, session, clockOffset }: { link: ReturnType<typeof phoneLink>; session: Session | null; clockOffset: number }) {
  if (link === "waiting")
    return (
      <p role="status" className="flex items-center gap-3 self-start rounded-full bg-white px-4 py-2 text-xl/normal font-semibold shadow-card">
        <span aria-hidden className="size-3 rounded-full border-2 border-muted" />
        Waiting for a phone
      </p>
    );
  if (link === "paused")
    return (
      <p role="status" className="flex items-center gap-3 self-start rounded-full bg-staff-tint px-4 py-2 text-xl/normal font-semibold text-staff-ink">
        <span aria-hidden className="size-3 rounded-full bg-staff-ink" />
        Connection paused
      </p>
    );
  // Server time to this screen's clock for the "connected at" time.
  const at = new Date((session?.phoneConnectedAt ?? 0) - clockOffset).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <p role="status" className="flex items-center gap-3 self-start rounded-full bg-white px-4 py-2 text-xl/normal font-semibold shadow-card">
      <span aria-hidden className="size-3 rounded-full bg-online" />
      Phone connected at {at}
    </p>
  );
}
