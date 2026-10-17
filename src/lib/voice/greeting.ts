import type { SessionStatus } from "@/types/session";
import type { TurnEvent } from "./turns";

// Shared by the instructions (server) and the voice hook (browser). Its own file, so the browser never bundles the
// instructions (docs/SECURITY.md "Gemini Live tokens").

export const GREETING_NOTE = "Greeting from the phone:";

const BEFORE_REVIEW = new Set<SessionStatus>(["idle", "connected", "ordering"]);

/** What a tool call in the greeting's own response gets instead of running: nothing is done. */
export const HELD_RESULT = {
  ok: false,
  code: "CONFLICT",
  message: "That was the phone's greeting, not the user's words; nothing was done. Wait for the user.",
};

export interface GreetingTurn {
  turns: { role: "user"; parts: { text: string }[] }[];
  turnComplete: true;
}

/**
 * The AI speaks first when voice opens (owner 10-17): one text turn from the phone with a fixed sentence, which the
 * Live instructions say to speak word for word. Once per voice start, so a reconnect never greets again. Never an
 * utterance: the phone does not count its own turns, and text gets no input transcription back (src/lib/voice/turns.ts).
 * Tool calls in its own response are held, so the greeting can change nothing.
 */
export function greeter() {
  let sent = false;
  let open = false;
  return {
    /**
     * The turn to send when a connection opens, or null: greeted already in this voice start, no greeting (the
     * conversation has begun, or not the phone), or the review or payment is under way.
     */
    onConnected(greeting: string | null, status: SessionStatus | null): GreetingTurn | null {
      if (sent || !greeting || !status || !BEFORE_REVIEW.has(status)) return null;
      sent = true;
      open = true;
      return { turns: [{ role: "user", parts: [{ text: `${GREETING_NOTE} ${greeting}` }] }], turnComplete: true };
    },
    /** The greeting's response ends with its turn or an interruption, or once the user speaks. */
    onMessage(events: TurnEvent[]): void {
      if (events.some((e) => e.type === "userSpeech" || e.type === "responseEnd")) open = false;
    },
    /** Tool calls now belong to the greeting's response: answer them with HELD_RESULT and run nothing. */
    get holdsTools(): boolean {
      return open;
    },
  };
}
