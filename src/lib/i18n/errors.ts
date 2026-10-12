import type { ErrorCode, ErrorDetail } from "@/lib/commands/errors";
import type { Locale } from "@/types/menu";

// Screens show this copy, chosen by error.code; the server's English `message` stays for the AI and logs.
// Plain words: what happened and what to do next, never the code (UX heuristic 9).

/** `NETWORK` is client-side: the request never got an answer. */
export type ScreenErrorCode = ErrorCode | "NETWORK";

const COPY: Record<ScreenErrorCode, Record<Locale, string>> = {
  BAD_REQUEST: {
    ko: "요청을 처리하지 못했어요. 다시 한 번 해 주세요.",
    en: "That didn't work. Please try once more.",
  },
  UNAUTHORIZED: {
    ko: "연결이 끊겼어요. 키오스크의 QR을 다시 찍어 주세요.",
    en: "You're no longer connected. Please scan the QR on the kiosk again.",
  },
  FORBIDDEN: {
    ko: "여기서는 할 수 없는 동작이에요. 직원을 불러 주세요.",
    en: "That can't be done here. Please call staff.",
  },
  NOT_FOUND: {
    ko: "주문을 찾을 수 없어요. 키오스크에서 다시 시작해 주세요.",
    en: "We couldn't find this order. Please start again at the kiosk.",
  },
  CONFLICT: {
    ko: "지금은 할 수 없어요. 주문 내용을 확인하고 다시 해 주세요.",
    en: "That can't be done right now. Please check your order and try again.",
  },
  GONE: {
    ko: "주문 시간이 끝났어요. 키오스크에서 다시 시작해 주세요.",
    en: "This order has ended. Please start again at the kiosk.",
  },
  NEEDS_CHOICE: {
    ko: "선택이 하나 더 필요해요. 아래에서 골라 주세요.",
    en: "One more choice is needed. Please pick one below.",
  },
  SOLD_OUT: {
    ko: "품절된 메뉴예요. 다른 메뉴를 골라 주세요.",
    en: "That item is sold out. Please pick another one.",
  },
  UNAVAILABLE: {
    ko: "지금은 주문할 수 없는 메뉴예요. 다른 메뉴를 골라 주세요.",
    en: "That item isn't available right now. Please pick another one.",
  },
  RATE_LIMITED: {
    ko: "요청이 많아요. 잠시 후 다시 해 주세요.",
    en: "Too many requests. Please try again in a moment.",
  },
  UPSTREAM: {
    ko: "음성 도우미가 잠시 응답하지 않아요. 글자로 입력해 주세요.",
    en: "The assistant isn't answering right now. Please type instead.",
  },
  INTERNAL: {
    ko: "문제가 생겼어요. 다시 해 보시고, 계속되면 직원을 불러 주세요.",
    en: "Something went wrong. Please try again, or call staff if it keeps happening.",
  },
  NETWORK: {
    ko: "인터넷 연결이 불안정해요. 잠시 후 다시 해 주세요.",
    en: "The connection is unstable. Please try again in a moment.",
  },
};

const DINE_QUESTION: Record<Locale, string> = {
  ko: "드시고 가세요, 포장하세요?",
  en: "Eat here or take out?",
};

export function errorCopy(code: ScreenErrorCode, locale: Locale, detail?: ErrorDetail): string {
  if (code === "NEEDS_CHOICE" && detail?.templateId === "pick_dine") return DINE_QUESTION[locale];
  return COPY[code][locale];
}
