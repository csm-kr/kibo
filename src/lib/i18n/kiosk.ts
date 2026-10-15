import type { KioskDomain, Locale, Variant } from "@/types/menu";
import type { ChangeKind } from "@/types/session";

// Every kiosk string lives here in Korean and English; the kiosk's language row switches between them (I-019).
// Wording follows real kiosks (docs/UX.md "Copy"). TICKET_TEXT replaces the food words on ticket machines.

export const KIOSK_TEXT = {
  talkTitle: { ko: "휴대폰으로 말해서 주문 (QR)", en: "Order by talking (QR)" },
  talkHint: { ko: "휴대폰 카메라로 찍으세요", en: "Scan with your phone camera" },
  // Under the QR: the pairing code for /app (12-phone-app:3), "Or open <host>/app and enter 123 456".
  pairOpen: { ko: "또는 휴대폰에서 이 주소를 열고", en: "Or open this on your phone" },
  pairEnter: { ko: "이 번호를 넣으세요", en: "and enter this code" },
  pairCodeLabel: { ko: "연결 번호", en: "Code" },
  qrAlt: { ko: "휴대폰으로 주문하는 QR 코드", en: "QR code to order with your phone" },
  qrLoading: { ko: "QR을 준비하고 있어요", en: "Getting the QR ready" },
  touchTitle: { ko: "화면을 눌러서 주문", en: "Order by touch" },
  touchHint: { ko: "기존 방식 그대로", en: "The usual way" },
  language: { ko: "언어", en: "Language" },
  largeText: { ko: "큰 글씨 · 낮은 화면", en: "Large text · lower screen" },
  dineQuestion: { ko: "매장에서 드시나요, 포장하시나요?", en: "Eat here or take out?" },
  phoneConnected: {
    ko: "휴대폰이 연결됐어요. 휴대폰에서 주문하거나 여기서 눌러도 돼요.",
    en: "Your phone is connected. Order on your phone, or tap here.",
  },
  close: { ko: "닫기", en: "Close" },
  startOver: { ko: "처음으로", en: "Start over" },
  startOverAsk: { ko: "주문을 취소하고 처음으로 갈까요?", en: "Cancel this order and start over?" },
  startOverYes: { ko: "취소하고 처음으로", en: "Cancel and start over" },
  keepOrdering: { ko: "계속 주문", en: "Keep ordering" },
  // K3 menu
  dineChip: { ko: "매장", en: "Eat here" },
  takeOutChip: { ko: "포장", en: "Take out" },
  phoneConnectedShort: { ko: "휴대폰 연결됨", en: "Phone connected" },
  // KIBO's own line in the toolbar row while the phone waits for the AI (14-final:1).
  kiboWorking: { ko: "처리하고 있어요", en: "Working…" },
  connectOtherPhone: { ko: "다른 휴대폰 연결", en: "Connect another phone" },
  openQr: { ko: "휴대폰으로 말해서 주문", en: "Order by talking" },
  qrSheetTitle: { ko: "휴대폰 카메라로 QR을 찍으세요", en: "Scan the QR with your phone camera" },
  qrSheetHint: { ko: "담은 메뉴는 그대로 남아요", en: "Your cart stays as it is" },
  categories: { ko: "메뉴 종류", en: "Menu categories" },
  soldOut: { ko: "품절", en: "Sold out" },
  notNow: { ko: "지금은 판매하지 않아요", en: "Not available right now" },
  badgeBest: { ko: "BEST", en: "BEST" },
  badgeNew: { ko: "NEW", en: "NEW" },
  kcal: { ko: "kcal", en: "kcal" },
  cartEmpty: { ko: "메뉴를 골라 주세요", en: "Please choose an item" },
  cartCount: { ko: "개 담음", en: " in cart" },
  pending: { ko: "담는 중", en: "Adding" },
  clearAll: { ko: "전체 삭제", en: "Clear all" },
  clearConfirm: { ko: "담은 메뉴를 모두 지울까요?", en: "Remove everything from the cart?" },
  clearYes: { ko: "모두 지우기", en: "Remove all" },
  cancel: { ko: "취소", en: "Cancel" },
  order: { ko: "주문하기", en: "Order" },
  aiAdd: { ko: "AI가 담았어요", en: "Added by AI" },
  aiUpdate: { ko: "AI가 바꿨어요", en: "Changed by AI" },
  aiRemove: { ko: "AI가 뺐어요", en: "Removed by AI" },
  aiUndo: { ko: "AI가 되돌렸어요", en: "Undone by AI" },
  aiClear: { ko: "AI가 비웠어요", en: "Cleared by AI" },
  // K4 product sheet
  stepVariant: { ko: "세트 선택", en: "Set" },
  stepQty: { ko: "수량", en: "Quantity" },
  variantQuestion: { ko: "세트로 드릴까요?", en: "Make it a set?" },
  chooseUpTo: { ko: "개까지 고를 수 있어요", en: " at most" },
  chooseOne: { ko: "하나를 골라 주세요", en: "Please choose one" },
  optional: { ko: "고르지 않아도 돼요", en: "Optional" },
  quantity: { ko: "수량", en: "Quantity" },
  less: { ko: "하나 빼기", en: "One less" },
  more: { ko: "하나 더", en: "One more" },
  back: { ko: "이전", en: "Back" },
  next: { ko: "다음", en: "Next" },
  addToCart: { ko: "담기", en: "Add to cart" },
  selected: { ko: "선택됨", en: "Selected" },
  // K5 upsell
  upsellTitle: { ko: "디저트도 함께 드릴까요?", en: "Would you like a dessert too?" },
  upsellAdd: { ko: "추가", en: "Add" },
  upsellNo: { ko: "괜찮아요", en: "No, thanks" },
  // K6 review
  reviewTitle: { ko: "주문 내역을 확인해 주세요", en: "Please check your order" },
  dineLabel: { ko: "식사 장소", en: "Where" },
  dineNotSet: { ko: "아직 고르지 않았어요", en: "Not chosen yet" },
  total: { ko: "총 결제 금액", en: "Total" },
  pickMore: { ko: "메뉴 더 담기", en: "Pick more" },
  pay: { ko: "결제하기", en: "Pay" },
  removeAsk: { ko: "이 메뉴를 뺄까요?", en: "Remove this item?" },
  removeYes: { ko: "빼기", en: "Remove" },
  // K7 payment
  payMethodTitle: { ko: "결제 방법을 골라 주세요", en: "Choose how to pay" },
  payCard: { ko: "카드", en: "Card" },
  payEasy: { ko: "간편결제", en: "Mobile pay" },
  payCoupon: { ko: "쿠폰", en: "Coupon" },
  notSupported: { ko: "지원하지 않아요", en: "Not supported" },
  insertCard: { ko: "카드를 아래 투입구에 넣어 주세요", en: "Insert your card below" },
  insertCardButton: { ko: "카드 넣기", en: "Insert card" },
  virtualPayment: { ko: "체험용 결제예요. 실제로 결제되지 않아요.", en: "Practice payment. Nothing is charged." },
  approving: { ko: "승인 중…", en: "Approving…" },
  editOrder: { ko: "주문 수정", en: "Edit order" },
  // K8 done
  receiptQuestion: { ko: "영수증을 출력할까요?", en: "Print a receipt?" },
  receiptYes: { ko: "출력", en: "Print" },
  receiptNo: { ko: "출력 안 함", en: "No receipt" },
  orderNumber: { ko: "주문 번호", en: "Order number" },
  pickupHint: { ko: "번호를 부르면 카운터에서 받아 가세요", en: "We'll call your number at the counter" },
  // Under the number: what was paid, like a receipt (#1 item 20).
  paidList: { ko: "주문 내역", en: "Your order" },
  // KX banners
  staffCalled: { ko: "직원을 불렀어요. 잠시만 기다려 주세요.", en: "Staff is on the way. Please wait a moment." },
  staffMismatch: {
    ko: "키오스크 화면을 확인해 주세요. 직원을 불렀어요.",
    en: "Please check the kiosk screen. Staff is on the way.",
  },
  phonePaused: {
    ko: "휴대폰 연결이 잠시 끊겼어요. 화면을 눌러 계속할 수 있어요.",
    en: "The phone connection paused. You can keep going by touch.",
  },
  // The server refused the screen's session stream (too many screens on one network); it reconnects by itself (I-033).
  streamRetrying: { ko: "잠시 후 다시 연결합니다…", en: "Busy right now. Reconnecting…" },
  idleQuestion: { ko: "계속 주문하시겠어요?", en: "Still ordering?" },
  idleContinue: { ko: "계속하기", en: "Continue" },
  // Shown with Korean first and English below, whatever the kiosk's language (12-phone-app:7).
} satisfies Record<string, Record<Locale, string>>;

