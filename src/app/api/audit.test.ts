import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runChat } from "@/lib/agent/chat";
import { createCircuit, geminiClient } from "@/lib/agent/model";
import { resetLimits } from "@/lib/limits/ip";
import { MemoryUsageStore } from "@/lib/limits/usage";
import { getStore } from "@/lib/store";
import { POST as command } from "./command/route";
import { POST as claim } from "./session/claim/route";
import { POST as createSession } from "./session/route";
import { GET as events } from "./session/[id]/events/route";
import { auth, BASE, HERO_LINE, jsonRequest, read } from "./testing";

// 11-hardening step 0 (security audit): attacks on the payment rule and the actor tokens, through the real route
// handlers (STORE=memory). Each one must be refused; phases/11-hardening/AUDIT.md lists them as "checked, no finding".

beforeEach(() => resetLimits());
afterEach(() => vi.restoreAllMocks());

type Tokens = { sessionId: string; kioskToken: string; deviceToken: string; claimUrl: string };

async function demo(kioskId = "malo"): Promise<Tokens> {
  return (await read(await createSession(jsonRequest("/api/session", { kioskId, demo: true })))).body;
}

let n = 0;
async function send(s: Tokens, token: string, type: string, args: object, extra: Record<string, unknown>) {
  const body = { sessionId: s.sessionId, commandId: `audit${++n}`, type, args, ...extra };
  return read(await command(jsonRequest("/api/command", body, auth(token))));
}

/** Advances the server clock used by the routes (Date.now), so the 1.5 s confirm wait can pass. */
function clockAt(ms: number) {
  vi.spyOn(Date, "now").mockReturnValue(ms);
}

