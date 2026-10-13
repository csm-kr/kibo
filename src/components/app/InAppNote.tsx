"use client";

import { useSyncExternalStore } from "react";
import { pt } from "@/lib/i18n/phone";
import { isInAppBrowser } from "@/lib/phone/inApp";
import type { Locale } from "@/types/menu";

const noSubscribe = () => () => {};

/** /app and /app/scan in KakaoTalk, NAVER, Instagram and the like: their browsers often block the mic and camera. */
export function InAppNote({ locale }: { locale: Locale }) {
  const inApp = useSyncExternalStore(noSubscribe, () => isInAppBrowser(navigator.userAgent), () => false);
  if (!inApp) return null;
  return (
    <p role="note" data-in-app-note className="rounded-tile bg-staff-tint px-4 py-3 text-base font-semibold text-staff-ink">
      {pt("inAppCamera", locale)} {pt("inAppOpen", locale)}
    </p>
  );
}
