import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandError } from "@/lib/commands/errors";
import { MemoryUsageStore, type UsageStore } from "@/lib/limits/usage";
import { claimSession, createSession, runCommand } from "@/lib/session/service";
import { MemoryStore } from "@/lib/store/memory";
import { runChat, type ChatInput } from "./chat";
import type { ModelClient, ModelTurn } from "./model";

/** 2026-10-13 12:00 KST */
const T0 = Date.UTC(2026, 9, 13, 3, 0);

type Call = { name: string; args?: unknown };

/** A fake model that answers each generate() with the next scripted turn (the last one repeats). */
function script(...turns: (Call[] | string)[]) {
  const requests: { system: string; contents: ModelTurn[] }[] = [];
  const model: ModelClient = {
    async generate(req) {
      const turn = turns[Math.min(requests.length, turns.length - 1)];
      requests.push(structuredClone({ system: req.system, contents: req.contents }));
      if (typeof turn === "string") return { content: { role: "model", parts: [{ text: turn }] }, functionCalls: [], text: turn };
      const calls = turn.map((c, i) => ({ id: `fc${requests.length}_${i}`, name: c.name, args: c.args ?? {} }));
      return { content: { role: "model", parts: calls.map((c) => ({ functionCall: c, thoughtSignature: "sig" })) }, functionCalls: calls, text: "" };
    },
  };
  return { model, requests };
}

const HERO: Call[] = [
  {
    name: "addToCart",
    args: { itemId: "cheese_burger", variant: "set", options: [{ groupId: "drink", optionIds: ["zero_cola"] }, { groupId: "ingredients", optionIds: ["no_pickles"] }] },
  },
  { name: "addToCart", args: { itemId: "cheese_burger", variant: "set", options: [{ groupId: "drink", optionIds: ["cider"] }] } },
];

let store: MemoryStore;
let usage: UsageStore;
let now: number;
let rid = 0;

