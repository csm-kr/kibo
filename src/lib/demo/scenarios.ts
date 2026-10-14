import type { TemplateId } from "@/lib/commands/errors";
import type { Session, SessionStatus } from "@/types/session";

// Guided /demo scenarios: what the user could say, what to watch, and a check on the session that tells when a step is
// done. The AI's replies are never scripted. Sentences name only items in each kiosk's data (data/kiosks/*.json,
// skills/doughhouse.json) and reuse ones that pass in evals/agent-cases.json where one exists. Every scenario stops at
// the confirm card: the judge taps [Yes, pay now] and the card themselves, which is the safety rule the demo shows.

type Text = { en: string; ko: string };

export interface ScenarioStep {
  say: Text;
  watch: Text;
  done: StepCheck;
}

export type StepCheck =
  /** A line of this item; `selections` compares only the listed groups; `qty` is the total over every matching line. */
  | { kind: "cartHas"; itemId: string; variant?: string; qty?: number; selections?: Record<string, string[]> }
  | { kind: "cartLines"; count: number }
  | { kind: "choicesOffered"; templateId: TemplateId }
  | { kind: "staffCalled" }
  | { kind: "status"; status: SessionStatus }
  | { kind: "cartEmpty" };

export interface Scenario {
  id: string;
  kioskId: string;
  persona: Text;
  title: Text;
  goal: Text;
  tags: ("ordering" | "safety" | "grounding" | "accessibility" | "learned")[];
  steps: ScenarioStep[];
  stopBeforePay: true;
}

const SUNJA: Text = { en: "Sunja, 72", ko: "순자 (72)" };
const MEI: Text = { en: "Mei, 34, tourist", ko: "메이 (34, 여행객)" };
const MINSU: Text = { en: "Minsu, 45, low vision", ko: "민수 (45, 저시력)" };

const CONFIRM_CARD: Text = {
  en: "Your order opens for review on the phone and the kiosk. Tap Yes, pay now yourself.",
  ko: "휴대폰과 키오스크에 주문 내역이 떠요. 네, 결제할게요는 직접 누르세요.",
};

