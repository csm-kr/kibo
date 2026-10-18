import type { Session } from "@/types/session";

/** How long after a cart change the phone still brings that line into view when a reply lands (voice replies end late). */
export const FOLLOW_MS = 15_000;

/**
 * The cart line P3 brings into view, so the phone follows the talk as the kiosk does (owner 10-18, I-430): a line the
 * last change added or changed, for a short while. None while choices ask something: the question comes first.
 * `serverNow` is local time plus the clock offset, because `lastChange.at` is server time.
 */
export function followLine(change: Session["lastChange"], choicesShown: boolean, serverNow: number): string | null {
  if (!change?.lineId || choicesShown) return null;
  if (change.kind !== "add" && change.kind !== "update") return null;
  return serverNow - change.at <= FOLLOW_MS ? change.lineId : null;
}
