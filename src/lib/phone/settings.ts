import { SESSION_ID } from "@/lib/commands/schemas";
import type { Locale } from "@/types/menu";
import type { Session, SessionStatus } from "@/types/session";
import { phoneLocale } from "./locale";

// Phone settings kept in localStorage, chosen on /app and read by /assistant. Each key stays shorter than a session
// id, so none can clash with a stored device token (`kibo.phone.<sessionId>`, usePhoneSession).

export const LOCALE_KEY = "kibo.phone.locale";
export const AI_VOICE_KEY = "kibo.phone.aiVoice";
export const LARGE_TEXT_KEY = "kibo.phone.largeText";
/** The last order this phone opened, so /app can offer [Continue my order]. */
export const LAST_ORDER_KEY = "kibo.phone.lastOrder";

/** Larger text scales the phone's root font size; every phone size is rem, so the system font size still applies. */
export const LARGE_TEXT_SCALE = 1.15;

export interface PhoneSettings {
  locale: Locale;
  aiVoice: boolean;
  largeText: boolean;
}

/** Stored values other than "on" and "off" fall back to the default. */
function flag(raw: string | null, fallback: boolean): boolean {
  return raw === "on" ? true : raw === "off" ? false : fallback;
}

export function readSettings(store: Pick<Storage, "getItem">, navigatorLanguage: string | undefined): PhoneSettings {
  return {
    locale: phoneLocale(navigatorLanguage, store.getItem(LOCALE_KEY)),
    aiVoice: flag(store.getItem(AI_VOICE_KEY), true),
    largeText: flag(store.getItem(LARGE_TEXT_KEY), false),
  };
}

export function writeSettings(store: Pick<Storage, "setItem">, next: Partial<PhoneSettings>): void {
  if (next.locale) store.setItem(LOCALE_KEY, next.locale);
  if (next.aiVoice !== undefined) store.setItem(AI_VOICE_KEY, next.aiVoice ? "on" : "off");
  if (next.largeText !== undefined) store.setItem(LARGE_TEXT_KEY, next.largeText ? "on" : "off");
}

const LIVE: SessionStatus[] = ["connected", "ordering", "confirming", "paying"];

/** What /assistant stores about the order it shows: ids and times only, never the cart or a token. */
export function lastOrderRecord(session: Pick<Session, "sessionId" | "status" | "expiresAt">): string {
  return JSON.stringify({ sessionId: session.sessionId, status: session.status, expiresAt: session.expiresAt });
}

/**
 * Where [Continue my order] goes, or null to hide it: only an order that was still open when last seen, before its
 * expiry, and whose device token this phone still holds (it is removed when another phone takes over).
 */
export function resumeHref(raw: string | null, deviceTokenFor: (sessionId: string) => string | null, now: number): string | null {
  if (!raw) return null;
  let rec: unknown;
  try {
    rec = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!rec || typeof rec !== "object") return null;
  const { sessionId, status, expiresAt } = rec as Record<string, unknown>;
  if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) return null;
  if (!LIVE.includes(status as SessionStatus)) return null;
  if (typeof expiresAt !== "number" || expiresAt <= now) return null;
  if (!deviceTokenFor(sessionId)) return null;
  return `/assistant?s=${sessionId}`;
}
