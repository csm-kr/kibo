"use client";

import { createContext, useContext } from "react";
import { aiOnly, lt, type SpeechLanguage } from "@/lib/i18n/languages";
import { pt, type PhoneTextKey } from "@/lib/i18n/phone";
import type { KioskDomain, Locale } from "@/types/menu";

// The AI language the phone chose (14-final:4). The screens stay Korean or English; the few strings a first-time
// user must read (mic, the review's buttons, the card hint, the order number) follow an AI-only language.

const AiLanguage = createContext<SpeechLanguage | null>(null);
export const AiLanguageProvider = AiLanguage.Provider;

/** `t` for the few translated strings, and `lang` for their element (undefined when the screens' language is used). */
export function useAiText(): { t: (key: PhoneTextKey, locale: Locale, domain?: KioskDomain) => string; lang?: string; ai: SpeechLanguage | null } {
  const language = useContext(AiLanguage);
  if (language && aiOnly(language)) return { t: (key, _locale, domain) => lt(key, language, domain), lang: language, ai: language };
  return { t: pt, ai: null };
}
