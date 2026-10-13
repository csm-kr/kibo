"use client";

import { useSyncExternalStore } from "react";
import { KioskCanvas } from "@/components/kiosk/KioskCanvas";
import { KioskScreen } from "@/components/kiosk/KioskScreen";
import { PairingPanel } from "@/components/pairing/PairingPanel";
import { PausedLayer } from "@/components/PausedLayer";
import { useKioskSession } from "@/hooks/useKioskSession";
import { kt } from "@/lib/i18n/kiosk";
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
  // On a landscape screen the portrait canvas leaves room at the side, so KIBO's pairing panel takes it; portrait
  // screens keep the canvas alone. Rendered only when landscape, so a portrait kiosk has no hidden copy of the code.
  const landscape = useSyncExternalStore(subscribeLandscape, () => window.matchMedia(LANDSCAPE).matches, () => false);
  // The canvas keeps its place in the tree either way, so turning the screen never remounts the kiosk.
  return (
    <div className="flex h-full w-full">
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
          />
        </KioskCanvas>
      </div>
      {landscape && (
        <div className="min-w-0 flex-1">
          <PairingPanel kiosk={kiosk} session={ks.session} claimUrl={ks.claimUrl} pairCode={ks.pairCode} pairUrl={ks.pairUrl} clockOffset={ks.clockOffset} />
        </div>
      )}
      {ks.paused && <PausedLayer kiosk lines={[kt("streamPaused", "ko"), kt("streamPaused", "en")]} onResume={ks.resume} />}
    </div>
  );
}