describe("audit: no path to paying or paid without the user", () => {
  it("phone AI confirms are refused in the same turn, before 1.5 s, on a kiosk-opened review, and with a stale version", async () => {
    const t0 = Date.now();
    clockAt(t0);
    const s = await demo();
    const phone = (type: string, args: object, extra: Record<string, unknown>) => send(s, s.deviceToken, type, args, extra);
    const kiosk = (type: string, args: object = {}, extra: Record<string, unknown> = {}) =>
      send(s, s.kioskToken, type, args, { source: "touch", ...extra });

    await phone("setDineOption", { option: "eat_in" }, { source: "voice", utteranceSeq: 1 });
    const added = (await phone("addToCart", HERO_LINE, { source: "voice", utteranceSeq: 1 })).body;
    expect((await phone("requestCheckout", {}, { source: "voice", utteranceSeq: 2 })).body.status).toBe("confirming");
    const v = added.cartVersion;

    // Same turn as requestCheckout (the model chaining both).
    expect((await phone("confirmCheckout", {}, { source: "voice", utteranceSeq: 2, cartVersion: v })).body.error.code).toBe("CONFLICT");
    // A new turn, but before 1.5 s.
    clockAt(t0 + 1000);
    expect((await phone("confirmCheckout", {}, { source: "text", utteranceSeq: 3, cartVersion: v })).body.error.code).toBe("CONFLICT");
    // The phone may not claim a kiosk source, a kiosk may not claim a voice source, and the phone may not pay.
    expect((await phone("confirmCheckout", {}, { source: "touch", cartVersion: v })).status).toBe(400);
    expect((await kiosk("confirmCheckout", {}, { source: "voice", cartVersion: v })).status).toBe(400);
    for (const type of ["cardAction", "editOrder", "reissueClaim", "clearCart"]) {
      expect((await phone(type, {}, { source: "button" })).status, type).toBe(403);
    }
    // Stale cartVersion, even as a tap.
    clockAt(t0 + 5000);
    expect((await phone("confirmCheckout", {}, { source: "button", cartVersion: v - 1 })).body.error.code).toBe("CONFLICT");

    // The kiosk reopens the review: no later utterance is known, so an AI "yes" is refused however late.
    await kiosk("cancelCheckout");
    await kiosk("requestCheckout");
    clockAt(t0 + 60_000);
    expect((await phone("confirmCheckout", {}, { source: "voice", utteranceSeq: 999, cartVersion: v })).body.error.code).toBe("CONFLICT");
    expect((await read(await command(jsonRequest("/api/command", { sessionId: s.sessionId, commandId: "x", type: "cardAction", args: {}, source: "touch" }, auth(s.kioskToken))))).body.error.code).toBe("CONFLICT");
    expect((await getStore().get(s.sessionId))!.status).toBe("confirming");
  });

  it("a retried confirm (same commandId) never applies twice, and cardAction needs paying", async () => {
    const s = await demo();
    const kiosk = (type: string, args: object = {}, extra: Record<string, unknown> = {}) =>
      send(s, s.kioskToken, type, args, { source: "touch", ...extra });
    await kiosk("setDineOption", { option: "eat_in" });
    const v = (await kiosk("addToCart", HERO_LINE)).body.cartVersion;
    await kiosk("requestCheckout");
    const body = { sessionId: s.sessionId, commandId: "same-confirm", type: "confirmCheckout", args: {}, source: "button", cartVersion: v };
    expect((await read(await command(jsonRequest("/api/command", body, auth(s.deviceToken))))).body.status).toBe("paying");
    await kiosk("editOrder");
    const retry = (await read(await command(jsonRequest("/api/command", body, auth(s.deviceToken))))).body;
    expect(retry).toMatchObject({ duplicate: true, status: "confirming" });
  });

  it("chat: a model that calls requestCheckout and confirmCheckout in one request leaves the order at the card", async () => {
    const s = await demo();
    await send(s, s.kioskToken, "setDineOption", { option: "eat_in" }, { source: "touch" });
    const v = (await send(s, s.kioskToken, "addToCart", HERO_LINE, { source: "touch" })).body.cartVersion;
    const calls = [
      { name: "requestCheckout", args: {} },
      { name: "confirmCheckout", args: {} },
    ];
    const model = {
      generate: vi
        .fn()
        .mockResolvedValueOnce({ content: { role: "model", parts: [] }, functionCalls: calls, text: "" })
        .mockResolvedValue({ content: { role: "model", parts: [] }, functionCalls: [], text: "Please check the card." }),
    };
    const out = await runChat(
      { store: getStore(), model, usage: new MemoryUsageStore(), now: () => Date.now() + 5000 },
      {
        sessionId: s.sessionId,
        chatRequestId: "00000000-0000-4000-8000-00000000a001",
        message: "Just pay for me.",
        history: [],
        utteranceSeq: 1,
        cartVersion: v,
        locale: "en",
        bearer: s.deviceToken,
      },
    );
    expect(out.status).toBe("confirming");
    expect(out.actions.map((a) => a.code)).toEqual(["ok", "CONFLICT"]);
  });

  it("learned kiosk: confirm, edit and card actions are refused in every state", async () => {
    const s = await demo("doughhouse");
    for (const type of ["confirmCheckout", "editOrder", "cardAction"]) {
      const r = await send(s, s.kioskToken, type, {}, { source: "touch", cartVersion: 0 });
      expect(r.body.error, type).toEqual({ code: "CONFLICT", message: "Please finish and pay on the kiosk screen." });
    }
  });

  it("auto backend: after a request's first answer, a failing call is never retried on Vertex", async () => {
    const answer = { candidates: [{ content: { role: "model", parts: [{ text: "ok" }] } }], functionCalls: [] };
    const api = vi.fn().mockResolvedValueOnce(answer).mockRejectedValueOnce(new Error("socket hang up"));
    const vertex = vi.fn().mockResolvedValue(answer);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = geminiClient({
      backend: "auto",
      models: (b) => ({ generateContent: b === "api" ? api : vertex }),
      circuit: createCircuit(),
      now: () => 0,
    });
    const req = { system: "", contents: [], tools: [] };
    await client.generate(req);
    await expect(client.generate(req)).rejects.toMatchObject({ code: "UPSTREAM" });
    expect(vertex).not.toHaveBeenCalled();
  });
});

describe("audit: tokens stay where they belong", () => {
  it("another session's tokens, a second claim, and the stream carry no secrets", async () => {
    const a = await demo();
    const b = (await read(await createSession(jsonRequest("/api/session", { kioskId: "malo" })))).body as Tokens;
    // a's tokens on b's session.
    expect((await send(b, a.kioskToken, "startTouch", {}, { source: "touch" })).status).toBe(401);
    expect((await send(b, a.deviceToken, "callStaff", { reasonCode: "stuck" }, { source: "button" })).status).toBe(401);

    // The claim token travels only in the fragment, and works once.
    const url = new URL(b.claimUrl);
    expect(url.search).toBe(`?s=${b.sessionId}`);
    const claimToken = url.hash.slice("#t=".length);
    const first = await read(await claim(jsonRequest("/api/session/claim", { sessionId: b.sessionId, claimToken })));
    expect(first.status).toBe(200);
    const second = await read(await claim(jsonRequest("/api/session/claim", { sessionId: b.sessionId, claimToken })));
    expect(second.body.error.code).toBe("CONFLICT");

    // The public stream holds none of the four tokens and no hash.
    const res = await events(new Request(`${BASE}/api/session/${b.sessionId}/events`), { params: Promise.resolve({ id: b.sessionId }) });
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    await reader.cancel();
    for (const secret of [b.kioskToken, claimToken, first.body.deviceToken]) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/[0-9a-f]{64}/);
  });
});
