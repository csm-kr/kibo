"use client";

import { useEffect, useSyncExternalStore } from "react";
import { LARGE_TEXT_SCALE, readSettings, writeSettings, type PhoneSettings } from "@/lib/phone/settings";

// The phone settings from localStorage (src/lib/phone/settings.ts), shared by /app and /assistant. `storage` events
// cover other tabs, `notify` this one. Each value is its own snapshot: a primitive, so React sees a stable value.

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

const read = () => readSettings(localStorage, navigator.language);

export function setPhoneSettings(next: Partial<PhoneSettings>) {
  writeSettings(localStorage, next);
  listeners.forEach((cb) => cb());
}

export function usePhoneSettings(): PhoneSettings {
  const locale = useSyncExternalStore(subscribe, () => read().locale, () => "en" as const);
  const aiVoice = useSyncExternalStore(subscribe, () => read().aiVoice, () => true);
  const largeText = useSyncExternalStore(subscribe, () => read().largeText, () => false);

  // The page language and, with larger text, the root font size (in percent, so the browser's own size still counts).
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    if (!largeText) return;
    const root = document.documentElement.style;
    root.fontSize = `${LARGE_TEXT_SCALE * 100}%`;
    return () => {
      root.fontSize = "";
    };
  }, [largeText]);

  return { locale, aiVoice, largeText };
}
