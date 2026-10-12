"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { usePhoneSession } from "@/hooks/usePhoneSession";
import { phoneExamples } from "@/lib/i18n/phone";
import { phoneLocale } from "@/lib/phone/locale";
import type { KioskData, Locale } from "@/types/menu";

const LOCALE_KEY = "kibo.phone.locale";

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
  const ps = usePhoneSession(sessionId);
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
    />
  );
}
