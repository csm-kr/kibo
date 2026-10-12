import { describe, expect, it } from "vitest";
import { chatReducer, historyFor, initialChat, type ChatState } from "./chat";

function sendAndReply(state: ChatState, text: string, reply: string): ChatState {
  const sent = chatReducer(state, { type: "send", text });
  return chatReducer(sent, { type: "reply", text: reply });
}

describe("chatReducer", () => {
  it("send adds the user turn, raises utteranceSeq by one and sets busy", () => {
    const s = chatReducer(initialChat, { type: "send", text: "two cheeseburger sets" });
    expect(s.utteranceSeq).toBe(1);
    expect(s.busy).toBe(true);
    expect(s.messages).toEqual([{ id: 1, role: "user", text: "two cheeseburger sets" }]);
    expect(chatReducer(s, { type: "send", text: "again" }).utteranceSeq).toBe(2);
  });

  it("reply adds the model turn and clears busy", () => {
    const s = sendAndReply(initialChat, "hi", "Hello");
    expect(s.busy).toBe(false);
    expect(s.messages.map((m) => m.role)).toEqual(["user", "model"]);
    expect(s.messages[1].text).toBe("Hello");
  });

  it("notice adds a screen message without counting an utterance", () => {
    const sent = chatReducer(initialChat, { type: "send", text: "hi" });
    const s = chatReducer(sent, { type: "notice", text: "The connection is unstable." });
    expect(s.busy).toBe(false);
    expect(s.utteranceSeq).toBe(1);
    expect(s.messages[1]).toMatchObject({ role: "notice", text: "The connection is unstable." });
  });

  it("message ids stay unique", () => {
    let s = initialChat;
    for (let i = 0; i < 4; i++) s = sendAndReply(s, `q${i}`, `a${i}`);
    expect(new Set(s.messages.map((m) => m.id)).size).toBe(8);
  });

  it("reset clears the conversation but keeps counting utterances", () => {
    const s = chatReducer(sendAndReply(initialChat, "hi", "Hello"), { type: "reset" });
    expect(s.messages).toEqual([]);
    expect(s.busy).toBe(false);
    // The server compares utteranceSeq with the one recorded at requestCheckout, so it never goes back.
    expect(s.utteranceSeq).toBe(1);
  });
});

describe("chatReducer voice turns", () => {
  it("adds what voice heard and said without busy and without counting a typed message", () => {
    const heard = chatReducer(initialChat, { type: "voice", role: "user", text: "one cheeseburger set" });
    const said = chatReducer(heard, { type: "voice", role: "model", text: "Added." });
    expect(said.messages).toEqual([
      { id: 1, role: "user", text: "one cheeseburger set" },
      { id: 2, role: "model", text: "Added." },
    ]);
    expect(said.busy).toBe(false);
    expect(said.utteranceSeq).toBe(0);
  });

  it("leaves a typed request busy while voice turns arrive", () => {
    const sent = chatReducer(initialChat, { type: "send", text: "hi" });
    expect(chatReducer(sent, { type: "voice", role: "model", text: "Hello" }).busy).toBe(true);
  });

  it("voice turns go into the /api/chat history", () => {
    const s = chatReducer(chatReducer(initialChat, { type: "voice", role: "user", text: "a" }), { type: "voice", role: "model", text: "b" });
    expect(historyFor(s.messages)).toEqual([
      { role: "user", text: "a" },
      { role: "model", text: "b" },
    ]);
  });
});

describe("historyFor", () => {
  it("sends user and model text only, without notices", () => {
    let s = sendAndReply(initialChat, "hi", "Hello");
    s = chatReducer(s, { type: "notice", text: "oops" });
    expect(historyFor(s.messages)).toEqual([
      { role: "user", text: "hi" },
      { role: "model", text: "Hello" },
    ]);
  });

  it("cuts a long reply to the 1000 characters /api/chat accepts", () => {
    const s = sendAndReply(initialChat, "hi", "x".repeat(1500));
    expect(historyFor(s.messages)[1].text).toHaveLength(1000);
  });

  it("keeps the last 10 turns", () => {
    let s = initialChat;
    for (let i = 0; i < 8; i++) s = sendAndReply(s, `q${i}`, `a${i}`);
    const h = historyFor(s.messages);
    expect(h).toHaveLength(10);
    expect(h[0]).toEqual({ role: "user", text: "q3" });
    expect(h[9]).toEqual({ role: "model", text: "a7" });
  });
});
