import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import { ApiError, type CommandReply } from "@/lib/client/api";
import type { AgentAction } from "@/lib/agent/actions";
import type { Session } from "@/types/session";
import { runToolCalls, type ToolContext, type VoiceCommand } from "./toolRunner";

const kiosk = getKiosk("malo");
const LINE = { lineId: "a1b2c3d4e5f60718", itemId: "cheese_burger", variant: "set" as const, qty: 1, selections: {}, unitPrice: 7200 };
const REPLY: CommandReply = { status: "ordering", cart: [LINE], total: 7200, cartVersion: 4 };

function ctx(over: Partial<ToolContext> = {}): ToolContext & { sent: VoiceCommand[] } {
  const sent: VoiceCommand[] = [];
  return {
    liveSessionId: "live-uuid",
    utteranceSeq: 3,
    cartVersion: () => 9,
    kiosk,
    locale: "en",
    send: vi.fn(async (cmd: VoiceCommand) => {
      sent.push(cmd);
      return REPLY;
    }),
    sent,
    ...over,
  };
}

describe("runToolCalls", () => {
  it("sends each call as a voice command with <liveSessionId>:<callId> and the current utteranceSeq", async () => {
    const c = ctx();
    const out = await runToolCalls([{ id: "fc_1", name: "addToCart", args: { itemId: "cheese_burger", variant: "set" } }], c);
    expect(c.sent).toEqual([
      {
        commandId: "live-uuid:fc_1",
        type: "addToCart",
        args: { itemId: "cheese_burger", variant: "set" },
        source: "voice",
        utteranceSeq: 3,
      },
    ]);
    expect(out).toEqual([
      {
        id: "fc_1",
        name: "addToCart",
        response: {
          ok: true,
          status: "ordering",
          total: 7200,
          cart: [{ lineId: LINE.lineId, name: "Cheeseburger", variant: "set", options: [], qty: 1, unitPrice: 7200 }],
        },
      },
    ]);
  });

  it("sends the cartVersion shown on the phone with confirmCheckout only", async () => {
    const c = ctx();
    await runToolCalls(
      [
        { id: "a", name: "requestCheckout", args: {} },
        { id: "b", name: "confirmCheckout", args: {} },
      ],
      c,
    );
    expect(c.sent[0]).not.toHaveProperty("cartVersion");
    expect(c.sent[1]).toMatchObject({ commandId: "live-uuid:b", type: "confirmCheckout", cartVersion: 9, utteranceSeq: 3 });
  });

  it("runs calls one after another, in order", async () => {
    const order: string[] = [];
    let release!: () => void;
    const first = new Promise<void>((r) => (release = r));
    const c = ctx({
      send: async (cmd) => {
        order.push(`start ${cmd.commandId}`);
        if (cmd.commandId.endsWith(":1")) await first;
        order.push(`end ${cmd.commandId}`);
        return REPLY;
      },
    });
    const run = runToolCalls(
      [
        { id: "1", name: "undoLastChange", args: {} },
        { id: "2", name: "undoLastChange", args: {} },
      ],
      c,
    );
    await Promise.resolve();
    release();
    await run;
    expect(order).toEqual(["start live-uuid:1", "end live-uuid:1", "start live-uuid:2", "end live-uuid:2"]);
  });

  it("returns a server refusal as the tool result, with choices named from menu data", async () => {
    const c = ctx({
      send: async () => {
        throw new ApiError("NEEDS_CHOICE", "Please choose a drink.", {
          templateId: "pick_option",
          groupId: "drink",
          choices: [{ kind: "option", id: "cola" }],
        });
      },
    });
    const [res] = await runToolCalls([{ id: "x", name: "addToCart", args: { itemId: "cheese_burger", variant: "set" } }], c);
    expect(res).toEqual({
      id: "x",
      name: "addToCart",
      response: {
        ok: false,
        code: "NEEDS_CHOICE",
        message: "Please choose a drink.",
        templateId: "pick_option",
        choices: [{ kind: "option", id: "cola", name: expect.any(String) }],
      },
    });
  });

  it("answers an unknown tool or bad arguments without calling the server", async () => {
    const c = ctx();
    const out = await runToolCalls(
      [
        { id: "u", name: "payNow", args: {} },
        { id: "b", name: "addToCart", args: { itemId: 5 } },
      ],
      c,
    );
    expect(c.send).not.toHaveBeenCalled();
    expect(out.map((r) => (r.response as { code: string }).code)).toEqual(["BAD_REQUEST", "BAD_REQUEST"]);
  });

  it("turns a network failure into a result the model can read, and keeps going", async () => {
    let n = 0;
    const c = ctx({
      send: async () => {
        if (n++ === 0) throw new ApiError("NETWORK", "Connection problem. Please try again.");
        return REPLY;
      },
    });
    const out = await runToolCalls(
      [
        { id: "1", name: "undoLastChange", args: {} },
        { id: "2", name: "undoLastChange", args: {} },
      ],
      c,
    );
    expect(out[0].response).toMatchObject({ ok: false, code: "NETWORK" });
    expect(out[1].response).toMatchObject({ ok: true });
  });

  it("answers an unexpected exception as INTERNAL without its message", async () => {
    const c = ctx({
      send: async () => {
        throw new TypeError("secret detail");
      },
    });
    const [res] = await runToolCalls([{ id: "1", name: "undoLastChange", args: {} }], c);
    expect(res.response).toEqual({ ok: false, code: "INTERNAL", message: "Something went wrong. Please try again." });
  });

  it("reports each call to onAction with ids and codes only; a remove names its line from the phone's cart", async () => {
    const actions: AgentAction[] = [];
    let n = 0;
    const c = ctx({
      cart: () => [LINE],
      onAction: (a) => actions.push(a),
      send: async () => {
        if (n++ === 1) throw new ApiError("CONFLICT", "Please confirm on the card.");
        return { ...REPLY, cart: [] };
      },
    });
    await runToolCalls(
      [
        { id: "1", name: "removeFromCart", args: { lineId: LINE.lineId } },
        { id: "2", name: "confirmCheckout", args: {} },
        { id: "3", name: "payNow", args: { note: "free text" } },
      ],
      c,
    );
    expect(actions).toEqual([
      { tool: "removeFromCart", args: { lineId: LINE.lineId, itemId: "cheese_burger" }, code: "ok", ms: expect.any(Number) },
      { tool: "confirmCheckout", args: {}, code: "CONFLICT", ms: expect.any(Number) },
      { tool: "unknown", args: {}, code: "BAD_REQUEST", ms: expect.any(Number) },
    ]);
    expect(JSON.stringify(actions)).not.toMatch(/live-uuid|free text|Please confirm/);
  });
});

