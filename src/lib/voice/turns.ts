import type { LiveServerMessage } from "@google/genai";

// Counts finished user turns (`utteranceSeq`, docs/ARCHITECTURE.md "Commands and actors"). Every tool call in one
// model response carries the same seq, so the server can refuse a confirmCheckout chained after requestCheckout.

export type LiveMessage = Pick<LiveServerMessage, "serverContent" | "toolCall" | "setupComplete">;

/** `complete`: the response finished (turnComplete), rather than being interrupted or cut by a reconnect. */
export type TurnEvent = { type: "userSpeech" } | { type: "modelOutput" } | { type: "responseEnd"; complete?: boolean };

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
  if (sc?.interrupted) events.push({ type: "responseEnd" });
  else if (sc?.turnComplete) events.push({ type: "responseEnd", complete: true });
  return events;
}

/** Typed and spoken turns share one counter (I-079): the voice counter catches up with a seq the chat used. */
export function raiseSeq(s: TurnState, floor: number): TurnState {
  return floor > s.seq ? { ...s, seq: floor } : s;
}

/**
 * UX "Noise": after two responses in a row to something the user said that ran no tool, suggest typing or the
 * buttons. A question the menu answers counts too; the suggestion is worded so that does no harm.
 */
export function noiseStep(misses: number, response: { heard: boolean; tools: boolean }): { misses: number; suggest: boolean } {
  if (response.tools) return { misses: 0, suggest: false };
  if (!response.heard) return { misses, suggest: false };
  return misses + 1 >= 2 ? { misses: 0, suggest: true } : { misses: misses + 1, suggest: false };
}

export function turnsReducer(s: TurnState, e: TurnEvent): TurnState {
  switch (e.type) {
    case "userSpeech":
      // Speech heard while a response runs counts for the next one only if that response is interrupted.
      return s.heard ? s : { ...s, heard: true };
    case "modelOutput":
      if (s.responding) return s;
      return s.heard ? { seq: s.seq + 1, heard: false, responding: true } : { ...s, responding: true };
    case "responseEnd":
      if (!s.responding) return s;
      // Half-duplex mutes the mic while the AI speaks, so speech heard during a completed response is a late chunk
      // of the sentence it answered, not a new utterance (I-151). Dropping it only means the phone taps the card. A
      // cut-in (bargeIn.ts) is new speech, but never on the review, and Live answers it with an interrupted response.
      return e.complete ? { ...s, heard: false, responding: false } : { ...s, responding: false };
  }
}