const MALO: Scenario[] = [
  {
    id: "sunja-lunch",
    kioskId: "malo",
    persona: SUNJA,
    title: { en: "Sunja's lunch", ko: "순자 씨의 점심" },
    goal: { en: "A whole set order in one sentence, then a change to both lines.", ko: "세트 주문을 한 문장으로 하고, 두 줄을 한 번에 바꿔요." },
    tags: ["ordering", "accessibility"],
    steps: [
      {
        say: {
          en: "Two cheeseburger sets. One without pickles; drinks zero cola and cider.",
          ko: "치즈버거 세트 두 개요. 하나는 피클 빼고 제로콜라, 하나는 사이다로 주세요.",
        },
        watch: { en: "Two lines with different options light up on the kiosk.", ko: "키오스크에 옵션이 다른 두 줄이 표시돼요." },
        done: { kind: "cartHas", itemId: "cheese_burger", variant: "set", qty: 2 },
      },
      {
        say: { en: "Make both fries large.", ko: "감자튀김 둘 다 라지로 바꿔 줘." },
        watch: { en: "Both lines change; no new line is added.", ko: "두 줄이 함께 바뀌고, 새 줄은 생기지 않아요." },
        done: { kind: "cartHas", itemId: "cheese_burger", variant: "set", selections: { side: ["fries_l"] }, qty: 2 },
      },
      {
        say: { en: "That's all. I'll pay.", ko: "다 됐어요. 결제할게요." },
        watch: CONFIRM_CARD,
        done: { kind: "status", status: "confirming" },
      },
    ],
    stopBeforePay: true,
  },
  {
    id: "not-sure",
    kioskId: "malo",
    persona: SUNJA,
    title: { en: "Not sure what to pick", ko: "뭘 고를지 모를 때" },
    goal: { en: "When the order is unclear, KIBO asks with buttons instead of guessing.", ko: "주문이 모호하면 짐작하지 않고 버튼으로 물어봐요." },
    tags: ["ordering", "grounding"],
    steps: [
      {
        say: { en: "One burger, please.", ko: "버거 하나 주세요." },
        watch: { en: "The phone shows burgers from the menu as buttons; nothing is added yet.", ko: "휴대폰에 메뉴의 버거가 버튼으로 나와요. 아직 담기지 않아요." },
        done: { kind: "choicesOffered", templateId: "pick_item" },
      },
    ],
    stopBeforePay: true,
  },
  {
    id: "sold-out",
    kioskId: "malo",
    persona: MINSU,
    title: { en: "Sold out", ko: "품절일 때" },
    goal: { en: "A sold-out item is refused, with alternatives from the menu.", ko: "품절 메뉴는 담지 않고, 메뉴에 있는 대안을 보여 줘요." },
    tags: ["grounding"],
    steps: [
      {
        say: { en: "One shrimp burger set with cola, please.", ko: "새우버거 세트 하나, 콜라로 주세요." },
        watch: { en: "It says the shrimp burger is sold out and offers other burgers as buttons.", ko: "새우버거가 품절이라고 말하고 다른 버거를 버튼으로 보여 줘요." },
        done: { kind: "choicesOffered", templateId: "alternatives" },
      },
    ],
    stopBeforePay: true,
  },
  {
    id: "halal",
    kioskId: "malo",
    persona: MEI,
    title: { en: "A question the kiosk can't answer", ko: "키오스크가 모르는 질문" },
    goal: { en: "When the kiosk's data has no answer, KIBO does not guess: it calls staff.", ko: "키오스크 데이터에 답이 없으면 짐작하지 않고 직원을 불러요." },
    tags: ["grounding", "safety"],
    steps: [
      {
        say: { en: "Is this halal?", ko: "이거 할랄이에요?" },
        watch: { en: "A staff banner appears on the kiosk; the cart does not change.", ko: "키오스크에 직원 호출 안내가 뜨고, 장바구니는 그대로예요." },
        done: { kind: "staffCalled" },
      },
    ],
    stopBeforePay: true,
  },
  {
    id: "ai-cannot-pay",
    kioskId: "malo",
    persona: MINSU,
    title: { en: "The AI cannot pay", ko: "AI는 결제할 수 없어요" },
    goal: { en: "Even when asked, the AI only opens your order review. Paying needs your tap.", ko: "부탁해도 AI는 주문 내역만 띄워요. 결제는 직접 눌러야 해요." },
    tags: ["safety"],
    steps: [
      {
        say: { en: "One cheeseburger set with zero cola.", ko: "치즈버거 세트 하나, 음료는 제로콜라." },
        watch: { en: "The set appears on the kiosk and the phone.", ko: "키오스크와 휴대폰에 세트가 담겨요." },
        done: { kind: "cartHas", itemId: "cheese_burger", variant: "set", selections: { drink: ["zero_cola"] } },
      },
      {
        say: { en: "Just pay for me.", ko: "그냥 결제해 줘." },
        watch: {
          en: "The kiosk stops at the review; it never moves to payment by itself.",
          ko: "키오스크는 주문 확인에서 멈추고, 혼자 결제로 넘어가지 않아요.",
        },
        done: { kind: "status", status: "confirming" },
      },
    ],
    stopBeforePay: true,
  },
  {
    id: "undo",
    kioskId: "malo",
    persona: SUNJA,
    title: { en: "Oops, undo", ko: "앗, 취소" },
    goal: { en: "One sentence takes back the last change.", ko: "한 마디로 방금 바꾼 것을 되돌려요." },
    tags: ["safety"],
    steps: [
      {
        say: { en: "One cola, please.", ko: "콜라 하나 주세요." },
        watch: { en: "A cola appears on the kiosk.", ko: "키오스크에 콜라가 담겨요." },
        done: { kind: "cartHas", itemId: "cola" },
      },
      {
        say: { en: "No, cancel that.", ko: "아니요, 방금 거 취소해 주세요." },
        watch: { en: "The cart goes back to how it was.", ko: "장바구니가 원래대로 돌아가요." },
        done: { kind: "cartEmpty" },
      },
    ],
    stopBeforePay: true,
  },
];

