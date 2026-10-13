import { describe, expect, it } from "vitest";
import { initialTurns, noiseStep, raiseSeq, turnEvents, turnsReducer, type LiveMessage, type TurnState } from "./turns";

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
      { type: "responseEnd", complete: true },
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

  it("speech heard during a response does not give that response a new seq, so the model cannot chain inside one", () => {
    let s = feed(initialTurns(), heard("I'll pay"), call("requestCheckout"));
    // A late transcription chunk while the same response is still running.
    s = feed(s, heard("now"), call("confirmCheckout"));
    expect(s.seq).toBe(1);
  });

  // I-151: a late chunk of the checkout sentence stays "heard" after the response completes, so the next model output,
  // with no new speech at all, gets a new seq and an AI confirmCheckout in it passes the server's fresh-utterance rule.
  it("I-151: a late chunk of the sentence that opened the review is not a new utterance after the response completes", () => {
    let s = feed(initialTurns(), heard("That's all,"), call("requestCheckout"));
    expect(s.seq).toBe(1);
    s = feed(s, heard(" I'll pay."), said("Please check the card."), done);
    // Nothing more from the user; the model speaks again on its own.
    s = feed(s, call("confirmCheckout"));
    expect(s.seq).toBe(1);
  });

  it("counts speech after an interrupted response for the response that follows", () => {
    const s = feed(initialTurns(), heard("two burgers"), audio, { serverContent: { interrupted: true } }, heard("no, one"), audio);
    expect(s.seq).toBe(2);
  });

  it("starts from a given seq, so the counter never goes back", () => {
    expect(feed(initialTurns(7), heard("yes"), audio).seq).toBe(8);
  });
});

describe("raiseSeq (one counter for typed and spoken turns, I-079)", () => {
  it("lifts the voice counter to a seq the typed chat already used", () => {
    expect(raiseSeq(initialTurns(2), 5).seq).toBe(5);
  });

  it("never lowers it", () => {
    expect(raiseSeq(initialTurns(7), 5).seq).toBe(7);
  });

  it("the next spoken turn then counts past the typed one", () => {
    expect(feed(raiseSeq(initialTurns(2), 5), heard("yes"), said("Okay")).seq).toBe(6);
  });
});

describe("noiseStep (UX exception 'Noise')", () => {
  const miss = { heard: true, tools: false };

  it("suggests typing after two heard turns in a row that did nothing, then starts over", () => {
    const one = noiseStep(0, miss);
    expect(one).toEqual({ misses: 1, suggest: false });
    expect(noiseStep(one.misses, miss)).toEqual({ misses: 0, suggest: true });
  });

  it("a turn with a tool call resets the count", () => {
    expect(noiseStep(1, { heard: true, tools: true })).toEqual({ misses: 0, suggest: false });
  });

  it("a response to nothing the user said does not count", () => {
    expect(noiseStep(1, { heard: false, tools: false })).toEqual({ misses: 1, suggest: false });
  });
});
