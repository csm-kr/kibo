import { describe, expect, it } from "vitest";
import { adoptVerdict, bystanderItemsAdded, frameActions, isRight, resolveChain, tokens, wilson, wordScore, yesAccepted } from "./scoring";

describe("tokens", () => {
  it("English: case, punctuation and digits as words", () => {
    expect(tokens("Two cheeseburger sets. One without pickles!", "en")).toEqual(["two", "cheeseburger", "sets", "one", "without", "pickles"]);
    expect(tokens("2 cheeseburger sets, 1 without pickles", "en")).toEqual(["two", "cheeseburger", "sets", "one", "without", "pickles"]);
    expect(tokens("I'll have 6 chicken nuggets", "en")).toEqual(["i'll", "have", "six", "chicken", "nuggets"]);
  });

  it("Korean: no spaces, one token per character, counted digits as native numbers", () => {
    expect(tokens("치즈버거 세트 두 개", "ko")).toEqual([..."치즈버거세트두개"]);
    expect(tokens("치즈버거 세트 2개 주세요.", "ko")).toEqual([..."치즈버거세트두개주세요"]);
    expect(tokens("치즈버거세트두개", "ko")).toEqual(tokens("치즈버거 세트 두 개", "ko"));
  });
});

describe("wordScore", () => {
  it("all customer words kept, nothing leaked", () => {
    const s = wordScore("Two cheeseburger sets, one without pickles.", "two cheeseburger sets one without pickles", ["a large cola please"], "en");
    expect(s).toMatchObject({ customerTotal: 6, kept: 6, bystanderTotal: 4, leaked: 0, neither: 0 });
  });

  it("a word both people said goes to the customer first, then the rest to the bystander", () => {
    // Both said "please"; the transcript has it twice: once for each.
    const s = wordScore("two sets please a large cola please", "two sets please", ["a large cola please"], "en");
    expect(s).toMatchObject({ kept: 3, leaked: 4, neither: 0 });
    // Only one "please" in the transcript: the customer's.
    const t = wordScore("two sets please a large cola", "two sets please", ["a large cola please"], "en");
    expect(t).toMatchObject({ kept: 3, leaked: 3, neither: 0 });
  });

  it("words neither person said count as neither", () => {
    const s = wordScore("two sets and a banana", "two sets", ["a cola"], "en");
    expect(s).toMatchObject({ kept: 2, leaked: 1, neither: 2 });
  });

  it("customer words kept in order (a reordered transcript keeps the longest common run)", () => {
    const s = wordScore("sets two", "two sets", [], "en");
    expect(s.kept).toBe(1);
    expect(s.neither).toBe(1);
  });

  it("several bystanders: leaked words are matched against all of them", () => {
    const s = wordScore("cola lemonade", "two sets", ["a cola", "one lemonade"], "en");
    expect(s).toMatchObject({ kept: 0, bystanderTotal: 4, leaked: 2, neither: 0 });
  });

  it("Korean, per character, shared characters to the customer first", () => {
    const s = wordScore("치즈버거 두 개 주세요 콜라 주세요", "치즈버거 두 개 주세요", ["콜라 주세요"], "ko");
    expect(s).toMatchObject({ customerTotal: 9, kept: 9, bystanderTotal: 5, leaked: 5, neither: 0 });
  });

  it("no customer (bystander alone): nothing to keep", () => {
    const s = wordScore("a large cola", "", ["a large cola please"], "en");
    expect(s).toMatchObject({ customerTotal: 0, kept: 0, leaked: 3 });
  });
});

describe("bystanderItemsAdded", () => {
  const hero = [
    { itemId: "cheese_burger", qty: 1 },
    { itemId: "cheese_burger", qty: 1 },
  ];
  it("the hero cart alone adds nothing", () => {
    expect(bystanderItemsAdded([{ name: "addToCart", args: { itemId: "cheese_burger", variant: "set" } }], hero)).toEqual([]);
  });
  it("a foreign line in the final cart counts", () => {
    expect(bystanderItemsAdded([], [...hero, { itemId: "cola", qty: 1 }])).toEqual(["cola"]);
  });
  it("an addToCart outside the hero cart counts even if it was removed later", () => {
    expect(bystanderItemsAdded([{ name: "addToCart", args: { itemId: "shrimp_burger" } }, { name: "removeFromCart", args: {} }], hero)).toEqual(["shrimp_burger"]);
  });
  it("more cheeseburgers than the hero order counts", () => {
    expect(bystanderItemsAdded([], [...hero, { itemId: "cheese_burger", qty: 1 }])).toEqual(["cheese_burger:qty3"]);
  });
});

describe("isRight (run.ts's definition)", () => {
  const cart = [
    { itemId: "cheese_burger", qty: 1 },
    { itemId: "cheese_burger", qty: 1 },
  ];
  const span = { userStartMs: 5000, userEndMs: 10000 };
  it("right: nothing before or during, a reaction within 5 s, two cheeseburgers and nothing else", () => {
    expect(isRight({ ...span, outputs: [12000], cart, latencyMs: 0 })).toEqual({ ok: true, reactionMs: 2000 });
  });
  it("wrong: the AI answered a bystander before the customer spoke", () => {
    expect(isRight({ ...span, outputs: [3000, 12000], cart, latencyMs: 0 }).ok).toBe(false);
  });
  it("wrong: no reaction within 5 s", () => {
    expect(isRight({ ...span, outputs: [15500], cart, latencyMs: 0 })).toEqual({ ok: false, reactionMs: 5500 });
  });
  it("wrong: a foreign item in the cart", () => {
    expect(isRight({ ...span, outputs: [12000], cart: [...cart, { itemId: "cola", qty: 1 }], latencyMs: 0 }).ok).toBe(false);
  });
  it("a candidate's latency: its audio arrives late, so a reaction inside the shifted span is not 'during'; the delay counts in the reaction", () => {
    expect(isRight({ ...span, outputs: [10200], cart, latencyMs: 400 })).toEqual({ ok: false, reactionMs: 200 });
    expect(isRight({ ...span, outputs: [11400], cart, latencyMs: 400 })).toEqual({ ok: true, reactionMs: 1400 });
  });
});

