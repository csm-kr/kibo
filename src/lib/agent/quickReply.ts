import { pt } from "@/lib/i18n/phone";
import { formatWon, lineLabel } from "@/lib/kiosk/menu";
import type { KioskData, Locale } from "@/types/menu";
import type { CartLine } from "@/types/session";
import type { toolResult } from "./mapping";

// The text agent's reply without a second model round (14-final:5). When every tool call of the first round
// succeeded and the server's results say everything there is to say, the reply is built here from those results and
// menu data, in the screens' language, from fixed sentences: no free text, so it stays grounded. Anything else (a
// failure, a choice, staff, an upsell, a learned kiosk, a question) returns null and the model writes the reply.

export interface DoneCall {
  name: string;
  args: unknown;
  outcome: Parameters<typeof toolResult>[2];
  /** The cart before this call, so a removed line can be named. */
  cartBefore: CartLine[];
}

const SIMPLE = new Set(["setDineOption", "addToCart", "updateCart", "removeFromCart", "undoLastChange", "requestCheckout", "confirmCheckout"]);

type Kind = "add" | "update" | "remove" | "undo" | "dine" | "review" | "confirm";

/** "으로" after a final consonant other than ㄹ, else "로". */
function ro(word: string): string {
  const last = word.charCodeAt(word.length - 1) - 0xac00;
  return last >= 0 && last < 11172 && last % 28 !== 0 && last % 28 !== 8 ? "으로" : "로";
}

export function quickReply(kiosk: KioskData, locale: Locale, calls: DoneCall[]): string | null {
  if (kiosk.learned || calls.length === 0) return null;
  const ticket = kiosk.domain === "ticket";
  const ko = locale === "ko";
  const count = ticket ? "장" : "개";

  const label = (l: CartLine) => {
    const { title, detail } = lineLabel(kiosk, l, locale);
    return detail ? `${title} (${detail})` : title;
  };
  const counted = (l: CartLine, qty: number) => (ko ? `${label(l)} ${qty}${count}` : `${qty} × ${label(l)}`);

  // Consecutive adds (or updates) become one sentence, as a person would say them.
  const parts: { kind: Kind; items: string[] }[] = [];
  const push = (kind: Kind, item = "") => {
    const last = parts.at(-1);
    if (last?.kind === kind && (kind === "add" || kind === "update")) last.items.push(item);
    else parts.push({ kind, items: [item] });
  };

  let total = 0;
  for (const c of calls) {
    if (!c.outcome.ok || !SIMPLE.has(c.name)) return null;
    const { response } = c.outcome;
    if (response.pending || (response.result?.upsell?.offerItemIds.length ?? 0) > 0) return null;
    total = response.total;
    const lineId = (c.args as { lineId?: unknown } | null)?.lineId;
    if (c.name === "addToCart") {
      const l = response.cart.find((x) => x.lineId === response.result?.lineId);
      if (!l) return null;
      const qty = (c.args as { qty?: unknown }).qty;
      push("add", counted(l, typeof qty === "number" && qty > 0 ? qty : 1));
    } else if (c.name === "updateCart") {
      const l = response.cart.find((x) => x.lineId === lineId);
      if (!l) return null;
      push("update", counted(l, l.qty));
    } else if (c.name === "removeFromCart") {
      const l = c.cartBefore.find((x) => x.lineId === lineId);
      if (!l) return null;
      push("remove", lineLabel(kiosk, l, locale).title);
    } else if (c.name === "setDineOption") {
      const name = response.dineOption ? kiosk.dineOptions?.[response.dineOption]?.name[locale] : undefined;
      if (!name) return null;
      push("dine", name);
    } else {
      push(c.name === "undoLastChange" ? "undo" : c.name === "requestCheckout" ? "review" : "confirm");
    }
  }

  const won = formatWon(total, locale);
  const payNow = pt("payNow", locale, kiosk.domain);
  const list = (items: string[]) => (ko ? items.join(", ") : items.join(" and "));
  const sentences = parts.map(({ kind, items }) => {
    switch (kind) {
      case "add":
        return ko ? `${list(items)} ${ticket ? "골랐어요" : "담았어요"}.` : `Added ${list(items)}.`;
      case "update":
        return ko ? `${list(items)}${ticket ? "으로" : "로"} 바꿨어요.` : `Changed to ${list(items)}.`;
      case "remove":
        return ko ? `${items[0]} 뺐어요.` : `Removed ${items[0]}.`;
      case "undo":
        return ko ? "방금 바꾼 것을 취소했어요." : "I undid the last change.";
      case "dine":
        return ko ? `${items[0]}${ro(items[0])} 할게요.` : `${items[0]}, got it.`;
      case "review":
        return ko
          ? `${ticket ? "선택한 승차권을" : "주문 내역을"} 확인해 주세요. 모두 ${won}이에요. 맞으면 "네"라고 하시거나 "${payNow}"를 눌러 주세요.`
          : `Please check your ${ticket ? "tickets" : "order"}. The total is ${won}. If it is right, say yes or tap "${payNow}".`;
      case "confirm":
        return ko ? "카드를 키오스크에 넣어 주세요." : "Please insert your card into the kiosk.";
    }
  });
  // The total after a cart change, unless the review or payment sentence already covers it.
  const changed = parts.some((p) => ["add", "update", "remove", "undo"].includes(p.kind));
  const closed = parts.some((p) => p.kind === "review" || p.kind === "confirm");
  if (changed && !closed) sentences.push(ko ? `모두 ${won}이에요.` : `Total ${won}.`);
  return sentences.join(" ");
}

// A question needs the model's answer even when the tools went through ("add a cola, is it halal").
const QUESTION_EN = /\b(what|which|how|why|when|where|who|whose|is it|is this|is that|are they|are there|does|do you have|recommend)\b/i;
const QUESTION_KO = /뭐|무엇|무슨|어디|언제|얼마|몇|왜|어떤|어떻게|어느|인가요|까요|있나요|되나요|추천/;
const OTHER_SCRIPTS = /[぀-ヿ一-鿿฀-๿À-ÖØ-öø-ɏḀ-ỿ]/;
// Typed English apart from look-alike languages in plain Latin letters (Indonesian, Spanish without accents).
const ENGLISH_WORDS =
  /\b(please|one|two|three|four|five|the|and|with|without|i|i'll|i'd|i'm|my|make|add|remove|cancel|that|this|for|of|it|both|large|small|also|too|just|take|eat|here|want|like|have|get|give|more|another|same|again|instead|change|all|yes)\b/i;

/** True when a template reply fits the message: written in the screens' language, and not asking anything. */
export function plainRequest(message: string, locale: Locale): boolean {
  if (/[?？]/.test(message) || OTHER_SCRIPTS.test(message)) return false;
  if (locale === "ko") return (message.match(/[가-힣]/g)?.length ?? 0) >= 2 && !QUESTION_KO.test(message);
  return /^[\x20-\x7e‘’“”–—…×]*$/.test(message) && ENGLISH_WORDS.test(message) && !QUESTION_EN.test(message);
}
