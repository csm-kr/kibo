"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { ServiceWorker } from "@/components/app/ServiceWorker";
import { PausedLayer } from "@/components/PausedLayer";
import { setPhoneSettings, usePhoneSettings } from "@/hooks/usePhoneSettings";
import { usePhoneSession } from "@/hooks/usePhoneSession";
import { examplesFor } from "@/lib/agent/examples";
import { pt } from "@/lib/i18n/phone";
import { isInAppBrowser } from "@/lib/phone/inApp";
import { LAST_ORDER_KEY, lastOrderRecord } from "@/lib/phone/settings";
import type { KioskData, Locale } from "@/types/menu";

const noSubscribe = () => () => {};
const setLocale = (locale: Locale) => setPhoneSettings({ locale });
const setAiVoice = (aiVoice: boolean) => setPhoneSettings({ aiVoice });

/** Standalone /assistant: owns the claim and the connection; /demo passes its own tokens to AssistantPanel. */
export function AssistantApp({ sessionId, kiosks }: { sessionId: string | null; kiosks: Record<string, KioskData> }) {
  // Language, AI voice and larger text, as chosen on /app (or here: the app bar and the dock change them too).
  const settings = usePhoneSettings();
  // null until hydration has read the user agent; the claim waits until then, or it would run before the hold.
  const inApp = useSyncExternalStore<boolean | null>(noSubscribe, () => isInAppBrowser(navigator.userAgent), () => null);
  const [stayInApp, setStayInApp] = useState(false);
  const ps = usePhoneSession(sessionId, { holdClaim: inApp !== false && !stayInApp });
  const kiosk = kiosks[ps.session?.kioskId ?? "malo"] ?? kiosks.malo;

  // /app offers [Continue my order] from this record while the order is open (src/lib/phone/settings.ts).
  const { deviceToken, session } = ps;
  useEffect(() => {
    if (deviceToken && session) localStorage.setItem(LAST_ORDER_KEY, lastOrderRecord(session));
  }, [deviceToken, session]);

  return (
    <>
      <ServiceWorker />
      <AssistantPanel
        key={sessionId}
        kiosk={kiosk}
        session={ps.session}
        deviceToken={ps.deviceToken}
        locale={settings.locale}
        onLocaleChange={setLocale}
        voiceOutput={settings.aiVoice}
        onVoiceOutputChange={setAiVoice}
        mode="phone"
        examples={examplesFor(kiosk.kioskId, settings.locale)}
        claimError={ps.claimError}
        streamState={ps.streamState}
        clockOffset={ps.clockOffset}
        inApp={inApp ? { held: ps.claimHeld, onStay: () => setStayInApp(true) } : undefined}
      />
      {/* After payment nothing more comes through the stream, so the order number stays in view, unpaused (J1). */}
      {ps.paused && session?.status !== "paid" && <PausedLayer lines={[pt("streamPaused", settings.locale)]} onResume={ps.resume} />}
    </>
  );
}
