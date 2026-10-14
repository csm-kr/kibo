import { describe, expect, it, vi } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import { isForbiddenTarget, nearestWithin, planSteps, RecipeError, runPlan } from "./recipe";

const learned = getKiosk("doughhouse").learned!;
const forbidden = learned.forbiddenLabels;

/** A page of plain buttons, enough for labels, clicks and the settle wait; it records the order of taps and clicks. */
function fakePage(labels: string[], log: string[]) {
  const els = labels.map((text, i) => ({
    tagName: "BUTTON",
    onclick: null,
    parentElement: null,
    innerText: text,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ x: 10, y: 100 * i, width: 80, height: 40 }),
    click: vi.fn(() => log.push(`click ${text}`)),
  }));
  const doc = {
    defaultView: {
      getComputedStyle: () => ({ visibility: "visible", cursor: "pointer" }),
      requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
      MutationObserver: class {
        observe() {}
        disconnect() {}
      },
    },
    documentElement: {},
    body: { querySelectorAll: () => els },
    querySelectorAll: () => [],
    createTreeWalker: () => ({ nextNode: () => null }),
  } as unknown as Document;
  return { doc, els };
}

describe("runPlan reports each real click (the visible replay, 14-final:3)", () => {
  it("calls onTap with the target's label and box before each click it makes, and waits for it", async () => {
    const log: string[] = [];
    const { doc } = fakePage(["피자", "장바구니 담기"], log);
    const onTap = vi.fn(async (t: { label: string; x: number; y: number; w: number; h: number }) => {
      log.push(`tap ${t.label}`);
    });
    await runPlan(
      doc,
      [
        { op: "click", label: "피자" },
        // Not on this page: skipped, so it never shows as a tap.
        { op: "clickIfVisible", role: "radio", name: "라지" },
        { op: "click", label: "장바구니 담기" },
      ],
      { forbiddenLabels: forbidden, onTap },
    );
    expect(log).toEqual(["tap 피자", "click 피자", "tap 장바구니 담기", "click 장바구니 담기"]);
    expect(onTap.mock.calls.map(([t]) => t)).toEqual([
      { label: "피자", x: 10, y: 0, w: 80, h: 40 },
      { label: "장바구니 담기", x: 10, y: 100, w: 80, h: 40 },
    ]);
  });

  it("never reports a tap on a payment control it refuses", async () => {
    const log: string[] = [];
    const { doc, els } = fakePage(["결제하기"], log);
    const onTap = vi.fn();
    await expect(runPlan(doc, [{ op: "click", label: "결제하기" }], { forbiddenLabels: ["결제"], onTap })).rejects.toThrow(RecipeError);
    expect(onTap).not.toHaveBeenCalled();
    expect(els[0].click).not.toHaveBeenCalled();
  });
});

