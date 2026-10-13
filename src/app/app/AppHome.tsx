"use client";

import { Check, ScanLine } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ServiceWorker } from "@/components/app/ServiceWorker";
import { CARD, FOCUS, ICON, PRESS, PRIMARY, SECONDARY } from "@/components/phone/ui";
import { setPhoneSettings, usePhoneSettings } from "@/hooks/usePhoneSettings";
import { pt } from "@/lib/i18n/phone";
import { LAST_ORDER_KEY, resumeHref } from "@/lib/phone/settings";
import type { Locale } from "@/types/menu";

// The phone app's home (P0, docs/UI_GUIDE.md "Phone design"): scan a kiosk, continue an open order, and the
// settings /assistant reads (language, AI voice, larger text). No kiosk yet, so no app bar or [Call staff].

const noSubscribe = () => () => {};

/** The open order this phone can go back to; checked once on load (an order lasts minutes, not seconds). */
function readResume(): string | null {
  return resumeHref(localStorage.getItem(LAST_ORDER_KEY), (id) => localStorage.getItem(`kibo.phone.${id}`), Date.now());
}

export function AppHome() {
  const { locale, aiVoice, largeText } = usePhoneSettings();
  const resume = useSyncExternalStore(noSubscribe, readResume, () => null);

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-cream px-4 py-6 text-ink">
      <ServiceWorker />
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Image src="/kibo-logo.svg" alt="KIBO" width={148} height={40} unoptimized preload className="h-10 w-auto self-start" />
          <h1 className="text-2xl leading-tight font-bold">{pt("appTagline", locale)}</h1>
        </div>

        <div className="flex flex-col gap-3">
          <Link href="/app/scan" className={`${PRIMARY} min-h-22`}>
            <ScanLine {...ICON} />
            {pt("scanKiosk", locale)}
          </Link>
          {resume && (
            <Link href={resume} className={SECONDARY}>
              {pt("continueOrder", locale)}
            </Link>
          )}
        </div>

        <section aria-labelledby="how" className={`${CARD} flex flex-col gap-3`}>
          <h2 id="how" className="text-xl font-bold">
            {pt("howTitle", locale)}
          </h2>
          <ol className="flex flex-col gap-3">
            {(["appStep1", "appStep2", "appStep3"] as const).map((key, i) => (
              <li key={key} className="flex items-start gap-3 text-xl leading-normal">
                <span
                  aria-hidden
                  className="flex size-8 flex-none items-center justify-center rounded-full bg-kibo-tint font-[family-name:var(--font-grotesk)] text-base font-bold text-kibo-deep"
                >
                  {i + 1}
                </span>
                {pt(key, locale)}
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="settings" className={`${CARD} flex flex-col gap-4`}>
          <h2 id="settings" className="text-xl font-bold">
            {pt("settings", locale)}
          </h2>
          <LanguagePicker locale={locale} />
          <Toggle label={pt("aiVoice", locale)} on={aiVoice} locale={locale} onChange={(v) => setPhoneSettings({ aiVoice: v })} />
          <Toggle label={pt("largeText", locale)} on={largeText} locale={locale} onChange={(v) => setPhoneSettings({ largeText: v })} />
        </section>
      </div>
    </main>
  );
}

/** Two choices, each named in its own language; the chosen one has a check mark as well as its color. */
function LanguagePicker({ locale }: { locale: Locale }) {
  const options: { value: Locale; key: "langKo" | "langEn" }[] = [
    { value: "ko", key: "langKo" },
    { value: "en", key: "langEn" },
  ];
  return (
    <div role="group" aria-labelledby="language" className="flex flex-col gap-2">
      <span id="language" className="text-base font-semibold text-muted">
        {pt("language", locale)}
      </span>
      <div className="grid grid-cols-2 gap-2 rounded-tile bg-kibo-tint p-1">
        {options.map((o) => {
          const chosen = locale === o.value;
          return (
            <button
              key={o.value}
              type="button"
              lang={o.value}
              aria-pressed={chosen}
              onClick={() => setPhoneSettings({ locale: o.value })}
              className={`flex min-h-14 items-center justify-center gap-2 rounded-tile px-2 text-xl font-semibold ${
                chosen ? "bg-white text-kibo shadow-card" : "text-kibo-deep active:bg-kibo-tint-pressed"
              } ${PRESS} ${FOCUS}`}
            >
              {chosen && <Check {...ICON} />}
              {pt(o.key, locale)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A full-width row: the setting's name, then the switch with its state in words. */
function Toggle(props: { label: string; on: boolean; locale: Locale; onChange(on: boolean): void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      onClick={() => props.onChange(!props.on)}
      className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-tile text-left text-xl font-semibold active:bg-kibo-tint ${PRESS} ${FOCUS}`}
    >
      <span>{props.label}</span>
      <span className="flex flex-none items-center gap-2">
        <span aria-hidden className="text-base font-normal text-muted">
          {pt(props.on ? "settingOn" : "settingOff", props.locale)}
        </span>
        <span
          aria-hidden
          className={`flex h-8 w-14 items-center rounded-full p-1 ${props.on ? "justify-end bg-kibo" : "justify-start bg-field"}`}
        >
          <span className="size-6 rounded-full bg-white" />
        </span>
      </span>
    </button>
  );
}
