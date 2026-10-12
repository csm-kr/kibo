import type { Locale, LocalizedName } from "@/types/menu";

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
  learnedPlaceholder: { ko: "예: 페퍼로니 라지 하나", en: "e.g. One large pepperoni" },
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
  // Learned kiosk (KIBO Learn): the kiosk page is driven by the bridge, and the user pays on the kiosk itself
  bridgePending: { ko: "키오스크에 입력하고 있어요…", en: "The kiosk is entering it…" },
  bridgeSlow: { ko: "키오스크 화면을 확인해 주세요.", en: "Please check the kiosk screen." },
  bridgeMismatch: {
    ko: "키오스크에 반영되지 않았어요. 키오스크 화면을 확인해 주세요. 직원을 불렀어요.",
    en: "The kiosk did not take that change. Please check the kiosk screen. Staff is on the way.",
  },
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
  // /demo only (docs/UX.md Flow C)
  demoLimit: { ko: "이번 주문의 데모 메시지를 다 썼어요.", en: "Demo limit reached for this order." },
  tryAgain: { ko: "다시 해 보기", en: "Try again" },
  twoDeviceHint: {
    ko: "실제처럼 해 보려면 이 화면에서 키오스크를 열고, 휴대폰으로 QR을 찍으세요.",
    en: "To try it for real, open the kiosk on this screen and scan its QR with your phone.",
  },
  twoDeviceOpen: { ko: "키오스크와 휴대폰으로 해 보기", en: "Open two-device mode" },
  backToIntro: { ko: "처음 안내로 돌아가기", en: "Back to the intro" },
  learnedDemoEnd: {
    ko: "실제 매장이라면 이제 키오스크에서 직접 결제해요. KIBO는 결제하지 않아요.",
    en: "In a real store, you would now pay on the kiosk itself. KIBO never pays for you.",
  },
  tryMalo: { ko: "MALO BURGER로 해 보기", en: "Try MALO BURGER" },
  // P1 microphone hint, before the browser asks
  micHintTitle: { ko: "말로 주문하려면 마이크를 켜 주세요", en: "Turn on the microphone to talk" },
  micHintPre: { ko: "다음 화면에서 ", en: "Tap " },
  micHintAllow: { ko: "허용", en: "Allow" },
  micHintPost: { ko: "을 눌러 주세요.", en: " on the next screen." },
  allowPicTitle: { ko: "마이크 사용", en: "Use your microphone" },
  allowPicBlock: { ko: "차단", en: "Block" },
  micTurnOn: { ko: "마이크 켜기", en: "Turn on the microphone" },
  typeInstead: { ko: "글자로 입력할게요", en: "Type instead" },
  // P1 in an in-app browser
  inAppTitle: { ko: "이 앱에서는 마이크가 잘 안 될 때가 많아요.", en: "Microphones often don't work in this app." },
  inAppOpen: { ko: "Safari나 Chrome에서 열어 주세요.", en: "Open in Safari or Chrome." },
  copyLink: { ko: "링크 복사", en: "Copy link" },
  linkCopied: { ko: "복사했어요. Safari나 Chrome 주소창에 붙여 넣어 주세요.", en: "Copied. Paste it into Safari or Chrome." },
  copyFailed: {
    ko: "복사하지 못했어요. 앱 메뉴에서 '다른 브라우저로 열기'를 눌러 주세요.",
    en: "Couldn't copy. Use this app's menu to open the page in your browser.",
  },
  stayHere: { ko: "여기서 글자로 주문하기", en: "Order here by typing" },
  inAppTyping: { ko: "글자로는 여기서도 주문할 수 있어요.", en: "Typing works here." },
  // Mic button: the label names the state, not only the color (docs/UI_QA.md "Color")
  micTap: { ko: "눌러서 말하기", en: "Tap to talk" },
  micConnecting: { ko: "연결하고 있어요…", en: "Connecting…" },
  micListening: { ko: "듣고 있어요…", en: "Listening…" },
  micThinking: { ko: "생각하고 있어요…", en: "Thinking…" },
  micSpeaking: { ko: "말하고 있어요…", en: "Speaking…" },
  micStop: { ko: "누르면 멈춰요", en: "Tap to stop" },
  aiVoice: { ko: "AI 목소리", en: "AI voice" },
  on: { ko: "켜짐", en: "On" },
  off: { ko: "꺼짐", en: "Off" },
  voiceNoise: { ko: "잘 안 들리면 글자로 입력하거나 버튼을 눌러 주세요.", en: "Having trouble? Try typing or tapping a button." },
  // Voice, when it gives way to text
  voiceBusy: { ko: "지금은 음성 주문이 붐벼요. 글자로 입력해 주세요.", en: "Voice is busy right now. Please type instead." },
  voiceFailed: { ko: "음성 연결이 안 돼요. 글자로 입력해 주세요.", en: "Voice isn't working right now. Please type instead." },
  voiceNoMic: { ko: "마이크를 쓸 수 없어요. 글자로 입력해 주세요.", en: "The microphone isn't available. Please type instead." },
  voiceOtherTab: { ko: "다른 탭에서 음성이 켜져 있어요.", en: "Voice is open in another tab." },
  voiceTimeUp: { ko: "이번 주문의 음성 시간이 끝났어요. 글자로 입력해 주세요.", en: "Voice time for this order is up. Please type." },
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

/** "음성 45초 남았어요": voice time left on a /demo order. */
export function voiceSecondsLeft(seconds: number, locale: Locale): string {
  return locale === "ko" ? `음성 ${seconds}초 남았어요` : `Voice: ${seconds} s left`;
}

/** Example sentences on /demo (docs/UX.md Flow C2): a short first order before the hero order. */
export function demoExamples(locale: Locale): string[] {
  return locale === "ko"
    ? ["치즈버거 세트 하나, 음료는 제로콜라.", ...phoneExamples(locale)]
    : [
        "One cheeseburger set with zero cola",
        "Two cheeseburger sets, one without pickles. Drinks zero cola and cider.",
        "Make both fries large",
        "Is this halal?",
        "I'll pay",
      ];
}

/** P4 on a learned kiosk: the kiosk's own checkout label, quoted as the kiosk shows it, with its meaning in English. */
export function learnedPayHint(
  checkout: { label: string; name: LocalizedName },
  locale: Locale,
): { pre: string; label: string; gloss: string; post: string } {
  return locale === "ko"
    ? { pre: "주문이 키오스크에 담겼어요. 키오스크에서 '", label: checkout.label, gloss: "", post: "' 버튼을 누르고 결제해 주세요." }
    : { pre: "Your order is on the kiosk. Tap ", label: checkout.label, gloss: ` (${checkout.name.en})`, post: " on the kiosk and pay there." };
}

/** Example sentences for the learned pizza kiosk, on /demo and /assistant (items and options from skills/doughhouse.json). */
export function learnedExamples(locale: Locale): string[] {
  return locale === "ko"
    ? ["페퍼로니 라지, 씬 도우에 베이컨 추가해 줘.", "콜라 1.25L 하나 추가해 줘.", "콜라는 빼 줘.", "다 골랐어요."]
    : ["A large pepperoni with thin dough and extra bacon", "Add a cola, 1.25 liters", "Remove the cola", "I'm done"];
}

/** Example sentences on /assistant. */
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
