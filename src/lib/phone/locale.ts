import type { Locale } from "@/types/menu";

/** The phone follows the browser language (Korean for ko*, English otherwise); a choice the user made wins. */
export function phoneLocale(navigatorLanguage: string | undefined, stored?: string | null): Locale {
  if (stored === "ko" || stored === "en") return stored;
  return navigatorLanguage?.toLowerCase().startsWith("ko") ? "ko" : "en";
}
