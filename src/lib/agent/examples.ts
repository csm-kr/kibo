import type { Locale } from "@/types/menu";

// "Try saying" sentences per kiosk, on /assistant and /demo (docs/UX.md Flow C2). Names come from each kiosk's data
// (data/kiosks/*.json, skills/*.json); the halal and platform questions show the staff call for facts the
// data does not have.

type Examples = Record<Locale, string[]>;

const MALO: Examples = {
  ko: ["치즈버거 세트 두 개, 하나는 피클 빼고. 음료는 제로콜라랑 사이다.", "감자튀김 둘 다 라지로 바꿔 줘.", "이거 할랄이에요?", "결제할게요."],
  en: [
    "Two cheeseburger sets, one without pickles. Drinks zero cola and cider.",
    "Make both fries large.",
    "Is this halal?",
    "I'll pay.",
  ],
};

// /demo starts with a short first order before the hero order.
const MALO_DEMO: Examples = {
  ko: ["치즈버거 세트 하나, 음료는 제로콜라.", ...MALO.ko],
  en: [
    "One cheeseburger set with zero cola",
    "Two cheeseburger sets, one without pickles. Drinks zero cola and cider.",
    "Make both fries large",
    "Is this halal?",
    "I'll pay",
  ],
};

const DOUGHHOUSE: Examples = {
  ko: ["페퍼로니 라지, 씬 도우에 베이컨 추가해 줘.", "콜라 1.25L 하나 추가해 줘.", "콜라는 빼 줘.", "다 골랐어요."],
  en: ["A large pepperoni with thin dough and extra bacon", "Add a cola, 1.25 liters", "Remove the cola", "I'm done"],
};

// The snack bar KIBO learned blind (skills/bunsik.json): a required spice level, a priced topping, a gimbap cut.
const BUNSIK: Examples = {
  ko: ["치즈 떡볶이 3단계 보통맛으로, 삶은 계란 추가해 주세요.", "참치 김밥 하나 썰어서 추가해 주세요.", "김밥은 빼 주세요.", "다 골랐어요."],
  en: ["Cheese tteokbokki, medium spicy, with a boiled egg", "Add a tuna gimbap, sliced", "Remove the gimbap", "I'm done"],
};

const AIRPORT_RAIL: Examples = {
  ko: ["직통열차 시티센터, 어른 두 장 주세요.", "어린이 한 장도 추가해 주세요.", "몇 번 승강장이에요?", "결제할게요."],
  en: ["Two adult tickets to City Center on the express, please.", "Add one child ticket too.", "Which platform is it?", "I'll pay."],
};

const BY_KIOSK: Record<string, { phone: Examples; demo?: Examples }> = {
  malo: { phone: MALO, demo: MALO_DEMO },
  doughhouse: { phone: DOUGHHOUSE },
  airport_rail: { phone: AIRPORT_RAIL },
  bunsik: { phone: BUNSIK },
};

export function examplesFor(kioskId: string, locale: Locale, surface: "phone" | "demo" = "phone"): string[] {
  if (!Object.hasOwn(BY_KIOSK, kioskId)) return [];
  const set = BY_KIOSK[kioskId];
  return ((surface === "demo" && set.demo) || set.phone)[locale];
}