const AIRPORT_RAIL: Scenario[] = [
  {
    id: "mei-tickets",
    kioskId: "airport_rail",
    persona: MEI,
    title: { en: "Mei's tickets", ko: "메이 씨의 승차권" },
    goal: { en: "Tickets in English at a ticket machine that starts in Korean.", ko: "한국어로 시작하는 발권기에서 영어로 승차권을 사요." },
    tags: ["ordering", "accessibility"],
    steps: [
      {
        say: { en: "Two adult tickets to City Center on the express, please.", ko: "직통열차 시티센터, 어른 두 장 주세요." },
        watch: { en: "Two adult express tickets appear on the machine.", ko: "발권기에 직통열차 어른 두 장이 담겨요." },
        done: { kind: "cartHas", itemId: "express_city_center", selections: { passenger: ["adult"] }, qty: 2 },
      },
      {
        say: { en: "Add one child ticket too.", ko: "어린이 한 장도 추가해 주세요." },
        watch: { en: "A child ticket is added as its own line, at the child fare.", ko: "어린이 승차권이 어린이 요금으로 따로 담겨요." },
        done: { kind: "cartHas", itemId: "express_city_center", selections: { passenger: ["child"] }, qty: 1 },
      },
      {
        say: { en: "I'll pay.", ko: "결제할게요." },
        watch: CONFIRM_CARD,
        done: { kind: "status", status: "confirming" },
      },
    ],
    stopBeforePay: true,
  },
  {
    id: "which-platform",
    kioskId: "airport_rail",
    persona: MEI,
    title: { en: "Which platform?", ko: "몇 번 승강장이에요?" },
    goal: { en: "Platforms are not in the machine's data, so KIBO calls staff instead of guessing.", ko: "승강장 정보는 발권기 데이터에 없어서, 짐작하지 않고 직원을 불러요." },
    tags: ["grounding"],
    steps: [
      {
        say: { en: "Which platform does the express leave from?", ko: "직통열차는 몇 번 승강장에서 출발해요?" },
        watch: { en: "A staff banner appears on the machine.", ko: "발권기에 직원 호출 안내가 떠요." },
        done: { kind: "staffCalled" },
      },
    ],
    stopBeforePay: true,
  },
];

const DOUGHHOUSE: Scenario[] = [
  {
    id: "learned-pizza",
    kioskId: "doughhouse",
    persona: MINSU,
    title: { en: "Pizza on a kiosk KIBO learned", ko: "KIBO가 배운 피자 키오스크" },
    goal: {
      en: "No integration: KIBO taps the pizza kiosk's own screen and checks its total.",
      ko: "연동 없이 KIBO가 피자 키오스크 화면을 직접 누르고 합계를 확인해요.",
    },
    tags: ["learned", "ordering"],
    steps: [
      {
        say: { en: "A large pepperoni with thin dough and extra bacon", ko: "페퍼로니 라지, 씬 도우에 베이컨 추가해 줘." },
        watch: {
          en: "The kiosk's own screen is tapped step by step; the phone shows the line once the kiosk's total matches.",
          ko: "키오스크 화면이 한 단계씩 눌리고, 키오스크 합계가 맞으면 휴대폰에 담겨요.",
        },
        done: { kind: "cartHas", itemId: "pepperoni", selections: { size: ["large"], dough: ["thin"], toppings: ["bacon"] } },
      },
      {
        say: { en: "I'm done", ko: "다 골랐어요." },
        watch: {
          en: "The phone shows the review. On this kiosk you pay on the kiosk itself.",
          ko: "휴대폰에 주문 확인이 떠요. 이 키오스크에서는 키오스크에서 직접 결제해요.",
        },
        done: { kind: "status", status: "confirming" },
      },
    ],
    stopBeforePay: true,
  },
];

const BY_KIOSK: Record<string, Scenario[]> = { malo: MALO, airport_rail: AIRPORT_RAIL, doughhouse: DOUGHHOUSE };

export function scenariosFor(kioskId: string): Scenario[] {
  return Object.hasOwn(BY_KIOSK, kioskId) ? BY_KIOSK[kioskId] : [];
}

function sameOptions(a: string[] | undefined, b: string[]): boolean {
  if (!a || a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((o) => set.has(o));
}

export function stepDone(session: Session, check: StepCheck): boolean {
  switch (check.kind) {
    case "cartHas": {
      const lines = session.cart.filter(
        (l) =>
          l.itemId === check.itemId &&
          (check.variant === undefined || l.variant === check.variant) &&
          Object.entries(check.selections ?? {}).every(([g, ids]) => sameOptions(l.selections[g], ids)),
      );
      if (check.qty === undefined) return lines.length > 0;
      return lines.reduce((n, l) => n + l.qty, 0) === check.qty;
    }
    case "cartLines":
      return session.cart.length === check.count;
    case "choicesOffered":
      return session.pendingChoice?.templateId === check.templateId;
    case "staffCalled":
      return session.staffCalled !== null;
    case "status":
      return session.status === check.status;
    case "cartEmpty":
      return session.cart.length === 0;
  }
}

/**
 * Checks steps in order, starting after the `from` steps already done (the caller keeps that count). A step counts only
 * after every earlier one, so a check that already holds at the start (an empty cart) does not skip ahead, and a done
 * step stays done when the session moves on (an undo empties the cart again, a choice tap clears the buttons).
 */
export function scenarioProgress(session: Session, scenario: Scenario, from = 0): { doneSteps: number; nextIndex: number } {
  let i = Math.min(Math.max(from, 0), scenario.steps.length);
  while (i < scenario.steps.length && stepDone(session, scenario.steps[i].done)) i++;
  return { doneSteps: i, nextIndex: i };
}
