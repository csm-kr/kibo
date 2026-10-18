import { describe, expect, it } from "vitest";
import { initialTurns, turnEvents, turnsReducer, type LiveMessage, type TurnState } from "./turns";
import { GREETING_NOTE, greeter, greetingKey } from "./greeting";

// Owner 10-17: when the microphone turns on and Live connects, the AI speaks first, one short line, then listens.
// The greeting is the phone's own text turn: it must never count as the user's words (utteranceSeq) and never lead
// to a tool call.

const HELLO = "Hi! What would you like? Just say it.";

function feed(s: TurnState, ...msgs: LiveMessage[]): TurnState {
  return msgs.flatMap(turnEvents).reduce(turnsReducer, s);
}

describe("greeter", () => {
  it("greets once per voice start, with a turn that ends, and never again on a reconnect", () => {
    const g = greeter();
    const turn = g.onConnected(HELLO, "connected");
    expect(turn).toEqual({ turns: [{ role: "user", parts: [{ text: `${GREETING_NOTE} ${HELLO}` }] }], turnComplete: true });
    expect(g.onConnected(HELLO, "connected")).toBeNull();
  });

  it("only before the review, and only while the conversation is empty (the phone passes no greeting then)", () => {
    for (const status of ["confirming", "paying", "paid", "expired"] as const) expect(greeter().onConnected(HELLO, status), status).toBeNull();
    expect(greeter().onConnected(HELLO, "ordering")).not.toBeNull();
    expect(greeter().onConnected(null, "connected")).toBeNull();
  });

  it("holds tool calls of the greeting's own response, until it ends or the user speaks", () => {
    const g = greeter();
    expect(g.holdsTools).toBe(false);
    g.onConnected(HELLO, "connected");
    expect(g.holdsTools).toBe(true);
    g.onMessage(turnEvents({ serverContent: { outputTranscription: { text: "Hi!" } } }));
    expect(g.holdsTools).toBe(true);
    g.onMessage(turnEvents({ serverContent: { turnComplete: true } }));
    expect(g.holdsTools).toBe(false);

    const heard = greeter();
    heard.onConnected(HELLO, "connected");
    heard.onMessage(turnEvents({ serverContent: { inputTranscription: { text: "치즈버거" } } }));
    expect(heard.holdsTools).toBe(false);
  });

  // Owner 10-18: the kiosk (K2) and the phone (P2) ask eat here or take out while the voice asked "what would you
  // like?". The greeting asks what both screens ask.
  it("asks the dine question while both screens ask it: a kiosk with dine options, before the first dine option", () => {
    expect(greetingKey("connected", true)).toBe("greetingDine");
    // ordering: the dine option is set, or the order went on without it (the kiosk shows the menu); tickets: no K2.
    expect(greetingKey("ordering", true)).toBe("greeting");
    expect(greetingKey("connected", false)).toBe("greeting");
  });

  it("is never a user utterance: the greeting's response leaves utteranceSeq as it was; the user's next words count", () => {
    // The phone sends the greeting as text, so no input transcription comes back for it; only the model's reply.
    let s = feed(initialTurns(4), { serverContent: { outputTranscription: { text: HELLO } } }, { serverContent: { turnComplete: true } });
    expect(s.seq).toBe(4);
    s = feed(s, { serverContent: { inputTranscription: { text: "One cheeseburger set" } } }, { toolCall: { functionCalls: [{ name: "addToCart" }] } });
    expect(s.seq).toBe(5);
  });
});
