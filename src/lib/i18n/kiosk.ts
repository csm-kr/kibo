import type { Locale } from "@/types/menu";

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
} satisfies Record<string, Record<Locale, string>>;

export type KioskTextKey = keyof typeof KIOSK_TEXT;

export function kt(key: KioskTextKey, locale: Locale): string {
  return KIOSK_TEXT[key][locale];
}
