"use client";

import { Bell, Check, Globe, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { useInertBackground } from "@/hooks/useInertBackground";
import { aiOnly, LANGUAGES, SPEECH_LANGUAGES, type SpeechLanguage } from "@/lib/i18n/languages";
import { pt } from "@/lib/i18n/phone";
import type { Locale } from "@/types/menu";
import { COMPACT, FOCUS, ICON, PRESS, QUIET } from "./ui";

// The phone app bar (docs/UI_GUIDE.md "Phone design"): one 64px row on every phone screen. The connection state is a
// dot and a word, so color is never the only signal; each control's visible word is part of its accessible name.

export type Connection = "connected" | "reconnecting";

export function AppBar(props: {
  brand: string;
  locale: Locale;
  /** Left out before there is an order to be connected to, and after it ended. */
  connection?: Connection;
  onLocaleChange(next: Locale): void;
  /**
   * The phone's language picker (14-final:4): with it, the language button opens a list of every AI language instead
   * of switching between Korean and English. `language` is the one in use.
   */
  language?: SpeechLanguage;
  onLanguageChange?: (next: SpeechLanguage) => void;
  /** Left out once the order has ended (P7). */
  onStaff?: () => void;
  staffDisabled?: boolean;
}) {
  const { locale, onLanguageChange } = props;
  const other: Locale = locale === "ko" ? "en" : "ko";
  const online = props.connection === "connected";
  const language = props.language ?? locale;
  const [picking, setPicking] = useState(false);
  return (
    <>
      <header className="flex min-h-16 flex-none items-center gap-2 bg-white px-4 py-1 shadow-card">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* max-w-none: a percentage max-width lets the row count the logo as 0px wide (I-062). */}
          <Image src="/kibo-mark.svg" alt="KIBO" width={32} height={32} unoptimized className="size-8 max-w-none flex-none" />
          <div className="flex min-w-0 flex-col">
            <span className="text-base leading-normal font-bold [overflow-wrap:anywhere]">{props.brand}</span>
            {props.connection && (
              <span role="status" className="flex items-center gap-2 text-base leading-normal text-muted">
                <span aria-hidden className={`size-2 flex-none rounded-full ${online ? "bg-online" : "bg-staff-ink"}`} />
                {pt(online ? "connected" : "barReconnecting", locale)}
              </span>
            )}
          </div>
        </div>
        {onLanguageChange ? (
          // The language in use, in its own words: a visitor finds theirs by its look, and the globe says what the
          // button does. The accessible name holds the visible word (WCAG 2.5.3).
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={`${pt("language", locale)}: ${LANGUAGES[language].native}`}
            onClick={() => setPicking(true)}
            className={`${COMPACT} max-w-32 text-ink active:bg-kibo-tint`}
          >
            <Globe {...ICON} />
            <span lang={language} className="truncate">
              {LANGUAGES[language].native}
            </span>
          </button>
        ) : (
          // Named in the other language, so a reader of either can find it. The full name is shown, not "EN": a short
          // code that is not a word of the accessible name fails WCAG 2.5.3 (label in name).
          <button type="button" lang={other} onClick={() => props.onLocaleChange(other)} className={`${COMPACT} text-ink active:bg-kibo-tint`}>
            <Globe {...ICON} />
            <span>{pt(other === "ko" ? "langKo" : "langEn", locale)}</span>
          </button>
        )}
        {props.onStaff && (
          <button
            type="button"
            aria-label={pt("callStaff", locale)}
            disabled={props.staffDisabled}
            onClick={props.onStaff}
            className={`${COMPACT} bg-staff-tint text-staff-ink active:bg-staff-tint-pressed disabled:opacity-60`}
          >
            <Bell {...ICON} />
            <span>{pt("staffShort", locale)}</span>
          </button>
        )}
      </header>
      {picking && onLanguageChange && (
        <LanguagePicker
          locale={locale}
          language={language}
          onPick={(next) => {
            setPicking(false);
            if (next !== language) onLanguageChange(next);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}

/**
 * Every AI language, each in its own words with its English name under it. Korean and English change the screens too;
 * the others only what the AI speaks and writes (docs/UX.md P-lang). A layer over the phone: the rest is inert,
 * Escape and [Close] close it, and focus starts on the language in use.
 */
function LanguagePicker(props: { locale: Locale; language: SpeechLanguage; onPick(l: SpeechLanguage): void; onClose(): void }) {
  const { locale, language } = props;
  const ref = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useInertBackground(ref);
  useEffect(() => {
    current.current?.focus();
  }, []);
  const option = (l: SpeechLanguage) => (
    <li key={l}>
      <button
        ref={l === language ? current : undefined}
        type="button"
        aria-current={l === language || undefined}
        onClick={() => props.onPick(l)}
        className={`flex min-h-15 w-full items-center gap-3 rounded-tile px-4 py-2 text-left ${
          l === language ? "bg-kibo-tint" : "bg-white shadow-card active:bg-kibo-tint"
        } ${PRESS} ${FOCUS}`}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span lang={l} className="text-xl font-semibold text-ink">
            {LANGUAGES[l].native}
          </span>
          {LANGUAGES[l].native !== LANGUAGES[l].english && <span className="text-base text-muted">{LANGUAGES[l].english}</span>}
        </span>
        {l === language && <Check {...ICON} className="flex-none text-kibo" />}
      </button>
    </li>
  );
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-language-picker
      onKeyDown={(e) => {
        if (e.key === "Escape") props.onClose();
      }}
      className="kibo-fade-in absolute inset-0 z-30 flex flex-col bg-cream"
    >
      <div className="flex min-h-16 flex-none items-center justify-between gap-2 bg-white px-4 py-1 shadow-card">
        <h2 id={titleId} className="text-2xl font-bold">
          {pt("language", locale)}
        </h2>
        <button type="button" onClick={props.onClose} className={QUIET}>
          <X {...ICON} />
          {pt("closeTyping", locale)}
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
        <section className="flex flex-col gap-2">
          <h3 className="text-base font-semibold text-muted">{pt("langScreens", locale)}</h3>
          <ul className="flex flex-col gap-2">{SPEECH_LANGUAGES.filter((l) => !aiOnly(l)).map(option)}</ul>
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-base font-semibold text-muted">{pt("langAiOnly", locale)}</h3>
          <ul className="flex flex-col gap-2">{SPEECH_LANGUAGES.filter(aiOnly).map(option)}</ul>
          <p className="text-base text-muted">{pt("langAiNote", locale)}</p>
        </section>
      </div>
    </div>
  );
}
