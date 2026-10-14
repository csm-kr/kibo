import { describe, expect, it } from "vitest";
import { GLOSSARY, gloss, glossAll } from "./glossary";
import { LEARN_RUNS } from "./runs";

const HANGUL = /[ㄱ-ㆎ가-힣]/;

/** Every Korean string a /learn replay can show: tapped labels, written-down names and the learned skill. */
function shownLabels(): Set<string> {
  const out = new Set<string>();
  const add = (s: string | undefined) => {
    if (s && HANGUL.test(s)) out.add(s);
  };
  for (const { data } of LEARN_RUNS) {
    for (const t of data.turns) {
      for (const c of t.calls) {
        for (const s of c.args.steps ?? []) [s.label, s.name, s.text, s.within].forEach(add);
        c.args.names?.forEach(add);
        c.result.match(/^tapped (.*)$/)?.[1].split(" → ").forEach(add);
        add(c.result.match(/Refused: "([^"]+)"/)?.[1]);
        add(c.result.match(/"(?:label|name|text)":"([^"]+)"/)?.[1]);
      }
    }
    data.skill.categories.forEach(add);
    for (const item of data.skill.catalog) {
      add(item.name);
      add(item.category);
      for (const g of item.groups) {
        add(g.name);
        g.options.forEach(add);
      }
    }
  }
  return out;
}

describe("gloss", () => {
  it("adds the English after a Korean label", () => {
    expect(gloss("세트")).toBe("세트 (Set)");
    expect(gloss("L 라지 +1,000원")).toBe("L 라지 +1,000원 (L large +₩1,000)");
  });

  it("leaves a label with no Korean, or one the glossary lacks, as it is", () => {
    expect(gloss("Pay")).toBe("Pay");
    expect(gloss("+")).toBe("+");
    expect(gloss("없는 말")).toBe("없는 말");
  });

  it("glosses each label of a list", () => {
    expect(glossAll(["김밥", "a"])).toEqual(["김밥 (Kimbap)", "a"]);
  });

  it("covers every Korean label the recorded runs show (an English-only judge can follow every replay)", () => {
    const missing = [...shownLabels()].filter((l) => !GLOSSARY[l]);
    expect(missing).toEqual([]);
  });

  it("holds English only on the right side", () => {
    for (const [ko, en] of Object.entries(GLOSSARY)) {
      expect(HANGUL.test(ko), ko).toBe(true);
      expect(HANGUL.test(en), en).toBe(false);
    }
  });
});