describe("planSteps", () => {
  it("expands the learned addToCart recipe into plain steps", () => {
    const plan = planSteps(
      learned.recipes.addToCart,
      { category: "피자", item: "페퍼로니", options: ["라지", "씬"], qtyMinus1: 2 },
      forbidden,
    );
    expect(plan).toEqual([
      { op: "click", label: "피자" },
      { op: "click", label: "페퍼로니" },
      { op: "clickIfVisible", role: "radio", name: "라지" },
      { op: "clickIfVisible", role: "checkbox", name: "라지" },
      { op: "clickIfVisible", role: "radio", name: "씬" },
      { op: "clickIfVisible", role: "checkbox", name: "씬" },
      { op: "click", label: "+" },
      { op: "click", label: "+" },
      { op: "click", label: "장바구니 담기" },
      { op: "clickIfVisible", label: "아니요, 괜찮아요" },
    ]);
  });

  it("repeats zero times and skips an empty forEach", () => {
    const plan = planSteps(learned.recipes.addToCart, { category: "사이드", item: "갈릭디핑소스", options: [], qtyMinus1: 0 }, forbidden);
    expect(plan.map((s) => s.label ?? s.name)).toEqual(["사이드", "갈릭디핑소스", "장바구니 담기", "아니요, 괜찮아요"]);
  });

  it("turns a clickNth index placeholder into a number", () => {
    expect(planSteps(learned.recipes.removeLine, { lineIndex: 1 }, forbidden)).toEqual([
      { op: "clickNth", label: "삭제", index: 1 },
    ]);
  });

  it("refuses a missing placeholder value instead of clicking '{item}'", () => {
    expect(() => planSteps(learned.recipes.addToCart, { category: "피자", options: [], qtyMinus1: 0 }, forbidden)).toThrow(RecipeError);
  });

  it("refuses a bad repeat count or line index", () => {
    expect(() => planSteps([{ op: "repeat", times: "{n}", steps: [{ op: "click", label: "+" }] }], { n: -1 }, forbidden)).toThrow(RecipeError);
    expect(() => planSteps([{ op: "repeat", times: "{n}", steps: [{ op: "click", label: "+" }] }], { n: "abc" }, forbidden)).toThrow(RecipeError);
    expect(() => planSteps([{ op: "clickNth", label: "삭제", index: "{i}" }], { i: 1.5 }, forbidden)).toThrow(RecipeError);
  });

  it("refuses a forEach over something that is not a list", () => {
    expect(() =>
      planSteps([{ op: "forEach", over: "options", as: "option", steps: [{ op: "click", label: "{option}" }] }], { options: "라지" }, forbidden),
    ).toThrow(RecipeError);
  });

  it("refuses any step aimed at a forbidden label, also when a variable fills it in", () => {
    expect(() => planSteps([{ op: "click", label: "주문하기" }], {}, forbidden)).toThrow(RecipeError);
    expect(() => planSteps([{ op: "click", label: "{item}" }], { item: "💳 신용/체크카드" }, forbidden)).toThrow(RecipeError);
    expect(() => planSteps([{ op: "clickIfVisible", role: "button", name: "{x}" }], { x: "결제하기" }, forbidden)).toThrow(RecipeError);
    expect(() => planSteps([{ op: "click", text: "카드 결제" }], {}, forbidden)).toThrow(RecipeError);
  });
});

describe("planSteps: chooseOptions and within (13-blind-kiosks:4)", () => {
  const add = [
    { op: "click" as const, label: "{item}" },
    { op: "chooseOptions" as const, steps: [{ op: "click" as const, label: "{option}" }] },
    { op: "click" as const, label: "담기" },
  ];

  it("runs each group's own select steps per chosen option, then the group's after steps", () => {
    const groups = [
      { options: ["카라멜"], after: [{ op: "click" as const, label: "다음" }] },
      { options: ["에스프레소 샷", "에스프레소 샷"], select: [{ op: "click" as const, label: "+", within: "{option}" }] },
      { options: [] },
    ];
    expect(planSteps(add, { item: "콤보", groups }, forbidden)).toEqual([
      { op: "click", label: "콤보" },
      { op: "click", label: "카라멜" },
      { op: "click", label: "다음" },
      { op: "click", label: "+", within: "에스프레소 샷" },
      { op: "click", label: "+", within: "에스프레소 샷" },
      { op: "click", label: "담기" },
    ]);
  });

  it("refuses chooseOptions without groups, and a forbidden label in a group's steps", () => {
    expect(() => planSteps(add, { item: "콤보" }, forbidden)).toThrow(RecipeError);
    const groups = [{ options: ["콜라"], after: [{ op: "click" as const, label: "주문하기" }] }];
    expect(() => planSteps(add, { item: "콤보", groups }, forbidden)).toThrow(RecipeError);
  });
});

