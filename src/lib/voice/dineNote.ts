import type { DineOption } from "@/types/session";

// Shared by the instructions (server) and the voice hook (browser). Its own file, so the browser never bundles the
// instructions (docs/SECURITY.md "Gemini Live tokens").

export const PHONE_NOTE = "Note from the phone:";

/**
 * Told to an open Live session when a tap on the phone set the dine option (14-final:4): the session's instructions
 * were pinned when voice connected, often before the user chose eat-in on P2, and the model asked again.
 */
export function dineNote(dineOption: DineOption): string {
  return `${PHONE_NOTE} the user chose ${dineOption} by a tap; Dine option: ${dineOption}, already saved. Do not ask eat here or take out, and do not call setDineOption.`;
}