export type KioskTextKey = keyof typeof KIOSK_TEXT;

/** A ticket machine sells tickets: no menu, no order, no counter pickup. */
export const TICKET_TEXT: Partial<Record<KioskTextKey, Record<Locale, string>>> = {
  talkTitle: { ko: "휴대폰으로 말해서 구매 (QR)", en: "Buy by talking (QR)" },
  qrAlt: { ko: "휴대폰으로 구매하는 QR 코드", en: "QR code to buy with your phone" },
  touchTitle: { ko: "화면을 눌러서 구매", en: "Buy by touch" },
  phoneConnected: {
    ko: "휴대폰이 연결됐어요. 휴대폰에서 구매하거나 여기서 눌러도 돼요.",
    en: "Your phone is connected. Buy on your phone, or tap here.",
  },
  openQr: { ko: "휴대폰으로 말해서 구매", en: "Buy by talking" },
  qrSheetHint: { ko: "고른 승차권은 그대로 남아요", en: "Your tickets stay as they are" },
  categories: { ko: "승차권 종류", en: "Ticket types" },
  soldOut: { ko: "매진", en: "Sold out" },
  cartEmpty: { ko: "승차권을 골라 주세요", en: "Please choose a ticket" },
  cartCount: { ko: "장 선택", en: " selected" },
  pending: { ko: "고르는 중", en: "Selecting" },
  clearConfirm: { ko: "고른 승차권을 모두 지울까요?", en: "Remove all selected tickets?" },
  order: { ko: "구매하기", en: "Buy" },
  aiAdd: { ko: "AI가 골랐어요", en: "Chosen by AI" },
  stepQty: { ko: "승차권 수", en: "Tickets" },
  quantity: { ko: "승차권 수", en: "Tickets" },
  reviewTitle: { ko: "구매 내역을 확인해 주세요", en: "Please check your tickets" },
  pickMore: { ko: "승차권 더 고르기", en: "Add more tickets" },
  removeAsk: { ko: "이 승차권을 뺄까요?", en: "Remove this ticket?" },
  editOrder: { ko: "승차권 수정", en: "Change tickets" },
  orderNumber: { ko: "참조 번호", en: "Reference number" },
  pickupHint: { ko: "승차권을 받아 가세요", en: "Please take your tickets" },
  paidList: { ko: "구매 내역", en: "Your tickets" },
  idleQuestion: { ko: "계속 구매하시겠어요?", en: "Still buying?" },
  startOverAsk: { ko: "구매를 취소하고 처음으로 갈까요?", en: "Cancel and start over?" },
  keepOrdering: { ko: "계속 고르기", en: "Keep choosing" },
};

