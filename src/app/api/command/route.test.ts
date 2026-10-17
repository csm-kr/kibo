import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetLimits } from "@/lib/limits/ip";
import { POST as createSession } from "../session/route";
import { POST as claim } from "../session/claim/route";
import { auth, commandBody, HERO_LINE, jsonRequest, read } from "../testing";
import { POST } from "./route";

beforeEach(() => resetLimits());

async function claimed() {
  const created = await read(await createSession(jsonRequest("/api/session", { kioskId: "malo" })));
  const sessionId = created.body.sessionId as string;
  const claimToken = new URL(created.body.claimUrl).hash.slice(3);
  const { body } = await read(await claim(jsonRequest("/api/session/claim", { sessionId, claimToken })));
  return { sessionId, kioskToken: created.body.kioskToken as string, deviceToken: body.deviceToken as string };
}

describe("POST /api/command", () => {
  it("adds the hero line with the device token; a repeated commandId applies nothing", async () => {
    const s = await claimed();
    const cmd = commandBody(s.sessionId, "addToCart", HERO_LINE, { source: "voice" });
    const { status, body } = await read(await POST(jsonRequest("/api/command", cmd, auth(s.deviceToken))));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, status: "ordering", cartVersion: 1, total: 6900 });
    expect(body.cart).toEqual([
      expect.objectContaining({ itemId: "cheese_burger", variant: "set", qty: 1, unitPrice: 6900, selections: { side: ["fries_m"], drink: ["zero_cola"] } }),
    ]);
    expect(body.result.lineId).toBe(body.cart[0].lineId);

    const again = await read(await POST(jsonRequest("/api/command", cmd, auth(s.deviceToken))));
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ ok: true, duplicate: true, cartVersion: 1 });
    expect(again.body.cart).toHaveLength(1);
  });

  it("ignores any price or total in the request", async () => {
    const s = await claimed();
    const cmd = { ...commandBody(s.sessionId, "addToCart", { ...HERO_LINE, unitPrice: 1 }), total: 1 };
    expect((await POST(jsonRequest("/api/command", cmd, auth(s.deviceToken)))).status).toBe(400);
  });

  it("BAD_REQUEST: bad JSON, unknown type, body over 64 KB", async () => {
    const s = await claimed();
    const bodies = [
      "{nope",
      commandBody(s.sessionId, "payNow"),
      commandBody(s.sessionId, "addToCart", { ...HERO_LINE, itemId: "x".repeat(70 * 1024) }),
    ];
    for (const b of bodies) {
      const { status, body } = await read(await POST(jsonRequest("/api/command", b, auth(s.deviceToken))));
      expect(status).toBe(400);
      expect(body).toEqual({ ok: false, error: { code: "BAD_REQUEST", message: expect.any(String), ...(body.error.detail && { detail: expect.any(Object) }) } });
    }
  });

  // 10-17: two 400s from a real iPhone's voice left no trace on the server, and the model got only "could not be
  // understood", so it asked the user again instead of fixing its call.
  it("BAD_REQUEST names the field that failed and why, from the schema only", async () => {
    const s = await claimed();
    const burgers = ["cheese_burger", "bulgogi_burger", "double_cheese_burger", "spicy_chicken_burger", "shrimp_burger", "classic_burger", "bacon_cheese_burger"];
    const cases: [object, string, string][] = [
      [{ templateId: "pick_item", choices: burgers.map((id) => ({ kind: "item", id })) }, "args.choices", "at most 6 items"],
      [{ templateId: "pick_option", choices: [{ kind: "option", id: "Zero cola" }] }, "args.choices.0.id", "wrong format"],
      [{ templateId: "which_one", choices: [{ kind: "item", id: "cola" }] }, "args.templateId", "one of pick_item, pick_variant, pick_option, pick_dine, yes_no, alternatives, upsell, ask_staff"],
    ];
    for (const [args, field, reason] of cases) {
      const cmd = commandBody(s.sessionId, "offerChoices", args, { source: "voice", utteranceSeq: 1 });
      const { status, body } = await read(await POST(jsonRequest("/api/command", cmd, auth(s.deviceToken))));
      expect(status).toBe(400);
      expect(body.error).toEqual({ code: "BAD_REQUEST", message: "That request could not be understood.", detail: { field, reason } });
    }
    // A key the request made up is never echoed: record keys and unknown fields come from the browser.
    const odd = commandBody(s.sessionId, "addToCart", { ...HERO_LINE, selections: { "My Drink": ["cola"] } }, { source: "voice" });
    const { body } = await read(await POST(jsonRequest("/api/command", odd, auth(s.deviceToken))));
    expect(body.error.detail).toEqual({ field: "args.selections.*", reason: "invalid key" });
    const extra = commandBody(s.sessionId, "addToCart", { ...HERO_LINE, secretNote: "hi" }, { source: "voice" });
    const second = await read(await POST(jsonRequest("/api/command", extra, auth(s.deviceToken))));
    expect(second.body.error.detail).toEqual({ field: "args", reason: "unknown field" });
    expect(JSON.stringify(second.body)).not.toContain("secretNote");
  });

  it("logs every refused command by type, source, code, status and field; never its args, token or full session id", async () => {
    const s = await claimed();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const burgers = ["cheese_burger", "bulgogi_burger", "double_cheese_burger", "spicy_chicken_burger", "shrimp_burger", "classic_burger", "bacon_cheese_burger"];
      const offer = commandBody(s.sessionId, "offerChoices", { templateId: "pick_item", choices: burgers.map((id) => ({ kind: "item", id })) }, { source: "voice" });
      await POST(jsonRequest("/api/command", offer, auth(s.deviceToken)));
      const set = commandBody(s.sessionId, "addToCart", { itemId: "cheese_burger", variant: "set" }, { source: "voice" });
      await POST(jsonRequest("/api/command", set, auth(s.deviceToken)));
      await POST(jsonRequest("/api/command", commandBody(s.sessionId, "payNow", { card: "4111" }), auth(s.deviceToken)));
      await POST(jsonRequest("/api/command", "{nope", auth(s.deviceToken)));

      const lines = warn.mock.calls.map((c) => c.map(String).join(" "));
      const prefix = s.sessionId.slice(0, 6);
      expect(lines).toEqual([
        `command refused: offerChoices voice BAD_REQUEST 400 args.choices s=${prefix}`,
        `command refused: addToCart voice NEEDS_CHOICE 422 - s=${prefix}`,
        // A type the server does not know is model or browser text, so it is not logged.
        `command refused: unknown touch BAD_REQUEST 400 type s=${prefix}`,
        "command refused: unknown - BAD_REQUEST 400 - s=-",
      ]);
      for (const line of lines) {
        expect(line).not.toContain(s.sessionId);
        expect(line).not.toContain(s.deviceToken);
        for (const value of ["cheese_burger", "4111", "payNow"]) expect(line).not.toContain(value);
      }
    } finally {
      warn.mockRestore();
    }
  });

  it("UNAUTHORIZED without or with a wrong token", async () => {
    const s = await claimed();
    for (const headers of [{}, auth("x".repeat(43))]) {
      const { status, body } = await read(await POST(jsonRequest("/api/command", commandBody(s.sessionId, "addToCart", HERO_LINE), headers)));
      expect(status).toBe(401);
      expect(body.error.code).toBe("UNAUTHORIZED");
    }
  });

  it("FORBIDDEN: the phone cannot send the card action", async () => {
    const s = await claimed();
    const { status, body } = await read(await POST(jsonRequest("/api/command", commandBody(s.sessionId, "cardAction"), auth(s.deviceToken))));
    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("NOT_FOUND for an unknown session", async () => {
    const s = await claimed();
    const { status, body } = await read(await POST(jsonRequest("/api/command", commandBody("A".repeat(22), "startTouch"), auth(s.kioskToken))));
    expect(status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("BAD_REQUEST for a sessionId with characters outside base64url", async () => {
    const s = await claimed();
    for (const id of ["a/b", `${"A".repeat(20)}/b`]) {
      const { status, body } = await read(await POST(jsonRequest("/api/command", commandBody(id, "startTouch"), auth(s.kioskToken))));
      expect(status).toBe(400);
      expect(body.error.code).toBe("BAD_REQUEST");
    }
  });

  it("CONFLICT: checkout with an empty cart", async () => {
    const s = await claimed();
    await POST(jsonRequest("/api/command", commandBody(s.sessionId, "setDineOption", { option: "eat_in" }), auth(s.kioskToken)));
    const { status, body } = await read(await POST(jsonRequest("/api/command", commandBody(s.sessionId, "requestCheckout"), auth(s.kioskToken))));
    expect(status).toBe(409);
    expect(body.error.code).toBe("CONFLICT");
  });

  it("NEEDS_CHOICE lists the choices in detail", async () => {
    const s = await claimed();
    const cmd = commandBody(s.sessionId, "addToCart", { itemId: "cheese_burger", variant: "set" }, { source: "voice" });
    const { status, body } = await read(await POST(jsonRequest("/api/command", cmd, auth(s.deviceToken))));
    expect(status).toBe(422);
    expect(body.error).toMatchObject({ code: "NEEDS_CHOICE", detail: { templateId: "pick_option", groupId: "drink" } });
    expect(body.error.detail.choices).toContainEqual({ kind: "option", id: "zero_cola" });
  });

  it("reissueClaim returns a new claim URL with the token in the fragment", async () => {
    const s = await claimed();
    const req = jsonRequest("/api/command", commandBody(s.sessionId, "reissueClaim"), {
      ...auth(s.kioskToken),
      "x-forwarded-proto": "https",
      "x-forwarded-host": "kibo.example.app",
    });
    const { status, body } = await read(await POST(req));
    expect(status).toBe(200);
    const url = new URL(body.claimUrl);
    expect(`${url.origin}${url.pathname}${url.search}`).toBe(`https://kibo.example.app/assistant?s=${s.sessionId}`);
    expect(url.hash).toMatch(/^#t=[A-Za-z0-9_-]{43}$/);
    expect(body.pairCode).toMatch(/^\d{6}$/);
    // The old phone's token stops working.
    const old = await POST(jsonRequest("/api/command", commandBody(s.sessionId, "undoLastChange"), auth(s.deviceToken)));
    expect(old.status).toBe(401);
  });
});

// Phase 1 QA spot checks (phases/1-core/qa/REPORT.md): each forged request is refused with the documented code.
describe("POST /api/command security spot checks", () => {
  async function send(s: { sessionId: string }, token: string, type: string, args: object = {}, extra: Record<string, unknown> = {}) {
    return read(await POST(jsonRequest("/api/command", commandBody(s.sessionId, type, args, extra), auth(token))));
  }

  it("FORBIDDEN: a device token cannot send cardAction even while the session is paying", async () => {
    const s = await claimed();
    await send(s, s.kioskToken, "setDineOption", { option: "eat_in" });
    const added = await send(s, s.kioskToken, "addToCart", HERO_LINE);
    await send(s, s.kioskToken, "requestCheckout");
    const paying = await send(s, s.kioskToken, "confirmCheckout", {}, { cartVersion: added.body.cartVersion });
    expect(paying.body.status).toBe("paying");
    const { status, body } = await send(s, s.deviceToken, "cardAction");
    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("CONFLICT: confirmCheckout outside confirming, from the phone button and the kiosk", async () => {
    const s = await claimed();
    const added = await send(s, s.deviceToken, "addToCart", HERO_LINE, { source: "voice" });
    expect(added.body.status).toBe("ordering");
    const tries = [
      await send(s, s.deviceToken, "confirmCheckout", {}, { source: "button", cartVersion: added.body.cartVersion }),
      await send(s, s.kioskToken, "confirmCheckout", {}, { cartVersion: added.body.cartVersion }),
    ];
    for (const { status, body } of tries) {
      expect(status).toBe(409);
      expect(body.error.code).toBe("CONFLICT");
    }
  });

  it("BAD_REQUEST: an option id or group from another item", async () => {
    const s = await claimed();
    const lines = [
      { ...HERO_LINE, selections: { drink: ["sweet_chili"] } },
      { ...HERO_LINE, selections: { drink: ["zero_cola"], sauce: ["bbq"] } },
    ];
    for (const line of lines) {
      const { status, body } = await send(s, s.deviceToken, "addToCart", line, { source: "voice" });
      expect(status).toBe(400);
      expect(body.error.code).toBe("BAD_REQUEST");
    }
  });

  it("BAD_REQUEST: a 1,000-character id in any id field", async () => {
    const s = await claimed();
    const long = "a".repeat(1000);
    const bodies = [
      commandBody(long, "startTouch"),
      { ...commandBody(s.sessionId, "startTouch"), commandId: long },
      commandBody(s.sessionId, "addToCart", { ...HERO_LINE, itemId: long }),
      commandBody(s.sessionId, "removeFromCart", { lineId: long }),
    ];
    for (const b of bodies) {
      const { status, body } = await read(await POST(jsonRequest("/api/command", b, auth(s.kioskToken))));
      expect(status).toBe(400);
      expect(body.error.code).toBe("BAD_REQUEST");
    }
  });
});
