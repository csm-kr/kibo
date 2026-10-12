"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { usePhoneSession } from "@/hooks/usePhoneSession";
import { phoneExamples } from "@/lib/i18n/phone";
import { isInAppBrowser } from "@/lib/phone/inApp";
import { phoneLocale } from "@/lib/phone/locale";
import type { KioskData, Locale } from "@/types/menu";

const LOCALE_KEY = "kibo.phone.locale";
const noSubscribe = () => () => {};

// The user's language choice, kept on the phone; `storage` events cover other tabs, `notify` this one.
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function setStoredLocale(l: Locale) {
  localStorage.setItem(LOCALE_KEY, l);
  listeners.forEach((cb) => cb());
}

/** Standalone /assistant: owns the claim and the connection; /demo passes its own tokens to AssistantPanel. */
export function AssistantApp({ sessionId, kiosks }: { sessionId: string | null; kiosks: Record<string, KioskData> }) {
  const locale = useSyncExternalStore(
    subscribe,
    () => phoneLocale(navigator.language, localStorage.getItem(LOCALE_KEY)),
    (): Locale => "en",
  );
  // null until hydration has read the user agent; the claim waits until then, or it would run before the hold.
  const inApp = useSyncExternalStore<boolean | null>(noSubscribe, () => isInAppBrowser(navigator.userAgent), () => null);
  const [stayInApp, setStayInApp] = useState(false);
  const ps = usePhoneSession(sessionId, { holdClaim: inApp !== false && !stayInApp });
  const kiosk = kiosks[ps.session?.kioskId ?? "malo"] ?? kiosks.malo;

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <AssistantPanel
      key={sessionId}
      kiosk={kiosk}
      session={ps.session}
      deviceToken={ps.deviceToken}
      locale={locale}
      onLocaleChange={setStoredLocale}
      mode="phone"
      examples={phoneExamples(locale)}
      claimError={ps.claimError}
      streamState={ps.streamState}
      clockOffset={ps.clockOffset}
      inApp={inApp ? { held: ps.claimHeld, onStay: () => setStayInApp(true) } : undefined}
    />
  );
}
