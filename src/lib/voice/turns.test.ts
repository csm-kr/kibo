import { describe, expect, it } from "vitest";
import { initialTurns, turnEvents, turnsReducer, type LiveMessage, type TurnState } from "./turns";

function feed(state: TurnState, ...messages: LiveMessage[]): TurnState {
  return messages.flatMap(turnEvents).reduce(turnsReducer, state);
}

const heard = (text: string): LiveMessage => ({ serverContent: { inputTranscription: { text } } });
const audio: LiveMessage = { serverContent: { modelTurn: { parts: [{ inlineData: { data: "AAAA", mimeType: "audio/pcm;rate=24000" } }] } } };
const said = (text: string): LiveMessage => ({ serverContent: { outputTranscription: { text } } });
const call = (name: string): LiveMessage => ({ toolCall: { functionCalls: [{ id: name, name, args: {} }] } });
const done: LiveMessage = { serverContent: { turnComplete: true } };

describe("turnEvents", () => {
  it("reads speech, output and the end of a response from one message, in that order", () => {
    expect(turnEvents({ serverContent: { inputTranscription: { text: "hi" }, outputTranscription: { text: "Hello" }, turnComplete: true } })).toEqual([
      { type: "userSpeech" },
      { type: "modelOutput" },
      { type: "responseEnd" },
    ]);
  });

  it("ignores empty transcriptions, empty model turns and setup messages", () => {
    expect(turnEvents(heard("  "))).toEqual([]);
    expect(turnEvents({ serverContent: { modelTurn: { parts: [] } } })).toEqual([]);
    expect(turnEvents({ setupComplete: {} })).toEqual([]);
    expect(turnEvents({ toolCall: { functionCalls: [] } })).toEqual([]);
  });

  it("counts interrupted as the end of a response", () => {
    expect(turnEvents({ serverContent: { interrupted: true } })).toEqual([{ type: "responseEnd" }]);
  });
});

describe("turnsReducer (utteranceSeq)", () => {
  it("gives requestCheckout and confirmCheckout in one response the same seq", () => {
    let s = feed(initialTurns(), heard("I'll pay"), call("requestCheckout"));
    expect(s.seq).toBe(1);
    s = feed(s, audio, call("confirmCheckout"));
    expect(s.seq).toBe(1);
  });

  it("raises the seq once for a new spoken yes", () => {
    let s = feed(initialTurns(), heard("I'll pay"), call("requestCheckout"), said("Here is your order."), done);
    expect(s.seq).toBe(1);
    s = feed(s, heard("Yes,"), heard(" pay now"), call("confirmCheckout"), audio, done);
    expect(s.seq).toBe(2);
  });

  it("does not raise the seq for output with no user speech before it", () => {
    expect(feed(initialTurns(), audio, done, audio, done).seq).toBe(0);
  });

  it("holds speech heard during a response for the next response, so the model cannot chain inside one", () => {
    let s = feed(initialTurns(), heard("I'll pay"), call("requestCheckout"));
    // A late transcription chunk while the same response is still running.
    s = feed(s, heard("now"), call("confirmCheckout"));
    expect(s.seq).toBe(1);
    s = feed(s, done, audio);
    expect(s.seq).toBe(2);
  });

  it("counts speech after an interrupted response for the response that follows", () => {
    const s = feed(initialTurns(), heard("two burgers"), audio, { serverContent: { interrupted: true } }, heard("no, one"), audio);
    expect(s.seq).toBe(2);
  });

  it("starts from a given seq, so the counter never goes back", () => {
    expect(feed(initialTurns(7), heard("yes"), audio).seq).toBe(8);
  });
});