beforeEach(() => {
  store = new MemoryStore();
  usage = new MemoryUsageStore();
  now = T0;
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const deps = (model: ModelClient) => ({ store, model, usage, now: () => now });

async function demo() {
  const r = await createSession(store, { kioskId: "malo", demo: true }, T0);
  return { sessionId: r.sessionId, deviceToken: r.deviceToken!, kioskToken: r.kioskToken };
}

function input(s: { sessionId: string; deviceToken: string }, extra: Partial<ChatInput> = {}): ChatInput {
  return {
    sessionId: s.sessionId,
    chatRequestId: `00000000-0000-4000-8000-${String(++rid).padStart(12, "0")}`,
    message: "Two cheeseburger sets",
    history: [],
    utteranceSeq: 1,
    locale: "en",
    bearer: s.deviceToken,
    ...extra,
  };
}

async function errorOf(p: Promise<unknown>): Promise<CommandError> {
  const e = await p.catch((x) => x);
  if (!(e instanceof CommandError)) throw new Error("expected a CommandError");
  return e;
}

describe("runChat", () => {
  it("hero: two addToCart calls, then text; history first, model content kept, call ids answered", async () => {
    const s = await demo();
    const { model, requests } = script(HERO, "Added two cheeseburger sets.");
    const req = input(s, { history: [{ role: "user", text: "Hello" }, { role: "model", text: "Hi! What would you like?" }] });
    const out = await runChat(deps(model), req);

    expect(out.reply).toBe("Added two cheeseburger sets.");
    expect(out).toMatchObject({ status: "ordering", cartVersion: 2, total: 13800 });
    expect(out.cart.map((l) => l.selections.drink)).toEqual([["zero_cola"], ["cider"]]);
    const session = await store.get(s.sessionId);
    expect(session?.recentCommandIds).toEqual([`${req.chatRequestId}:0`, `${req.chatRequestId}:1`]);
    expect(session?.lastChange?.source).toBe("text");

    expect(requests[0].system).toContain("<menu_data>");
    // The order goes with the latest message, so the system text stays the same and can be cached (11-hardening:2).
    expect(requests[0].system).not.toMatch(/Status: |Cart: /);
    expect(requests[0].contents).toEqual([
      { role: "user", parts: [{ text: "Hello" }] },
      { role: "model", parts: [{ text: "Hi! What would you like?" }] },
      { role: "user", parts: [{ text: expect.stringMatching(/^<current_order>\nStatus: connected\n[\s\S]*Cart: empty\n<\/current_order>$/) }, { text: "Two cheeseburger sets" }] },
    ]);
    const [modelTurn, answers] = requests[1].contents.slice(-2);
    expect(modelTurn.parts).toEqual([
      expect.objectContaining({ thoughtSignature: "sig", functionCall: expect.objectContaining({ id: "fc1_0" }) }),
      expect.objectContaining({ thoughtSignature: "sig", functionCall: expect.objectContaining({ id: "fc1_1" }) }),
    ]);
    expect(answers.role).toBe("user");
    expect(answers.parts).toEqual([
      { functionResponse: { id: "fc1_0", name: "addToCart", response: expect.objectContaining({ ok: true }) } },
      { functionResponse: { id: "fc1_1", name: "addToCart", response: expect.objectContaining({ ok: true }) } },
    ]);
  });

  it("NEEDS_CHOICE goes back to the model with drink choices; offerChoices then sets pendingChoice", async () => {
    const s = await demo();
    const { model, requests } = script(
      [{ name: "addToCart", args: { itemId: "cheese_burger", variant: "set" } }],
      [{ name: "offerChoices", args: { templateId: "pick_option", choices: [{ kind: "option", id: "cola" }, { kind: "option", id: "cider" }] } }],
      "Which drink would you like?",
    );
    const out = await runChat(deps(model), input(s));
    expect(out.reply).toBe("Which drink would you like?");
    expect(out.cart).toEqual([]);
    const result = requests[1].contents.at(-1)!.parts[0] as { functionResponse: { response: Record<string, unknown> } };
    expect(result.functionResponse.response).toMatchObject({
      ok: false,
      code: "NEEDS_CHOICE",
      templateId: "pick_option",
      choices: expect.arrayContaining([{ kind: "option", id: "cola", name: "Cola" }]),
    });
    expect((await store.get(s.sessionId))?.pendingChoice).toEqual({
      templateId: "pick_option",
      choices: [{ kind: "option", id: "cola" }, { kind: "option", id: "cider" }],
    });
  });

  it("requestCheckout and confirmCheckout in one request: confirm is CONFLICT; a later utterance 1.6 s on pays", async () => {
    const s = await demo();
    await runChat(deps(script([{ name: "addToCart", args: { itemId: "cola" } }, { name: "setDineOption", args: { option: "eat_in" } }], "Done.").model), input(s));
    const version = (await store.get(s.sessionId))!.cartVersion;

    const both = script([{ name: "requestCheckout" }, { name: "confirmCheckout" }], "Please check the card.");
    const first = await runChat(deps(both.model), input(s, { utteranceSeq: 2, cartVersion: version }));
    expect(first.status).toBe("confirming");
    const answers = both.requests[1].contents.at(-1)!.parts as { functionResponse: { response: Record<string, unknown> } }[];
    expect(answers[1].functionResponse.response).toMatchObject({ ok: false, code: "CONFLICT" });

    now = T0 + 1600;
    const yes = await runChat(deps(script([{ name: "confirmCheckout" }], "Please pay at the kiosk.").model), input(s, { utteranceSeq: 3, cartVersion: version }));
    expect(yes.status).toBe("paying");
  });

  it("confirmCheckout without cartVersion fails with CONFLICT and asks for a tap on the card", async () => {
    const s = await demo();
    await runChat(deps(script([{ name: "addToCart", args: { itemId: "cola" } }, { name: "setDineOption", args: { option: "eat_in" } }], "ok").model), input(s));
    await runChat(deps(script([{ name: "requestCheckout" }], "ok").model), input(s, { utteranceSeq: 2 }));
    now = T0 + 5000;
    const run = script([{ name: "confirmCheckout" }], "Please tap the card.");
    const out = await runChat(deps(run.model), input(s, { utteranceSeq: 3 }));
    expect(out.status).toBe("confirming");
    const answer = run.requests[1].contents.at(-1)!.parts[0] as { functionResponse: { response: Record<string, unknown> } };
    expect(answer.functionResponse.response).toEqual({ ok: false, code: "CONFLICT", message: "Please confirm on the card." });
  });

  it("actions: one per call, in order, ids and codes only (ok, NEEDS_CHOICE, CONFLICT)", async () => {
    const s = await demo();
    const secret = "my phone number is 010";
    const { model } = script(
      [{ name: "addToCart", args: { itemId: "cheese_burger", variant: "set" } }],
      [
        { name: "addToCart", args: { itemId: "cola" } },
        { name: "offerChoices", args: { templateId: "pick_option", choices: [{ kind: "option", id: "cola" }] } },
        { name: "confirmCheckout" },
      ],
      `Done. ${secret}`,
    );
    const out = await runChat(deps(model), input(s, { message: secret }));
    expect(out.actions.map((a) => [a.tool, a.code])).toEqual([
      ["addToCart", "NEEDS_CHOICE"],
      ["addToCart", "ok"],
      ["offerChoices", "ok"],
      ["confirmCheckout", "CONFLICT"],
    ]);
    expect(out.actions[0].args).toEqual({ itemId: "cheese_burger", variant: "set" });
    for (const a of out.actions) expect(a.ms).toBeGreaterThanOrEqual(0);
    const text = JSON.stringify(out.actions);
    expect(text).not.toContain(s.sessionId);
    expect(text).not.toContain(s.deviceToken);
    expect(text).not.toMatch(/phone number|Done|Please confirm/);
  });

  it("actions name the line a remove took out, from the cart before the call", async () => {
    const s = await demo();
    const first = await runChat(deps(script([{ name: "addToCart", args: { itemId: "cola" } }], "ok").model), input(s));
    const lineId = first.cart[0].lineId;
    const out = await runChat(deps(script([{ name: "removeFromCart", args: { lineId } }], "Removed.").model), input(s));
    expect(out.actions).toEqual([{ tool: "removeFromCart", args: { lineId, itemId: "cola" }, code: "ok", ms: expect.any(Number) }]);
  });

  it("stops after 5 rounds; the 6th is never executed", async () => {
    const s = await demo();
    const { model, requests } = script([{ name: "addToCart", args: { itemId: "cola" } }]);
    // A question keeps the model answering after the first round (no template reply).
    const req = input(s, { message: "A cola?" });
    const out = await runChat(deps(model), req);
    expect(requests).toHaveLength(5);
    expect(out.reply).toBe("Sorry, could you say that again?");
    const ids = (await store.get(s.sessionId))!.recentCommandIds;
    expect(ids).toContain(`${req.chatRequestId}:4`);
    expect(ids).not.toContain(`${req.chatRequestId}:5`);
  });

  it("an unknown tool or bad arguments are results for the model, not errors", async () => {
    const s = await demo();
    const { model, requests } = script([{ name: "payNow" }, { name: "addToCart", args: { itemId: 5 } }], "Sorry.");
    const out = await runChat(deps(model), input(s));
    expect(out.reply).toBe("Sorry.");
    const answers = requests[1].contents.at(-1)!.parts as { functionResponse: { response: Record<string, unknown> } }[];
    expect(answers.map((a) => a.functionResponse.response.code)).toEqual(["BAD_REQUEST", "BAD_REQUEST"]);
  });

  it("retrying the same chatRequestId does not add twice", async () => {
    const s = await demo();
    const req = input(s);
    await runChat(deps(script(HERO, "Added.").model), req);
    const again = await runChat(deps(script(HERO, "Added.").model), req);
    expect(again.cart).toHaveLength(2);
    expect(again.cartVersion).toBe(2);
  });

  it("the kiosk token is FORBIDDEN and never reaches the model", async () => {
    const s = await demo();
    const { model, requests } = script("hi");
    expect((await errorOf(runChat(deps(model), input(s, { bearer: s.kioskToken })))).code).toBe("FORBIDDEN");
    expect(requests).toHaveLength(0);
  });

  it("the 61st message of a session is RATE_LIMITED (31st for demo)", async () => {
    const created = await createSession(store, { kioskId: "malo" }, T0);
    const { deviceToken } = await claimSession(store, { sessionId: created.sessionId, claimToken: created.claimToken }, T0);
    const s = { sessionId: created.sessionId, deviceToken };
    const { model, requests } = script("ok");
    for (let i = 0; i < 60; i++) await runChat(deps(model), input(s));
    const err = await errorOf(runChat(deps(model), input(s)));
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.message).toBe("You've reached the message limit for this order. Please use the buttons.");
    expect(requests).toHaveLength(60);

    const d = await demo();
    for (let i = 0; i < 30; i++) await runChat(deps(model), input(d));
    expect((await errorOf(runChat(deps(model), input(d)))).code).toBe("RATE_LIMITED");
  });

  it("the daily limit is RATE_LIMITED", async () => {
    const s = await demo();
    const bump = vi.fn().mockResolvedValue(false);
    const err = await errorOf(runChat({ ...deps(script("ok").model), usage: { bump, refund: vi.fn() } }, input(s)));
    expect(err.code).toBe("RATE_LIMITED");
    expect(bump).toHaveBeenCalledWith("2026-10-13", "chatMessages", 3000);
  });

  it("a model error passes through (429 → RATE_LIMITED)", async () => {
    const s = await demo();
    const model: ModelClient = { generate: () => Promise.reject(new CommandError("RATE_LIMITED", "Please try again in a moment.")) };
    const err = await errorOf(runChat(deps(model), input(s)));
    expect(err).toMatchObject({ code: "RATE_LIMITED", message: "Please try again in a moment." });
  });

  it("tools that all went through: the reply comes from the results, with one model call (14-final:5)", async () => {
    const s = await demo();
    const { model, requests } = script([{ name: "addToCart", args: { itemId: "cola" } }], "Model reply.");
    const out = await runChat(deps(model), input(s, { message: "One cola, please." }));
    expect(requests).toHaveLength(1);
    expect(out.reply).toMatch(/^Added 1 × Cola.*\. Total ₩1,800\.$/);
    expect(out.cart).toHaveLength(1);

    const ko = script([{ name: "removeFromCart", args: { lineId: out.cart[0].lineId } }], "Model reply.");
    const removed = await runChat(deps(ko.model), input(s, { message: "콜라 빼 주세요.", locale: "ko" }));
    expect(ko.requests).toHaveLength(1);
    expect(removed.reply).toBe("콜라 뺐어요. 모두 0원이에요.");
  });

  it("the model still writes the reply after a failure, a question, another language, its own text, or an upsell", async () => {
    const cases: { first: Call[] | string; extra?: Partial<ChatInput>; text?: string }[] = [
      { first: [{ name: "addToCart", args: { itemId: "cheese_burger", variant: "set" } }] },
      { first: [{ name: "addToCart", args: { itemId: "cola" } }], extra: { message: "One cola. Is it cold?" } },
      { first: [{ name: "addToCart", args: { itemId: "cola" } }], extra: { message: "One cola, please.", language: "ja" } },
      { first: [{ name: "addToCart", args: { itemId: "cola" } }], extra: { message: "Satu cola, ya." } },
      { first: [{ name: "addToCart", args: { itemId: "cola" } }], extra: { message: "One cola, please." }, text: "Sure!" },
      { first: [{ name: "addToCart", args: { itemId: "cheese_burger", variant: "single" } }], extra: { message: "One cheeseburger, please." } },
    ];
    for (const c of cases) {
      const s = await demo();
      const { model, requests } = script(c.first as Call[], "Model reply.");
      const withText: ModelClient = c.text
        ? { generate: async (req) => ({ ...(await model.generate(req)), ...(requests.length === 1 ? { text: c.text! } : {}) }) }
        : model;
      const out = await runChat(deps(withText), input(s, c.extra));
      expect(requests).toHaveLength(2);
      expect(out.reply).toBe("Model reply.");
    }
  });

  it("never logs the message, history or reply", async () => {
    const s = await demo();
    const logs = (["log", "info", "warn", "error"] as const).map((name) => vi.spyOn(console, name));
    const secret = "I have a peanut allergy";
    await runChat(deps(script(HERO, `Reply ${secret}`).model), input(s, { message: secret, history: [{ role: "user", text: secret }] }));
    const printed = JSON.stringify(logs.flatMap((l) => l.mock.calls));
    expect(printed).not.toContain("peanut");
    expect(printed).toContain("addToCart");
  });
});

describe("runChat on a learned kiosk (I-155)", () => {
  const DINE_AND_ADD: Call[] = [
    { name: "setDineOption", args: { option: "eat_in" } },
    { name: "addToCart", args: { itemId: "cheese_oven_spaghetti", variant: "single" } },
  ];

  async function learned() {
    const r = await createSession(store, { kioskId: "doughhouse", demo: true }, T0);
    return { sessionId: r.sessionId, deviceToken: r.deviceToken!, kioskToken: r.kioskToken };
  }

  /** What the in-page bridge sends once it has replayed the pending change on the kiosk page. */
  async function bridgeReports(s: { sessionId: string; kioskToken: string }) {
    const session = (await store.get(s.sessionId))!;
    const p = session.pendingBridgeCommand!;
    const kioskTotal = p.type === "addToCart" ? session.total + 6900 : session.total;
    const body = {
      sessionId: s.sessionId,
      commandId: `bridge-${++rid}`,
      type: "bridgeReport",
      args: { commandId: p.commandId, ok: true, kioskTotal, kioskLines: [] },
      source: "touch",
    };
    await runCommand(store, { body, bearer: s.kioskToken }, now);
  }

  it("waits for the bridge to replay the dine option before sending the add of the same response", async () => {
    const s = await learned();
    const { model } = script(DINE_AND_ADD, "Adding it now.");
    let sleeps = 0;
    const sleep = async (ms: number) => {
      now += ms;
      if (++sleeps === 2) await bridgeReports(s);
    };
    const out = await runChat({ ...deps(model), sleep }, input(s, { message: "One cheese oven spaghetti to eat here" }));

    expect(sleeps).toBe(2);
    expect(out.actions.map((a) => [a.tool, a.code, a.pending])).toEqual([
      ["setDineOption", "ok", true],
      ["addToCart", "ok", true],
    ]);
    const session = (await store.get(s.sessionId))!;
    expect(session.dineOption).toBe("eat_in");
    expect(session.pendingBridgeCommand).toMatchObject({ type: "addToCart" });
  });

  it("answers the rest of the response with the kiosk-busy result when the bridge does not report within 12 s", async () => {
    const s = await learned();
    const { model, requests } = script(DINE_AND_ADD, "The kiosk is still busy.");
    let sleeps = 0;
    const sleep = async (ms: number) => {
      now += ms;
      sleeps++;
    };
    const req = input(s);
    const out = await runChat({ ...deps(model), sleep }, req);

    expect(now - T0).toBe(12_000);
    expect(sleeps).toBe(60);
    expect(out.actions.map((a) => [a.tool, a.code])).toEqual([
      ["setDineOption", "ok"],
      ["addToCart", "CONFLICT"],
    ]);
    const answers = requests[1].contents.at(-1)!.parts as { functionResponse: { response: Record<string, unknown> } }[];
    expect(answers[1].functionResponse.response).toEqual({
      ok: false,
      code: "CONFLICT",
      message: "The kiosk is still working on your last request.",
    });
    // The add was never sent: the server saw only the dine option.
    const session = (await store.get(s.sessionId))!;
    expect(session.recentCommandIds).toEqual([`${req.chatRequestId}:0`]);
    expect(session.pendingBridgeCommand).toMatchObject({ type: "setDineOption" });
  });

  it("never waits on a direct kiosk", async () => {
    const s = await demo();
    const sleep = vi.fn();
    const out = await runChat({ ...deps(script(HERO, "Added.").model), sleep }, input(s));
    expect(out.cart).toHaveLength(2);
    expect(sleep).not.toHaveBeenCalled();
  });
});
