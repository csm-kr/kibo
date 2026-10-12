import type { Locale, Variant } from "@/types/menu";

// Every kiosk string lives here, so an English kiosk (docs/ISSUE.md I-019) is a locale switch, not a rewrite.
// Wording follows real kiosks (docs/UX.md "Copy").

const KIOSK_TEXT = {
  talkTitle: { ko: "휴대폰으로 말해서 주문 (QR)", en: "Order by talking (QR)" },
  talkHint: { ko: "휴대폰 카메라로 찍으세요", en: "Scan with your phone camera" },
  qrAlt: { ko: "휴대폰으로 주문하는 QR 코드", en: "QR code to order with your phone" },
  qrLoading: { ko: "QR을 준비하고 있어요", en: "Getting the QR ready" },
  touchTitle: { ko: "화면을 눌러서 주문", en: "Order by touch" },
  touchHint: { ko: "기존 방식 그대로", en: "The usual way" },
  language: { ko: "언어", en: "Language" },
  langKo: { ko: "한국어", en: "한국어" },
  langEn: { ko: "English", en: "English" },
  comingSoon: { ko: "준비 중", en: "Coming soon" },
  largeText: { ko: "큰 글씨 · 낮은 화면", en: "Large text · lower screen" },
  dineQuestion: { ko: "매장에서 드시나요, 포장하시나요?", en: "Eat here or take out?" },
  phoneConnected: {
    ko: "휴대폰이 연결됐어요. 휴대폰에서 주문하거나 여기서 눌러도 돼요.",
    en: "Your phone is connected. Order on your phone, or tap here.",
  },
  screenSoon: { ko: "이 화면은 준비 중이에요", en: "This screen is coming soon" },
  close: { ko: "닫기", en: "Close" },
  // K3 menu
  dineChip: { ko: "매장", en: "Eat here" },
  takeOutChip: { ko: "포장", en: "Take out" },
  phoneConnectedShort: { ko: "휴대폰 연결됨", en: "Phone connected" },
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
} satisfies Record<string, Record<Locale, string>>;

export type KioskTextKey = keyof typeof KIOSK_TEXT;

export function kt(key: KioskTextKey, locale: Locale): string {
  return KIOSK_TEXT[key][locale];
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

export function variantWord(variant: Variant, locale: Locale): string {
  return VARIANT_WORD[variant][locale];
}
