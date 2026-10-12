"use client";

import { useState } from "react";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { KioskCanvas } from "@/components/kiosk/KioskCanvas";
import { KioskScreen } from "@/components/kiosk/KioskScreen";
import { LearnedKioskHost } from "@/components/learned/LearnedKioskHost";
import { useDemoSession } from "@/hooks/useDemoSession";
import { examplesFor } from "@/lib/agent/examples";
import type { KioskData, Locale } from "@/types/menu";
import { DemoEndCard } from "./DemoEndCard";
import { DemoIntro } from "./DemoIntro";

// /demo (docs/UX.md Flow C, screen map D1–D3): the real KioskScreen (or a learned kiosk page with the bridge) and
// AssistantPanel on one real session. Nothing is recorded or simulated beyond the card reader, and the stand-in goes
// through the kiosk's own path.

/** The server's per-order chat limit for demo sessions (docs/ARCHITECTURE.md "Limits and cost"). */
const DEMO_CHAT_LIMIT = 30;

export function DemoApp({ kiosk }: { kiosk: KioskData }) {
  const demo = useDemoSession(kiosk.kioskId);
  const [locale, setLocale] = useState<Locale>("en");
  // The card stand-in on the phone half sends "tap" here; the kiosk's K7 inserts the card when it hears it.
  const [cardTap] = useState(() => new EventTarget());
  const learned = kiosk.kind === "learned";

  if (!demo.tokens) {
    return <DemoIntro kioskId={kiosk.kioskId} starting={demo.starting} error={demo.error} onStart={() => void demo.start()} />;
  }

  const { tokens, session } = demo;
  const tryAgain = () => void demo.start();

  return (
    <main data-demo="split" data-demo-kiosk={kiosk.kioskId} className="flex h-dvh w-full justify-center gap-6 overflow-hidden bg-[#F3EEE4] p-4 text-[#15171C]">
      {/* 72px = page padding 32 + caption 32 + gap 8, so the canvas (9:16, or the learned page's 1080:1600) fills the height. */}
      <section
        aria-labelledby="demo-kiosk-caption"
        className={`flex h-full flex-none flex-col gap-2 ${learned ? "w-[calc((100dvh-72px)*27/40)]" : "w-[calc((100dvh-72px)*9/16)]"}`}
      >
        <Caption
          id="demo-kiosk-caption"
          text={learned ? "Kiosk (unchanged third-party screen, learned once by KIBO Learn)" : "Kiosk (unchanged, Korean only)"}
        />
        <div className="min-h-0 flex-1 overflow-hidden rounded-[18px]">
          {learned ? (
            // Keyed by session: [Try again] reloads the kiosk page, so the new order never starts on the old cart.
            <LearnedKioskHost key={tokens.sessionId} kiosk={kiosk} session={session} kioskToken={tokens.kioskToken} claimUrl={tokens.claimUrl} />
          ) : (
            <KioskCanvas theme={kiosk.theme} locale={kiosk.locale}>
              <KioskScreen
                kiosk={kiosk}
                session={session}
                kioskToken={tokens.kioskToken}
                claimUrl={tokens.claimUrl}
                demo
                clockOffset={demo.clockOffset}
                // A send found the session gone or expired: start over. A paid order stays for the end card.
                onNewSession={() => {
                  if (session?.status !== "paid") tryAgain();
                }}
                onClaimUrl={demo.setClaimUrl}
                cardTap={cardTap}
                keepOrderNumber
              />
            </KioskCanvas>
          )}
        </div>
      </section>
      <section
        data-demo-check
        aria-labelledby="demo-phone-caption"
        className="flex h-full w-[clamp(400px,32vw,480px)] flex-none flex-col gap-2"
      >
        <Caption id="demo-phone-caption" text="Your phone (KIBO)" />
        <div className="min-h-0 flex-1 overflow-hidden rounded-[26px] border-2 border-[#15171C]">
          <AssistantPanel
            key={tokens.sessionId}
            kiosk={kiosk}
            session={session}
            deviceToken={tokens.deviceToken}
            locale={locale}
            onLocaleChange={setLocale}
            mode="demo"
            examples={examplesFor(kiosk.kioskId, locale, "demo")}
            onCardStandIn={() => cardTap.dispatchEvent(new Event("tap"))}
            streamState={demo.streamState}
            clockOffset={demo.clockOffset}
            chatLimit={DEMO_CHAT_LIMIT}
            onTryAgain={tryAgain}
            endCard={<DemoEndCard locale={locale} learned={learned} onTryAgain={tryAgain} onIntro={demo.stop} />}
          />
        </div>
      </section>
    </main>
  );
}

function Caption({ id, text }: { id: string; text: string }) {
  return (
    <h2 id={id} className="flex h-8 flex-none items-center text-base font-bold text-[#33302B]">
      {text}
    </h2>
  );
}
