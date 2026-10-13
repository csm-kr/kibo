import { describe, expect, it, vi } from "vitest";
import { connectRelay, relayCloseOutcome, type SocketLike } from "./relayLink";

class FakeSocket implements SocketLike {
  static last: FakeSocket;
  sent: string[] = [];
  closed: { code?: number } | null = null;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.last = this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closed = { code };
  }
  // Test helpers.
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(m: object) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
  drop(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const HELLO = { sessionId: "s".repeat(22), deviceToken: "d".repeat(43), locale: "ko" as const };
const INFO = { model: "gemini-3.8-live", expiresAt: 123, voiceSeconds: 600 };

function open() {
  const cb = { onready: vi.fn(), onmessage: vi.fn(), onclose: vi.fn() };
  const link = connectRelay("wss://relay.example/ws", HELLO, cb, FakeSocket);
  return { cb, link, ws: FakeSocket.last };
}

describe("connectRelay", () => {
  it("sends the hello first, then resolves with the relay's voice time; Live messages follow unchanged", async () => {
    const { cb, link, ws } = open();
    expect(ws.url).toBe("wss://relay.example/ws");
    ws.open();
    expect(ws.sent.map((s) => JSON.parse(s))).toEqual([HELLO]);
    ws.receive({ relay: INFO });
    const live = await link;
    expect(cb.onready).toHaveBeenCalledWith(INFO);
    ws.receive({ setupComplete: {} });
    ws.receive({ serverContent: { turnComplete: true } });
    expect(cb.onmessage.mock.calls.map((c) => c[0])).toEqual([{ setupComplete: {} }, { serverContent: { turnComplete: true } }]);

    live.sendRealtimeInput({ audio: { data: "AAA=", mimeType: "audio/pcm;rate=16000" } });
    live.sendClientContent({ turns: [{ role: "user", parts: [{ text: "네" }] }], turnComplete: true });
    live.sendToolResponse({ functionResponses: [{ id: "f1", name: "addToCart", response: { ok: true } }] });
    expect(ws.sent.slice(1).map((s) => Object.keys(JSON.parse(s)))).toEqual([["realtimeInput"], ["clientContent"], ["toolResponse"]]);
    live.close();
    expect(ws.closed).toEqual({ code: 1000 });
  });

  it("messages before the relay's first one, binary data and broken JSON are ignored", async () => {
    const { cb, ws } = open();
    ws.open();
    ws.receive({ setupComplete: {} });
    ws.onmessage?.({ data: new ArrayBuffer(4) });
    ws.onmessage?.({ data: "{not json" });
    expect(cb.onmessage).not.toHaveBeenCalled();
    expect(cb.onready).not.toHaveBeenCalled();
  });

  it("a close before or after ready reports the code; the promise never resolves without ready", async () => {
    const { cb, link, ws } = open();
    ws.open();
    ws.drop(4429);
    expect(cb.onclose).toHaveBeenCalledWith(4429);
    const settled = vi.fn();
    void link.then(settled, settled);
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).not.toHaveBeenCalled();
  });

  it("a send on a socket that is not open is dropped", async () => {
    const { ws, link } = open();
    ws.open();
    ws.receive({ relay: INFO });
    const live = await link;
    ws.readyState = 3;
    live.sendRealtimeInput({ audio: { data: "AAA=", mimeType: "audio/pcm;rate=16000" } });
    expect(ws.sent).toHaveLength(1);
  });
});

describe("relayCloseOutcome", () => {
  it("maps the relay's close codes to what the phone does", () => {
    expect(relayCloseOutcome(4000)).toBe("timeUp");
    expect(relayCloseOutcome(4429)).toBe("RATE_LIMITED");
    expect(relayCloseOutcome(4502)).toBe("UPSTREAM");
    expect(relayCloseOutcome(4401)).toBe("UNAUTHORIZED");
    expect(relayCloseOutcome(4403)).toBe("FORBIDDEN");
    expect(relayCloseOutcome(4404)).toBe("NOT_FOUND");
    expect(relayCloseOutcome(4409)).toBe("CONFLICT");
    expect(relayCloseOutcome(4410)).toBe("GONE");
    expect(relayCloseOutcome(4400)).toBe("BAD_REQUEST");
    // A lost or dropped connection is worth another try, like a dropped Live socket on the direct path.
    for (const code of [1006, 1011, 1001, 4408, 4500]) expect(relayCloseOutcome(code)).toBe("retry");
  });
});