describe("runToolCalls on a learned kiosk (I-155)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  type View = Pick<Session, "pendingBridgeCommand" | "bridgeStatus">;
  const PENDING = { ...REPLY, pending: true } as CommandReply;
  const DINE_AND_ADD = [
    { id: "d", name: "setDineOption", args: { option: "eat_in" } },
    { id: "a", name: "addToCart", args: { itemId: "cheese_oven_spaghetti", variant: "single" } },
  ];
  const waiting = (commandId: string): View => ({
    pendingBridgeCommand: { commandId, type: "setDineOption", args: { option: "eat_in" }, source: "voice", at: 1 },
    bridgeStatus: null,
  });

  function learnedCtx(view: () => View) {
    const sent: string[] = [];
    const c = ctx({
      kiosk: getKiosk("doughhouse"),
      session: view,
      send: async (cmd) => {
        sent.push(cmd.commandId);
        return PENDING;
      },
    });
    return { c, sent };
  }

  it("waits until the session stream shows the replay done, then sends the next call", async () => {
    let view: View = { pendingBridgeCommand: null, bridgeStatus: null };
    const { c, sent } = learnedCtx(() => view);
    const run = runToolCalls(DINE_AND_ADD, c);

    // The stream has not caught up yet: an old snapshot without the pending change is not "done".
    await vi.advanceTimersByTimeAsync(200);
    expect(sent).toEqual(["live-uuid:d"]);
    view = waiting("live-uuid:d");
    await vi.advanceTimersByTimeAsync(400);
    expect(sent).toEqual(["live-uuid:d"]);
    view = { pendingBridgeCommand: null, bridgeStatus: { lastOk: true, at: 5 } };
    await vi.advanceTimersByTimeAsync(200);
    const out = await run;
    expect(sent).toEqual(["live-uuid:d", "live-uuid:a"]);
    expect(out.map((r) => (r.response as { ok: boolean }).ok)).toEqual([true, true]);
  });

  it("counts a new bridge report as done even when the stream never showed the pending change", async () => {
    let view: View = { pendingBridgeCommand: null, bridgeStatus: { lastOk: true, at: 1 } };
    const { c, sent } = learnedCtx(() => view);
    const run = runToolCalls(DINE_AND_ADD, c);
    await vi.advanceTimersByTimeAsync(400);
    expect(sent).toHaveLength(1);
    view = { pendingBridgeCommand: null, bridgeStatus: { lastOk: true, at: 9 } };
    await vi.advanceTimersByTimeAsync(200);
    await run;
    expect(sent).toHaveLength(2);
  });

  it("after 12 s answers the remaining calls with the kiosk-busy result without sending them", async () => {
    const { c, sent } = learnedCtx(() => waiting("live-uuid:d"));
    const run = runToolCalls([...DINE_AND_ADD, { id: "r", name: "requestCheckout", args: {} }], c);
    await vi.advanceTimersByTimeAsync(12_000);
    const out = await run;
    expect(sent).toEqual(["live-uuid:d"]);
    expect(out.slice(1).map((r) => r.response)).toEqual([
      { ok: false, code: "CONFLICT", message: "The kiosk is still working on your last request." },
      { ok: false, code: "CONFLICT", message: "The kiosk is still working on your last request." },
    ]);
  });
});