describe("planSteps: chooseOptions groups and conditional groups (round 4, I-234)", () => {
  const click = (label: string) => ({ op: "click" as const, label });
  // A set offer after the add button: the size runs on the item screen, the set popup's groups after 담기.
  const recipe = [
    click("{item}"),
    { op: "chooseOptions" as const, steps: [click("{option}")] },
    click("담기"),
    { op: "chooseOptions" as const, groups: ["set", "side"], steps: [click("{option}")] },
  ];
  const groups = [
    { groupId: "size", options: ["라지"], optionIds: ["large"] },
    { groupId: "set", options: ["세트로"], optionIds: ["set_yes"], after: [click("다음")] },
    { groupId: "side", options: ["감자튀김"], optionIds: ["fries"], appliesWhen: { groupId: "set", optionId: "set_yes" }, after: [click("완료")] },
  ];

  it("runs named groups only where their chooseOptions stands, the rest at the one without groups", () => {
    expect(planSteps(recipe, { item: "버거", groups }, forbidden).map((s) => s.label)).toEqual([
      "버거", "라지", "담기", "세트로", "다음", "감자튀김", "완료",
    ]);
  });

  it("skips a conditional group the line did not use, with its after steps, when its condition was not chosen", () => {
    const single = [groups[0], { ...groups[1], options: ["단품"], optionIds: ["set_no"] }, { ...groups[2], options: [], optionIds: [] }];
    expect(planSteps(recipe, { item: "버거", groups: single }, forbidden).map((s) => s.label)).toEqual([
      "버거", "라지", "담기", "단품", "다음",
    ]);
  });

  it("keeps a conditional group's after steps when its condition was chosen, even with no pick, as the learner does", () => {
    const noSide = [groups[0], groups[1], { ...groups[2], options: [], optionIds: [] }];
    expect(planSteps(recipe, { item: "버거", groups: noSide }, forbidden).map((s) => s.label)).toEqual([
      "버거", "라지", "담기", "세트로", "다음", "완료",
    ]);
  });
});

describe("runPlan answers the skill's interrupts (round 3, I-194, I-234)", () => {
  /** Buttons that come and go with a timeout modal; `modalText` is what the page shows while the modal is up. */
  function modalPage(opts: { modalUp: () => boolean; hideWhileUp: string[]; log: string[]; onDismiss: () => void }) {
    const button = (text: string) => ({
      tagName: "BUTTON",
      onclick: null,
      parentElement: null,
      innerText: text,
      getAttribute: () => null,
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 80, height: 40 }),
      click: vi.fn(() => {
        opts.log.push(`click ${text}`);
        if (text === "계속 주문하기") opts.onDismiss();
      }),
    });
    const all = ["피자", "라지", "계속 주문하기"].map(button);
    const shown = () =>
      all.filter((b) => (b.innerText === "계속 주문하기" ? opts.modalUp() : !(opts.modalUp() && opts.hideWhileUp.includes(b.innerText))));
    const doc = {
      defaultView: {
        getComputedStyle: () => ({ visibility: "visible", cursor: "pointer" }),
        requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
        MutationObserver: class {
          observe() {}
          disconnect() {}
        },
      },
      documentElement: {},
      body: {
        querySelectorAll: () => shown(),
        get innerText() {
          return opts.modalUp() ? "계속 주문하시겠어요?\n계속 주문하기" : "피자\n라지";
        },
      },
      querySelectorAll: () => [],
      createTreeWalker: () => ({ nextNode: () => null }),
    } as unknown as Document;
    return doc;
  }
  const interrupts = [{ text: "계속 주문하시겠어요?", dismiss: { op: "click" as const, label: "계속 주문하기" } }];

  it("answers a modal on screen before the next step, and once more at the end", async () => {
    const log: string[] = [];
    let up = true;
    const doc = modalPage({ modalUp: () => up, hideWhileUp: [], log, onDismiss: () => (up = false) });
    const onTap = vi.fn();
    await runPlan(doc, [{ op: "click", label: "피자" }], { forbiddenLabels: forbidden, interrupts, onTap });
    expect(log).toEqual(["click 계속 주문하기", "click 피자"]);
    // The answer is a real click, so the host shows it too.
    expect(onTap.mock.calls.map(([t]) => t.label)).toEqual(["계속 주문하기", "피자"]);
  });

  it("when a step cannot find its target under a modal that came up meanwhile, answers it and retries that step once", async () => {
    const log: string[] = [];
    let up = false;
    let reads = 0;
    // The modal comes up while 라지 is being looked for: the check before the step does not see it yet.
    const doc = modalPage({
      modalUp: () => up || ++reads > 2,
      hideWhileUp: ["라지"],
      log,
      onDismiss: () => {
        up = false;
        reads = -1e9;
      },
    });
    await runPlan(doc, [{ op: "click", label: "라지" }], { forbiddenLabels: forbidden, interrupts });
    expect(log).toEqual(["click 계속 주문하기", "click 라지"]);
  }, 10_000);

  it("never retries a refused step, and plans without interrupts as before", async () => {
    const log: string[] = [];
    const doc = modalPage({ modalUp: () => false, hideWhileUp: [], log, onDismiss: () => {} });
    await expect(runPlan(doc, [{ op: "click", label: "피자" }], { forbiddenLabels: ["피자"], interrupts })).rejects.toThrow(/Refused/);
    expect(log).toEqual([]);
  });
});

