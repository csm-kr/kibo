import { SESSION_ID } from "@/lib/commands/schemas";

// What /app/scan accepts from a QR code (or a pasted link): only this app's own claim URL,
// `<origin>/assistant?s=<id>#t=<claim>`. Anything else is refused and never opened.

export type KioskQr = { sessionId: string; claimToken: string };
export type KioskQrError = { error: "foreign" | "malformed" };

/** Same limit as the claim route's `claimToken`. */
const CLAIM_TOKEN = /^[A-Za-z0-9_-]{1,128}$/;
/** A claim URL is about 120 characters; anything far longer is not one. */
const MAX_LENGTH = 512;

export function parseKioskQr(text: string, origin: string): KioskQr | KioskQrError {
  const raw = text.trim();
  if (raw.length > MAX_LENGTH) return { error: "malformed" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: "foreign" };
  }
  // Exact origin: scheme, host and port. javascript:, data: and other schemes have an opaque origin ("null").
  if (url.origin !== origin) return { error: "foreign" };
  if (url.pathname !== "/assistant") return { error: "malformed" };
  const sessionId = url.searchParams.get("s");
  const claimToken = new URLSearchParams(url.hash.slice(1)).get("t");
  if (!sessionId || !SESSION_ID.test(sessionId) || !claimToken || !CLAIM_TOKEN.test(claimToken)) return { error: "malformed" };
  return { sessionId, claimToken };
}

/** The link that is opened: rebuilt from the checked parts, so nothing else from the QR reaches it. */
export function assistantHref(qr: KioskQr): string {
  return `/assistant?s=${encodeURIComponent(qr.sessionId)}#t=${qr.claimToken}`;
}