export function kt(key: KioskTextKey, locale: Locale, domain: KioskDomain = "food"): string {
  return ((domain === "ticket" && TICKET_TEXT[key]) || KIOSK_TEXT[key])[locale];
}

const LANGUAGE_NAME: Record<Locale, string> = { ko: "한국어", en: "English" };

/** Each language named in itself, as kiosks label their language buttons. */
export function languageName(locale: Locale): string {
  return LANGUAGE_NAME[locale];
}

const VARIANT_WORD: Record<Variant, Record<Locale, string>> = {
  single: { ko: "단품", en: "single" },
  set: { ko: "세트", en: "set" },
  largeSet: { ko: "라지 세트", en: "large set" },
};

/** "2/4 단계 · 사이드": the step number and the count show how many steps are left (UI_QA V12). */
export function stepLabel(step: { index: number; count: number; label: string }, locale: Locale): string {
  return locale === "ko"
    ? `${step.index}/${step.count} 단계 · ${step.label}`
    : `Step ${step.index} of ${step.count} · ${step.label}`;
}

/** "10초 후 처음 화면으로 돌아가요" */
export function backInSeconds(seconds: number, locale: Locale): string {
  return locale === "ko" ? `${seconds}초 후 처음 화면으로 돌아가요` : `Back to the start in ${seconds} s`;
}

/** "10초 후 주문 번호로 넘어가요": nobody answered the receipt question. */
export function receiptInSeconds(seconds: number, locale: Locale, domain: KioskDomain = "food"): string {
  return locale === "ko"
    ? `${seconds}초 후 ${kt("orderNumber", locale, domain)}로 넘어가요`
    : `Showing your number in ${seconds} s`;
}

/** Demo-only counter (`&demo=1`): "터치 12번 · 34초". */
export function demoCounterText(taps: number, seconds: number, locale: Locale): string {
  return locale === "ko" ? `터치 ${taps}번 · ${seconds}초` : `${taps} taps · ${seconds} s`;
}

/** "45초 남았어요" */
export function secondsLeftText(seconds: number, locale: Locale): string {
  return locale === "ko" ? `${seconds}초 남았어요` : `${seconds} s left`;
}

const AI_SUBTITLE: Record<ChangeKind, string> = {
  add: "AI added",
  update: "AI changed",
  remove: "AI removed",
  undo: "AI undid the last change",
  clear: "AI cleared the cart",
};

/**
 * KIBO's English line under the kiosk's own AI banner ("AI가 담았어요: …"), so an English reader sees what the Korean
 * kiosk just did; the kiosk itself stays Korean (it stands for an existing kiosk). `name` is the line in English.
 */
export function aiSubtitle(kind: ChangeKind, domain: KioskDomain, name: string): string {
  const ticket = domain === "ticket";
  const verb = ticket && kind === "add" ? "AI chose" : ticket && kind === "clear" ? "AI cleared the tickets" : AI_SUBTITLE[kind];
  return name ? `${verb}: ${name}` : verb;
}

export function variantWord(variant: Variant, locale: Locale): string {
  return VARIANT_WORD[variant][locale];
}