describe("nearestWithin", () => {
  // Stand-ins for DOM elements: only parentElement and innerText are read.
  const node = (innerText: string, parentElement: unknown = null) => ({ innerText, parentElement }) as unknown as HTMLElement;
  const sheet = node("에스프레소 샷 +500원 − 0 +\n바닐라 시럽 +300원 − 0 +");
  const shotRow = node("에스프레소 샷\n+500원\n−\n0\n+", sheet);
  const syrupRow = node("바닐라 시럽\n+300원\n−\n0\n+", sheet);
  const shotPlus = { el: node("+", shotRow), label: "+", text: "+" };
  const syrupPlus = { el: node("+", syrupRow), label: "+", text: "+" };

  it("keeps the target whose closest ancestor holds the text", () => {
    expect(nearestWithin([shotPlus, syrupPlus], "에스프레소 샷")).toEqual([shotPlus]);
    expect(nearestWithin([shotPlus, syrupPlus], "바닐라 시럽")).toEqual([syrupPlus]);
  });

  it("keeps every target at the same distance and none when no ancestor holds the text", () => {
    expect(nearestWithin([shotPlus, syrupPlus], "없는 메뉴")).toEqual([]);
    expect(nearestWithin([shotPlus, syrupPlus], "에스프레소 샷 +500원 − 0 +\n바닐라")).toEqual([shotPlus, syrupPlus]);
  });
});

describe("isForbiddenTarget", () => {
  it("refuses an element whose label or text holds a forbidden word", () => {
    expect(isForbiddenTarget({ label: "주문하기", text: "주문하기" }, forbidden)).toBe(true);
    // A harmless label on an element that also shows a payment word is still refused.
    expect(isForbiddenTarget({ label: "다음", text: "다음\n카드 결제" }, forbidden)).toBe(true);
    expect(isForbiddenTarget({ label: "💳 신용/체크카드", text: "💳 신용/체크카드" }, forbidden)).toBe(true);
  });

  it("allows ordinary kiosk controls", () => {
    expect(isForbiddenTarget({ label: "화면을 터치하여 주문을 시작하세요", text: "화면을 터치하여 주문을 시작하세요" }, forbidden)).toBe(false);
    expect(isForbiddenTarget({ label: "페퍼로니", text: "페퍼로니\n17,900원" }, forbidden)).toBe(false);
    expect(isForbiddenTarget({ label: "삭제", text: "삭제" }, forbidden)).toBe(false);
  });
});
