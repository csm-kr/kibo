import type { Session } from "@/types/session";

/**
 * The line an undo on a learned kiosk removes, or null when it cannot undo. The server's rule; the phone uses it to
 * show [Undo] only when the server would take it. Kept apart from machine.ts so the phone does not bundle the menus.
 */
export function learnedUndoLine(s: Session): { lineId: string; lineIndex: number } | null {
  const lineId = s.lastChange?.kind === "add" ? s.lastChange.lineId : null;
  const lineIndex = s.cart.findIndex((l) => l.lineId === lineId);
  const before = s.undoStack.at(-1);
  // Removing the line undoes only an add that made a new line; an add that raised a quantity would lose more.
  if (lineId === null || lineIndex < 0 || !before || before.some((l) => l.lineId === lineId)) return null;
  return { lineId, lineIndex };
}
