import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import { ownWordsLanguage, replyLanguageLine, scriptLanguage } from "./ownWords";

const k = getKiosk("malo");
const drink = { templateId: "pick_option" as const, choices: [{ kind: "option" as const, id: "cola" }, { kind: "option" as const, id: "cider" }] };
const korean = [
  { role: "user" as const, text: "치즈버거 세트 하나 주세요." },
  { role: "model" as const, text: "Which drink would you like?" },
];

describe("scriptLanguage (16-judge-r3-fixes:0)", () => {
  it("decides by script only: Hangul, kana, Han without kana, Thai", () => {
    expect(scriptLanguage("치즈버거 세트 두 개")).toBe("ko");
    expect(scriptLanguage("Cider 주세요")).toBe("ko");
    expect(scriptLanguage("チーズバーガーを一つ")).toBe("ja");
    expect(scriptLanguage("飲み物")).toBe("ja");
    expect(scriptLanguage("我要一个汉堡")).toBe("zh");
    expect(scriptLanguage("ขอโคล่าหนึ่งแก้ว")).toBe("th");
  });

  it("Latin script, digits and empty text are left to the model", () => {
    expect(scriptLanguage("One cola, please.")).toBeNull();
    expect(scriptLanguage("Un coca, s'il vous plaît.")).toBeNull();
    expect(scriptLanguage("Cho tôi một cái burger.")).toBeNull();
    expect(scriptLanguage("2")).toBeNull();
    expect(scriptLanguage("")).toBeNull();
  });
});

describe("ownWordsLanguage", () => {
  it("the message itself when it is the user's own words", () => {
    expect(ownWordsLanguage(k, { message: "콜라 하나 주세요.", history: [], pendingChoice: null, locale: "en" })).toBe("ko");
    expect(ownWordsLanguage(k, { message: "One cola, please.", history: korean, pendingChoice: null, locale: "en" })).toBeNull();
  });

  it("a tap on a choice button sends its label: the user's earlier words decide", () => {
    expect(ownWordsLanguage(k, { message: "Cider", history: korean, pendingChoice: drink, locale: "en" })).toBe("ko");
    // The decline and staff buttons are labels too.
    const upsell = { templateId: "upsell" as const, choices: [{ kind: "item" as const, id: "soft_cone" }] };
    expect(ownWordsLanguage(k, { message: "No thanks", history: korean, pendingChoice: upsell, locale: "en" })).toBe("ko");
    expect(ownWordsLanguage(k, { message: "Call staff", history: korean, pendingChoice: { ...drink, choices: [{ kind: "staff", id: "staff" }] }, locale: "en" })).toBe("ko");
    // A label in an AI-only language, as the phone shows it with the picker on Japanese.
    const yesNo = { templateId: "yes_no" as const, choices: [{ kind: "yesno" as const, id: "yes" }, { kind: "yesno" as const, id: "no" }] };
    expect(ownWordsLanguage(k, { message: "はい", history: korean, pendingChoice: yesNo, locale: "en" })).toBe("ko");
  });

  it("an earlier tap is skipped too, so two taps in a row keep the language of the words before them", () => {
    const history = [...korean, { role: "user" as const, text: "Cider" }, { role: "model" as const, text: "Added." }];
    const upsell = { templateId: "upsell" as const, choices: [{ kind: "item" as const, id: "soft_cone" }] };
    expect(ownWordsLanguage(k, { message: "No thanks", history, pendingChoice: upsell, locale: "en" })).toBe("ko");
  });

  it("a tap with no words of the user before it is left to the model", () => {
    expect(ownWordsLanguage(k, { message: "Cider", history: [], pendingChoice: drink, locale: "en" })).toBeNull();
  });
});

describe("replyLanguageLine", () => {
  it("only when the user's own words differ from the AI language", () => {
    expect(replyLanguageLine("ko", "en")).toBe("Reply language: Korean (the user's own words are in Korean).");
    expect(replyLanguageLine("ko", "ja")).toBe("Reply language: Korean (the user's own words are in Korean).");
    expect(replyLanguageLine("ja", "ja")).toBeNull();
    expect(replyLanguageLine(null, "en")).toBeNull();
  });
});
