import type { KioskDomain, Locale, LocalizedName } from "@/types/menu";
import { kt } from "./kiosk";

// Every phone string (docs/UX.md "Copy"): plain, polite, one idea per sentence; buttons are verbs.
// Words like session, token or agent never appear (heuristic 2).

const PHONE_TEXT = {
  // Header
  langKo: { ko: "한국어", en: "한국어" },
  langEn: { ko: "English", en: "English" },
  callStaff: { ko: "직원 호출", en: "Call staff" },
  // Phone design app bar (docs/UI_GUIDE.md "Phone design"): short visible labels; the full name is the accessible one
  staffShort: { ko: "직원", en: "Staff" },
  connected: { ko: "연결됨", en: "Connected" },
  // Short enough for one line beside the brand at 360px; the banner keeps the full sentence.
  barReconnecting: { ko: "연결 중…", en: "Reconnecting…" },
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
  cartEmpty: { ko: "아직 담은 것이 없어요.", en: "Nothing in your order yet." },
  total: { ko: "합계", en: "Total" },
  undo: { ko: "되돌리기", en: "Undo" },
  examples: { ko: "이렇게 말해 보세요", en: "Try saying" },
  inputLabel: { ko: "주문을 글자로 입력", en: "Type your order" },
  inputPlaceholder: { ko: "예: 치즈버거 세트 하나", en: "e.g. One cheeseburger set" },
  learnedPlaceholder: { ko: "예: 페퍼로니 라지 하나", en: "e.g. One large pepperoni" },
  ticketPlaceholder: { ko: "예: 시티센터 어른 두 장", en: "e.g. Two adults to City Center" },
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
  typeButton: { ko: "글자 입력", en: "Type" },
  closeTyping: { ko: "닫기", en: "Close" },
  // Learned kiosk (KIBO Learn): the kiosk page is driven by the bridge, and the user pays on the kiosk itself
  bridgePending: { ko: "키오스크에 입력하고 있어요…", en: "The kiosk is entering it…" },
  bridgeSlow: { ko: "키오스크 화면을 확인해 주세요.", en: "Please check the kiosk screen." },
  bridgeMismatch: {
    ko: "키오스크에 반영되지 않았어요. 키오스크 화면을 확인해 주세요. 직원을 불렀어요.",
    en: "The kiosk did not take that change. Please check the kiosk screen. Staff is on the way.",
  },
  // Pay
  payTitle: { ko: "키오스크에 카드를 넣어 주세요", en: "Insert your card into the kiosk" },
  cardStandIn: { ko: "키오스크에 카드 넣기", en: "Insert the card at the kiosk" },
  // Done
  orderNumber: { ko: "주문 번호", en: "Order number" },
  pickup: { ko: "카운터에서 번호를 부르면 받아 가세요.", en: "We'll call your number at the counter." },
  // A ticket machine (domain ticket) prints the tickets itself, as its K8 says (src/lib/i18n/kiosk.ts).
  referenceNumber: { ko: "참조 번호", en: "Reference number" },
  takeTickets: { ko: "키오스크에서 승차권을 받아 가세요.", en: "Please take your tickets from the machine." },
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
  tryAnotherPlace: { ko: "다른 곳에서 해 보기", en: "Try another place" },
  // /demo scenario guide (src/components/demo/ScenarioGuide.tsx)
  scenarios: { ko: "시나리오", en: "Scenarios" },
  scenariosLead: {
    ko: "고르면 새 주문으로 시작해요. 결제는 대신하지 않아요.",
    en: "Each one starts a fresh order. Nothing is paid for you.",
  },
  allScenarios: { ko: "시나리오 목록", en: "All scenarios" },
  scenarioStarting: { ko: "새 주문을 시작하고 있어요…", en: "Starting a fresh order…" },
  scenarioStartFailed: { ko: "새 주문을 시작하지 못했어요. 다시 골라 주세요.", en: "Couldn't start a fresh order. Please choose again." },
  scenarioSayHint: { ko: "문장을 누르면 보내져요. 직접 말하거나 입력해도 돼요.", en: "Tap a sentence to send it, or say or type it yourself." },
  scenarioDineFirst: { ko: "먼저 휴대폰에서 먹고 갈지, 포장할지 골라 주세요.", en: "First choose eat here or take out on the phone." },
  playForMe: { ko: "대신 해 보기", en: "Play it for me" },
  stopPlaying: { ko: "멈추기", en: "Stop" },
  playPaused: { ko: "다음 단계로 넘어가요…", en: "Next step in a moment…" },
  playStopped: { ko: "멈췄어요. 직접 이어서 해도 돼요.", en: "Stopped. You can carry on yourself." },
  playFailed: {
    ko: "이 단계가 예상대로 되지 않았어요. 직접 입력하거나 다시 해 보세요.",
    en: "This step didn't go as expected. You can type it yourself or try again.",
  },
  playLimit: {
    ko: "이번 주문의 데모 메시지를 다 썼어요. 휴대폰에서 [다시 해 보기]를 누르세요.",
    en: "Demo limit reached for this order. Tap Try again on the phone.",
  },
  stepDoneLabel: { ko: "완료", en: "Done" },
  yourTurnPre: { ko: "이제 직접 해 보세요: 휴대폰에서 ", en: "Your turn: tap " },
  yourTurnPost: { ko: "를 누르고, 키오스크에서 카드를 대세요.", en: " on the phone, then the card on the kiosk." },
  yourTurnLearned: { ko: "이제 키오스크에서 직접 주문을 마치고 결제해요.", en: "Your turn: finish and pay on the kiosk itself." },
  scenarioPaid: { ko: "결제를 마쳤어요. 다른 시나리오도 해 보세요.", en: "Paid. Choose another scenario to try more." },
  tagOrdering: { ko: "주문", en: "Ordering" },
  tagSafety: { ko: "안전", en: "Safety" },
  tagGrounding: { ko: "데이터로만 답해요", en: "Answers from data" },
  tagAccessibility: { ko: "접근성", en: "Accessibility" },
  tagLearned: { ko: "KIBO Learn", en: "KIBO Learn" },
  // /demo "What the AI did" strip (src/components/demo/ActionStrip.tsx)
  aiActions: { ko: "AI가 한 일", en: "What the AI did" },
  aiActionsLegend: {
    ko: "Gemini가 정하고, 키오스크가 움직이기 전에 KIBO 서버가 모든 동작을 키오스크 데이터와 규칙으로 확인해요.",
    en: "Gemini decides; the KIBO server checks every action against the kiosk's data and rules before the kiosk moves.",
  },
  aiActionsEmpty: { ko: "아직 없어요. 휴대폰에서 말하거나 입력해 보세요.", en: "Nothing yet. Say or type an order on the phone." },
  aiActionsList: { ko: "AI 동작, 최근 것부터", en: "AI actions, newest first" },
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

/** A ticket machine (domain ticket) sells tickets: these replace the order words, as the kiosk's TICKET_TEXT does. */
const PHONE_TICKET_TEXT: Partial<Record<PhoneTextKey, Record<Locale, string>>> = {
  cartTitle: { ko: "내 승차권", en: "Your tickets" },
  cartEmpty: { ko: "아직 고른 승차권이 없어요.", en: "No tickets chosen yet." },
  confirmTitle: { ko: "승차권을 확인해 주세요", en: "Please check your tickets" },
  idleQuestion: { ko: "계속 구매하시겠어요?", en: "Still buying?" },
};

export function pt(key: PhoneTextKey, locale: Locale, domain?: KioskDomain): string {
  return (domain === "ticket" && PHONE_TICKET_TEXT[key]?.[locale]) || PHONE_TEXT[key][locale];
}

/** The scenario guide while it plays: "Step 2 of 3: watch the kiosk…" (step counts from 1). */
export function playStep(waiting: boolean, step: number, total: number, locale: Locale): string {
  return locale === "ko"
    ? `${total}단계 중 ${step}단계: ${waiting ? "키오스크를 지켜보세요…" : "AI에게 보내고 있어요…"}`
    : `Step ${step} of ${total}: ${waiting ? "watch the kiosk…" : "sending it to the AI…"}`;
}

/** "13,800원" or "13,800 won": KRW in both, words the reader knows. */
export function phonePrice(n: number, locale: Locale): string {
  const digits = n.toLocaleString("en-US");
  return locale === "ko" ? `${digits}원` : `${digits} won`;
}

/** "2 items" after the cart title: the sum of quantities, so two of one line count as two. */
export function itemCount(n: number, locale: Locale): string {
  return locale === "ko" ? `${n}개` : `${n} ${n === 1 ? "item" : "items"}`;
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

/**
 * P5: the kiosk first asks for the payment method in Korean, so name its own button, with its meaning in English
 * (J2 Pay, I-118). The label is the kiosk's K7 button (src/lib/i18n/kiosk.ts `payCard`).
 */
export function payMethodHint(locale: Locale): { pre: string; label: string; gloss: string; post: string } {
  const label = kt("payCard", "ko");
  return locale === "ko"
    ? { pre: "키오스크에서 '", label, gloss: "", post: "'를 누르고 카드를 넣어 주세요." }
    : { pre: "On the kiosk, tap ", label, gloss: ` (${kt("payCard", "en")})`, post: ", then insert your card." };
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
