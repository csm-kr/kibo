import { LANGUAGES, type SpeechLanguage } from "@/lib/i18n/languages";
import type { KioskData, Locale } from "@/types/menu";
import type { Session } from "@/types/session";
import { choiceLabel, FIXED_LABELS } from "./choices";

// The language of the user's own words, decided on the server for the text agent (16-judge-r3-fixes:0). A judge wrote
// Korean on English screens and the AI answered in English after a choice tap, because the tap sends the button's
// English label as the message. Script ranges only, no model or library: Hangul, kana, Han and Thai are unambiguous;
// Latin-script languages are left to the model, as before.

type Turn = { role: "user" | "model"; text: string };

export type ScriptLanguage = Extract<SpeechLanguage, "ko" | "ja" | "zh" | "th">;

/** Hangul is Korean; any kana is Japanese; Han with no kana is Chinese; Thai is Thai. Anything else: null. */
export function scriptLanguage(text: string): ScriptLanguage | null {
  if (/[ᄀ-ᇿ㄰-㆏가-힯]/.test(text)) return "ko";
  if (/[぀-ヿ]/.test(text)) return "ja";
  if (/[㐀-䶿一-鿿]/.test(text)) return "zh";
  if (/[฀-๿]/.test(text)) return "th";
  return null;
}

/** A message equal to a button the phone may show: a fixed label in any language, or a name in the screens' locale. */
function isLabel(kiosk: KioskData, text: string, locale: Locale, pendingChoice: Session["pendingChoice"]): boolean {
  const t = text.trim();
  if (FIXED_LABELS.has(t)) return true;
  if (pendingChoice?.choices.some((c) => choiceLabel(kiosk, c, locale) === t)) return true;
  // An earlier turn may have been a tap on a choice that is gone now.
  if (kiosk.items.some((i) => i.name[locale] === t || i.optionGroups.some((g) => g.options.some((o) => o.name[locale] === t)))) return true;
  return Object.values(kiosk.dineOptions ?? {}).some((d) => d.name[locale] === t);
}

/**
 * The language of the user's latest own words: the message, or, when it is a button's label, the latest earlier user
 * turn that is not one. Null when those words are not in a script this can tell, or there are none.
 */
export function ownWordsLanguage(
  kiosk: KioskData,
  input: { message: string; history: Turn[]; pendingChoice: Session["pendingChoice"]; locale: Locale },
): ScriptLanguage | null {
  const said = [input.message, ...input.history.filter((h) => h.role === "user").map((h) => h.text).reverse()];
  const own = said.find((text) => !isLabel(kiosk, text, input.locale, input.pendingChoice));
  return own === undefined ? null : scriptLanguage(own);
}

/** One line for the <current_order> block (never the cached system text), when the user's words differ from the AI language. */
export function replyLanguageLine(own: SpeechLanguage | null, aiLanguage: SpeechLanguage): string | null {
  if (own === null || own === aiLanguage) return null;
  const name = LANGUAGES[own].english;
  return `Reply language: ${name} (the user's own words are in ${name}).`;
}
