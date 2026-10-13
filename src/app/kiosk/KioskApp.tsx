"use client";

import { KioskCanvas } from "@/components/kiosk/KioskCanvas";
import { KioskScreen } from "@/components/kiosk/KioskScreen";
import { useKioskSession } from "@/hooks/useKioskSession";
import type { KioskData } from "@/types/menu";

/** Standalone /kiosk: owns its session (stored per kiosk); /demo passes its own session to KioskScreen. */
export function KioskApp({ kiosk, demo }: { kiosk: KioskData; demo: boolean }) {
  const ks = useKioskSession(kiosk.kioskId);
  return (
    <KioskCanvas theme={kiosk.theme} locale={kiosk.locale}>
      <KioskScreen
        kiosk={kiosk}
        session={ks.session}
        kioskToken={ks.kioskToken}
        claimUrl={ks.claimUrl}
        pairCode={ks.pairCode}
        demo={demo}
        clockOffset={ks.clockOffset}
        onNewSession={() => void ks.newSession()}
        onClaimUrl={ks.setClaimUrl}
        onStartOver={() => void ks.newSession()}
      />
    </KioskCanvas>
  );
}
