import type { CommandResponse } from "@/lib/session/service";
import type { Session } from "@/types/session";

// Repeated choice buttons (10-17): after a refusal, Gemini Live offered the same drinks three times for one utterance,
// each in its own tool call message, and spoke the question twice. Within one user utterance, an offerChoices
// identical to the one this conversation just opened is answered from its first result and not sent again
// (src/lib/voice/toolRunner.ts for Live, src/lib/agent/chat.ts for /api/chat). The server still validates every offer
// that is sent; this only leaves out one the phone already shows.

/** The session as a screen last saw it; without `recentCommandIds` it says nothing about the offer. */
export type OfferView = { pendingChoice?: Session["pendingChoice"]; recentCommandIds?: string[] } | null | undefined;

type Outcome = { ok: true; response: CommandResponse } | { ok: false };

/** The same template and the same buttons, in any order. */
function offerKey(args: unknown): string | null {
  const a = args as { templateId?: unknown; choices?: unknown } | null;
  if (!a || typeof a.templateId !== "string" || !Array.isArray(a.choices)) return null;
  const ids = a.choices.map((c) => {
    const { kind, id } = (c ?? {}) as { kind?: unknown; id?: unknown };
    return `${String(kind)}:${String(id)}`;
  });
  return `${a.templateId}|${ids.sort().join(",")}`;
}

export function offerTracker() {
  let open: { key: string; seq: number; commandId: string; response: CommandResponse } | null = null;
  return {
    /** The first offer's result, marked `duplicate`, when this call repeats it for the same utterance; else null. */
    repeat(name: string, args: unknown, seq: number, view?: OfferView): CommandResponse | null {
      if (name !== "offerChoices" || !open || open.seq !== seq || offerKey(args) !== open.key) return null;
      // The screen saw the offer land and then lose it (a tap, the kiosk): the buttons are gone, so send it again.
      const seen = view?.recentCommandIds?.includes(open.commandId);
      if (seen && (view?.pendingChoice ? offerKey(view.pendingChoice) : null) !== open.key) return null;
      return { ...open.response, duplicate: true };
    },
    /** After a call went to the server. A refusal changes nothing; another accepted command may clear the buttons. */
    after(name: string, args: unknown, seq: number, commandId: string, outcome: Outcome): void {
      if (!outcome.ok) return;
      const key = name === "offerChoices" ? offerKey(args) : null;
      open = key ? { key, seq, commandId, response: outcome.response } : null;
    },
  };
}

export type OfferTracker = ReturnType<typeof offerTracker>;
