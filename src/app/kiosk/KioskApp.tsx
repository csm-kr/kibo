"use client";

import { useState, useSyncExternalStore } from "react";
import { KioskCanvas } from "@/components/kiosk/KioskCanvas";
import { KioskScreen } from "@/components/kiosk/KioskScreen";
import { PairingPanel } from "@/components/pairing/PairingPanel";
import { useKioskSession } from "@/hooks/useKioskSession";
import type { KioskData } from "@/types/menu";

/** Wider than tall: a laptop standing in for the kiosk. */
const LANDSCAPE = "(orientation: landscape)";

function subscribeLandscape(cb: () => void) {
  const mq = window.matchMedia(LANDSCAPE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** Standalone /kiosk: owns its session (stored per kiosk); /demo passes its own session to KioskScreen. */
export function KioskApp({ kiosk, demo }: { kiosk: KioskData; demo: boolean }) {
  const ks = useKioskSession(kiosk.kioskId);
  // On a landscape screen the portrait canvas leaves room at the side, so KIBO's slim status column takes some of it
  // and the two sit centred, the kiosk as tall as the screen; portrait screens keep the canvas alone. The QR and code
  // are only on the kiosk's own screen (14-final:1).
  const landscape = useSyncExternalStore(subscribeLandscape, () => window.matchMedia(LANDSCAPE).matches, () => false);
  // The session whose order number the kiosk shows (past its receipt question), for the panel's step line, as /demo
  // does (#1 31): only the kiosk screen knows that step (R-024).
  const [numberFor, setNumberFor] = useState<string | null>(null);
  // The canvas keeps its place in the tree either way, so turning the screen never remounts the kiosk.
  return (
    <div className={`flex h-full w-full ${landscape ? "justify-center bg-cream" : ""}`}>
      <div className={landscape ? "h-full w-[calc(100dvh*9/16)] flex-none" : "h-full w-full"}>
        <KioskCanvas theme={kiosk.theme} locale={kiosk.locale}>
          <KioskScreen
            kiosk={kiosk}
            session={ks.session}
            kioskToken={ks.kioskToken}
            claimUrl={ks.claimUrl}
            pairCode={ks.pairCode}
            pairUrl={ks.pairUrl}
            demo={demo}
            clockOffset={ks.clockOffset}
            onNewSession={() => void ks.newSession()}
            onClaimUrl={ks.setClaimUrl}
            onStartOver={() => void ks.newSession()}
            onOrderNumber={setNumberFor}
            retrying={ks.streamState === "retrying"}
          />
        </KioskCanvas>
      </div>
      {landscape && (
        <div className="w-[clamp(320px,26vw,440px)] min-w-0 flex-none">
          <PairingPanel
            kiosk={kiosk}
            session={ks.session}
            claimUrl={ks.claimUrl}
            pairUrl={ks.pairUrl}
            clockOffset={ks.clockOffset}
            numberShown={ks.session !== null && numberFor === ks.session.sessionId}
          />
        </div>
      )}
    </div>
  );
}
