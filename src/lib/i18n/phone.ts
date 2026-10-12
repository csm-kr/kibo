import type { Locale } from "@/types/menu";

// Every phone string (docs/UX.md "Copy"): plain, polite, one idea per sentence; buttons are verbs.
// Words like session, token or agent never appear (heuristic 2).

const PHONE_TEXT = {
  // Header
  langKo: { ko: "한국어", en: "한국어" },
  langEn: { ko: "English", en: "English" },
  callStaff: { ko: "직원 호출", en: "Call staff" },
  staffCalled: { ko: "직원을 불렀어요. 잠시만 기다려 주세요.", en: "Staff is on the way. Please wait a moment." },
  reconnecting: { ko: "다시 연결하고 있어요…", en: "Reconnecting…" },
  // Connecting
  connecting: { ko: "키오스크에 연결하고 있어요…", en: "Connecting to the kiosk…" },
  // Start
  startTitle: { ko: "휴대폰으로 말하면 키오스크가 주문해요", en: "Tell your phone, and the kiosk orders for you" },
  startLead: { ko: "키오스크를 배우지 않아도 돼요.", en: "You don't need to learn the kiosk." },
  step1: { ko: "여기에 말하거나 글자로 주문하세요.", en: "Talk or type your order here." },
  step2: { ko: "키오스크 화면이 저절로 채워져요.", en: "The kiosk fills itself in." },
  step3: { ko: "주문을 확인하고, 키오스크에서 결제하세요.", en: "Check your order, then pay at the kiosk." },
  start: { ko: "시작하기", en: "Start" },
  // Dine
  dineQuestion: { ko: "드시고 가세요, 포장하세요?", en: "Eat here or take out?" },
  dineOrTalk: { ko: "아니면 바로 주문을 말해 주세요.", en: "Or just tell me your order." },
  // Talk
  earlier: { ko: "이전 대화 보기", en: "Earlier messages" },
  you: { ko: "나", en: "You" },
  assistant: { ko: "KIBO", en: "KIBO" },
  working: { ko: "처리하고 있어요…", en: "Working…" },
  cartTitle: { ko: "내 주문", en: "Your order" },
  cartEmpty: { ko: "아직 담은 메뉴가 없어요.", en: "Nothing in your order yet." },
  total: { ko: "합계", en: "Total" },
  undo: { ko: "되돌리기", en: "Undo" },
  examples: { ko: "이렇게 말해 보세요", en: "Try saying" },
  inputLabel: { ko: "주문을 글자로 입력", en: "Type your order" },
  inputPlaceholder: { ko: "예: 치즈버거 세트 하나", en: "e.g. One cheeseburger set" },
  send: { ko: "보내기", en: "Send" },
  useButtons: {
    ko: "여기 버튼을 누르거나 키오스크 화면에서 주문할 수 있어요.",
    en: "You can still tap the buttons here, or order on the kiosk screen.",
  },
  // Confirm
  confirmTitle: { ko: "주문 내용을 확인해 주세요", en: "Please check your order" },
  payNow: { ko: "네, 결제할게요", en: "Yes, pay now" },
  pickMore: { ko: "더 고를게요", en: "Pick more" },
  sayYes: { ko: "\"네\"라고 말해도 돼요.", en: "You can also say yes." },
  // Pay
  payTitle: { ko: "키오스크에 카드를 넣어 주세요", en: "Insert your card into the kiosk" },
  payHint: { ko: "결제는 키오스크에서 해요.", en: "You pay at the kiosk." },
  cardStandIn: { ko: "키오스크에 카드 대기", en: "Tap the card on the kiosk" },
  // Done
  orderNumber: { ko: "주문 번호", en: "Order number" },
  pickup: { ko: "카운터에서 번호를 부르면 받아 가세요.", en: "We'll call your number at the counter." },
  done: { ko: "확인", en: "Done" },
  // Ended, taken
  endedTitle: { ko: "주문이 끝났어요.", en: "This order has ended." },
  endedNext: { ko: "다시 주문하려면 키오스크의 QR을 찍어 주세요.", en: "To order again, scan the QR on the kiosk." },
  takenTitle: { ko: "다른 분이 이 키오스크를 쓰고 있어요.", en: "Someone else is using this kiosk." },
  takenNext: { ko: "끝날 때까지 기다리거나 직원에게 물어보세요.", en: "Please wait until they finish, or ask staff." },
  // Idle
  idleQuestion: { ko: "계속 주문하시겠어요?", en: "Still ordering?" },
  idleContinue: { ko: "계속하기", en: "Continue" },
} satisfies Record<string, Record<Locale, string>>;

export type PhoneTextKey = keyof typeof PHONE_TEXT;

export function pt(key: PhoneTextKey, locale: Locale): string {
  return PHONE_TEXT[key][locale];
}

/** "13,800원" or "13,800 won": KRW in both, words the reader knows. */
export function phonePrice(n: number, locale: Locale): string {
  const digits = n.toLocaleString("en-US");
  return locale === "ko" ? `${digits}원` : `${digits} won`;
}

/** "× 2" next to a cart line. */
export function qtyText(qty: number, locale: Locale): string {
  return locale === "ko" ? `${qty}개` : `× ${qty}`;
}

/** For screen readers when the cart changes: "Your order: 2 items, 13,800 won". */
export function cartAnnouncement(count: number, total: number, locale: Locale): string {
  return locale === "ko"
    ? `내 주문: ${count}개, 합계 ${phonePrice(total, locale)}`
    : `Your order: ${count} ${count === 1 ? "item" : "items"}, total ${phonePrice(total, locale)}`;
}

/** "45초 남았어요" */
export function phoneSecondsLeft(seconds: number, locale: Locale): string {
  return locale === "ko" ? `${seconds}초 남았어요` : `${seconds} s left`;
}

/** Example sentences on /assistant (docs/UX.md Flow C2 uses the same ones on /demo). */
export function phoneExamples(locale: Locale): string[] {
  return locale === "ko"
    ? ["치즈버거 세트 두 개, 하나는 피클 빼고. 음료는 제로콜라랑 사이다.", "감자튀김 둘 다 라지로 바꿔 줘.", "이거 할랄이에요?", "결제할게요."]
    : [
        "Two cheeseburger sets, one without pickles. Drinks zero cola and cider.",
        "Make both fries large.",
        "Is this halal?",
        "I'll pay.",
      ];
}
