import { describe, expect, it } from "vitest";
import { followSpeaker, heardLanguage } from "./heard";

// The phone's screens follow the language the user speaks or types (owner 10-18, I-404): an English order on a Korean
// iPhone showed "결제해주세요". Only clear evidence switches; anything short or mixed keeps the current language.

describe("heardLanguage: the language of one finished utterance of the user's own", () => {
  it.each([
    ["Bulgogi burger set please", "en"],
    ["One cheeseburger set with zero cola, for here.", "en"],
    ["2 cheeseburger sets please", "en"],
    ["Can I get a large fries and a cider", "en"],
    ["Two adult tickets to City Center on the express, please.", "en"],
    ["One 불고기버거 set please", "en"],
  ])("English with English words: %s", (text, lang) => {
    expect(heardLanguage(text)).toBe(lang);
  });

  it.each([
    ["불고기버거 세트 주세요"],
    ["치즈버거 세트 하나, 감자튀김은 큰 걸로 주세요"],
    ["콜라주세요"],
    ["Cheeseburger 세트 하나 주세요"],
    ["제로콜라로 바꿔 주세요."],
  ])("Korean: %s", (text) => {
    expect(heardLanguage(text)).toBe("ko");
  });

  it.each([
    ["チーズバーガーセットを一つください。飲み物はゼロコーラで。", "ja"],
    ["シティセンターまで大人二枚お願いします", "ja"],
    ["我要一个芝士汉堡套餐", "zh"],
    ["两张去市中心的票", "zh"],
    ["ขอเบอร์เกอร์ชีสหนึ่งชุด", "th"],
    ["Cho tôi một phần gà rán và một ly nước", "vi"],
  ])("by script or Vietnamese-only letters: %s", (text, lang) => {
    expect(heardLanguage(text)).toBe(lang);
  });

  it.each([
    ["cola"],
    ["Cheeseburger"],
    ["yes"],
    ["ok"],
    ["yes please"],
    ["I'll pay"],
    ["네"],
    ["콜라"],
    ["불고기버거"],
    ["오케이"],
    ["はい"],
    ["コーラ"],
    ["ใช่"],
    ["直通列車"],
    ["   "],
    ["3"],
  ])("short: a word, a name or a yes is no evidence: %s", (text) => {
    expect(heardLanguage(text)).toBeNull();
  });

  it.each([
    ["Quiero una hamburguesa"],
    ["Quiero una hamburguesa with cheese, por favor"],
    ["Je voudrais un burger avec des frites"],
    ["Saya mau satu burger dan cola"],
    ["Una hamburguesa con queso, por favor"],
    ["Un café crème please"],
    ["Cheeseburger set 하나"],
  ])("Latin without clear English, or mixed scripts: %s", (text) => {
    expect(heardLanguage(text)).toBeNull();
  });
});

describe("followSpeaker: the language to switch to after the user's own words, or null to keep", () => {
  it("switches between Korean and English both ways", () => {
    expect(followSpeaker("ko", "Bulgogi burger set please")).toBe("en");
    expect(followSpeaker("en", "불고기버거 세트 주세요")).toBe("ko");
  });

  it("keeps the language when the words are already in it, or say nothing clear", () => {
    expect(followSpeaker("en", "Bulgogi burger set please")).toBeNull();
    expect(followSpeaker("ko", "불고기버거 세트 주세요")).toBeNull();
    expect(followSpeaker("ko", "cola")).toBeNull();
    expect(followSpeaker("en", "네")).toBeNull();
  });

  it("switches to Japanese, Chinese or Thai when their script is heard", () => {
    expect(followSpeaker("ko", "チーズバーガーを一つください")).toBe("ja");
    expect(followSpeaker("en", "我要一个芝士汉堡")).toBe("zh");
    expect(followSpeaker("zh", "チーズバーガーを一つください")).toBe("ja");
    expect(followSpeaker("ja", "Two cheeseburger sets please")).toBe("en");
    expect(followSpeaker("th", "불고기버거 세트 주세요")).toBe("ko");
  });

  it("never takes Japanese words written in Han only for Chinese", () => {
    expect(followSpeaker("ja", "我要一个芝士汉堡")).toBeNull();
  });

  it("never switches a Latin AI language the user chose to English, nor English to another Latin language", () => {
    expect(followSpeaker("es", "Quiero una hamburguesa")).toBeNull();
    expect(followSpeaker("es", "One cheeseburger set please")).toBeNull();
    expect(followSpeaker("fr", "Two cheeseburgers with fries please")).toBeNull();
    expect(followSpeaker("vi", "One cola please")).toBeNull();
    expect(followSpeaker("id", "I want one cheeseburger")).toBeNull();
    expect(followSpeaker("en", "Cho tôi một phần gà rán và một ly nước")).toBeNull();
  });

  it("does take a Latin language away from a non-Latin one", () => {
    expect(followSpeaker("ko", "Cho tôi một phần gà rán và một ly nước")).toBe("vi");
    expect(followSpeaker("es", "불고기버거 세트 주세요")).toBe("ko");
  });
});
