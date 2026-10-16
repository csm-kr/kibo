"use client";

import Image from "next/image";
import { CARD } from "@/components/phone/ui";
import { useNow } from "@/hooks/useNow";
import { changeLine, kioskStep, orderLine, phoneLink } from "@/lib/kiosk/pairing";
import type { KioskData } from "@/types/menu";
import type { Session } from "@/types/session";

// KIBO's status column beside a landscape kiosk: /kiosk on a laptop (docs/UX.md Flow A); /demo shows the kiosk alone
// with the judge's own phone (Flow C1a). KIBO's surface, not the store's, so it uses the phone design
// (docs/UI_GUIDE.md "Phone design") at >= 18px. The QR and the 6-digit code live only on the kiosk's own screen, as on
// a real kiosk (14-final:1); this column says where to find them, then what the phone is doing, read-only from the
// session.

export function PairingPanel(props: {
  kiosk: KioskData;
  session: Session | null;
  claimUrl: string | null;
  /** What to open on the phone, from the server (SHORT_APP_URL or <host>/app); else the claim URL's host. */
  pairUrl?: string | null;
  clockOffset: number;
  /** The kiosk beside it shows the order number, past its receipt question (#1 item 13, #1 31). */
  numberShown?: boolean;
}) {
  const { kiosk, session, claimUrl, clockOffset } = props;
  const now = useNow();
  const link = phoneLink(session, now, clockOffset);
  const address = props.pairUrl ?? (claimUrl ? `${new URL(claimUrl).host}/app` : null);
  const steps = [
    <>
      Scan the QR on the kiosk, or open
      {/* Its own line, so the host breaks (at its hyphen or anywhere) only when it cannot fit (I-167). */}
      <strong data-panel-pair-url className="block text-kibo [overflow-wrap:anywhere]">{address ?? "the KIBO app"}</strong>
      and type the code shown there.
    </>,
    "Say what you want to your phone.",
    "Check it on your phone, then pay on the kiosk.",
  ];
  const change = session ? changeLine(session) : null;
  // The kiosk stays Korean; this says its step in English (payment buttons, "no money is charged").
  const step = session ? kioskStep(kiosk, session, props.numberShown) : null;

  return (
    <aside
      data-pairing-panel
      data-phone-link={link}
      lang="en"
      aria-labelledby="pairing-title"
      className="flex h-full min-w-0 flex-col gap-6 overflow-y-auto bg-cream p-6 text-ink"
    >
      <header className="flex flex-col gap-2">
        <Image src="/kibo-logo.svg" alt="KIBO" width={118} height={32} />
        <h2 id="pairing-title" className="font-display text-[28px] leading-tight font-bold">
          Order by talking
        </h2>
      </header>

      <PhoneStatus link={link} session={session} clockOffset={clockOffset} />

      {link === "waiting" ? (
        <ol className={`flex flex-col gap-4 ${CARD}`}>
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-xl/normal">
              <span aria-hidden className="flex size-9 flex-none items-center justify-center rounded-full bg-kibo-tint text-lg font-bold text-kibo-deep">
                {i + 1}
              </span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ol>
      ) : (
        session && (
          <section aria-label="What the phone is doing" className={`flex flex-col gap-2 ${CARD}`}>
            <p aria-live="polite" data-panel-order className="text-[32px]/tight font-bold">
              {orderLine(session, kiosk.domain)}
            </p>
            {change && (
              <p data-panel-change className="text-lg text-muted">
                {change}
              </p>
            )}
            {step && (
              <p data-kiosk-step className="text-lg/normal font-semibold text-kibo-deep">
                {step}
              </p>
            )}
          </section>
        )
      )}
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