describe("frameActions", () => {
  it("no segments: every frame is sent", () => {
    expect(frameActions(200, null, 40)).toEqual(["send", "send", "send", "send", "send"]);
  });
  it("segments: send inside, end once at each close, nothing outside", () => {
    // frames at 0, 40, 80, ... 360 ms; open 80 to 160 and 280 to 320
    expect(frameActions(400, [[80, 160], [280, 320]], 40)).toEqual(["skip", "skip", "send", "send", "end", "skip", "skip", "send", "end", "skip"]);
  });
  it("a segment still open when the audio ends gets no end frame (the caller ends it after the last frame)", () => {
    expect(frameActions(120, [[40, 500]], 40)).toEqual(["skip", "send", "send"]);
  });
});

describe("adoptVerdict", () => {
  const good = { runs: 20, right: 18, withBystanderItems: 1 };
  it("passes at 18 of 20 right and 1 run with bystander items", () => {
    expect(adoptVerdict({ overlap0: good, aloneRight: 20, todayAloneRight: 20, addedDelayMs: 400, maxDelayMs: 500 }).verdict).toBe("pass");
  });
  it("fails on 17 right, on 2 runs with bystander items, on delay, or when alone gets worse", () => {
    expect(adoptVerdict({ overlap0: { ...good, right: 17 }, aloneRight: 20, todayAloneRight: 20, addedDelayMs: 0, maxDelayMs: 500 }).verdict).toBe("fail");
    expect(adoptVerdict({ overlap0: { ...good, withBystanderItems: 2 }, aloneRight: 20, todayAloneRight: 20, addedDelayMs: 0, maxDelayMs: 500 }).verdict).toBe("fail");
    expect(adoptVerdict({ overlap0: good, aloneRight: 20, todayAloneRight: 20, addedDelayMs: 600, maxDelayMs: 500 }).verdict).toBe("fail");
    expect(adoptVerdict({ overlap0: good, aloneRight: 18, todayAloneRight: 20, addedDelayMs: 0, maxDelayMs: 500 }).verdict).toBe("fail");
  });
  it("one run fewer than today alone is still no worse (the noise of 20 runs)", () => {
    expect(adoptVerdict({ overlap0: good, aloneRight: 19, todayAloneRight: 20, addedDelayMs: 0, maxDelayMs: 500 }).verdict).toBe("pass");
  });
  it("fewer than 20 runs is not evaluable, never a scaled pass", () => {
    expect(adoptVerdict({ overlap0: { runs: 6, right: 6, withBystanderItems: 0 }, aloneRight: 6, todayAloneRight: 6, addedDelayMs: 0, maxDelayMs: 500 }).verdict).toBe("not evaluable");
  });
  it("without today's alone result it is not evaluable", () => {
    expect(adoptVerdict({ overlap0: good, aloneRight: 20, todayAloneRight: null, addedDelayMs: 0, maxDelayMs: 500 }).verdict).toBe("not evaluable");
  });
});

describe("wilson", () => {
  it("95% interval of k of n", () => {
    const [lo, hi] = wilson(5, 6);
    expect(lo).toBeCloseTo(0.436, 2);
    expect(hi).toBeCloseTo(0.970, 2);
  });
  it("5 of 6 and 3 of 6 overlap: six runs cannot tell them apart", () => {
    expect(wilson(3, 6)[1]).toBeGreaterThan(wilson(5, 6)[0]);
  });
  it("edges and no runs", () => {
    expect(wilson(0, 20)[0]).toBe(0);
    expect(wilson(20, 20)[1]).toBe(1);
    expect(wilson(0, 0)).toEqual([0, 1]);
  });
});

describe("resolveChain", () => {
  const metas: Record<string, { latency_ms: number; input_from?: string; hasAudio: boolean }> = {
    l0: { latency_ms: 100, hasAudio: true },
    l1: { latency_ms: 50, input_from: "l0", hasAudio: false },
    l3: { latency_ms: 700, input_from: "l1", hasAudio: false },
  };
  const get = (c: string) => metas[c] ?? null;
  it("sums latency along the chain and takes the nearest audio up the chain", () => {
    expect(resolveChain("l3", get)).toEqual({ latencyMs: 850, audioFrom: "l0", chain: ["l3", "l1", "l0"] });
  });
  it("a candidate with its own audio uses it", () => {
    expect(resolveChain("l0", get)).toEqual({ latencyMs: 100, audioFrom: "l0", chain: ["l0"] });
  });
  it("no audio anywhere: the mix", () => {
    expect(resolveChain("x", (c) => (c === "x" ? { latency_ms: 0, hasAudio: false } : null))).toEqual({ latencyMs: 0, audioFrom: null, chain: ["x"] });
  });
  it("refuses a cycle and a missing link", () => {
    expect(() => resolveChain("a", (c) => ({ latency_ms: 0, input_from: c === "a" ? "b" : "a", hasAudio: false }))).toThrow(/cycle/);
    expect(() => resolveChain("a", (c) => (c === "a" ? { latency_ms: 0, input_from: "gone", hasAudio: false } : null))).toThrow(/missing/);
  });
});

describe("yesAccepted (run.ts review scenario)", () => {
  it("the bystander's yes was accepted when the order left the review for payment", () => {
    expect(yesAccepted("paying")).toBe(true);
    expect(yesAccepted("confirming")).toBe(false);
  });
});
