import type { LiveServerMessage } from "@google/genai";

// Counts finished user turns (`utteranceSeq`, docs/ARCHITECTURE.md "Commands and actors"). Every tool call in one
// model response carries the same seq, so the server can refuse a confirmCheckout chained after requestCheckout.

export type LiveMessage = Pick<LiveServerMessage, "serverContent" | "toolCall" | "setupComplete">;

export type TurnEvent = { type: "userSpeech" } | { type: "modelOutput" } | { type: "responseEnd" };

export interface TurnState {
  seq: number;
  /** User speech arrived that no response has answered yet. */
  heard: boolean;
  /** A model response is running: it produced output and has not completed or been interrupted. */
  responding: boolean;
}

/** `seq` carries over from an earlier connection, so the counter never goes back. */
export function initialTurns(seq = 0): TurnState {
  return { seq, heard: false, responding: false };
}

/** The events one server message carries, in the order they count. */
export function turnEvents(msg: LiveMessage): TurnEvent[] {
  const sc = msg.serverContent;
  const events: TurnEvent[] = [];
  if (sc?.inputTranscription?.text?.trim()) events.push({ type: "userSpeech" });
  const output =
    (sc?.modelTurn?.parts?.length ?? 0) > 0 || !!sc?.outputTranscription?.text?.trim() || (msg.toolCall?.functionCalls?.length ?? 0) > 0;
  if (output) events.push({ type: "modelOutput" });
  if (sc?.turnComplete || sc?.interrupted) events.push({ type: "responseEnd" });
  return events;
}

export function turnsReducer(s: TurnState, e: TurnEvent): TurnState {
  switch (e.type) {
    case "userSpeech":
      // Speech heard while a response runs (a late transcript chunk or a new sentence) counts for the next one.
      return s.heard ? s : { ...s, heard: true };
    case "modelOutput":
      if (s.responding) return s;
      return s.heard ? { seq: s.seq + 1, heard: false, responding: true } : { ...s, responding: true };
    case "responseEnd":
      return s.responding ? { ...s, responding: false } : s;
  }
}
