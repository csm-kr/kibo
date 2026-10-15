import type { ChoiceRef } from "@/lib/commands/errors";
import { lt, type SpeechLanguage } from "@/lib/i18n/languages";
import { formatWon, lineLabel } from "@/lib/kiosk/menu";
import type { KioskData, Locale } from "@/types/menu";
import type { CartLine } from "@/types/session";
import type { toolResult } from "./mapping";

// The text agent's reply without a second model round (14-final:5). When every tool call of the first round
// succeeded and the server's results say everything there is to say, the reply is built here from those results and
// menu data, in Korean or English (the user's, else the screens' language), from fixed sentences: no free text, so it stays grounded. Anything else (a
// failure, a choice, staff, an upsell, a learned kiosk, a question) returns null and the model writes the reply.

export interface DoneCall {
  name: string;
  args: unknown;
  outcome: Parameters<typeof toolResult>[2];
  /** The cart before this call, so a removed line can be named. */
  cartBefore: CartLine[];
}

const SIMPLE = new Set(["setDineOption", "addToCart", "updateCart", "removeFromCart", "undoLastChange", "requestCheckout", "confirmCheckout"]);

type Kind = "add" | "update" | "remove" | "undo" | "dine" | "review" | "confirm" | "staff" | "entering";

/** Hangul syllable with a final consonant; `exceptRieul` treats a final ㄹ as none (for 로/으로). */
function hasFinal(word: string, exceptRieul = false): boolean {
  const last = word.charCodeAt(word.length - 1) - 0xac00;
  return last >= 0 && last < 11172 && last % 28 !== 0 && !(exceptRieul && last % 28 === 8);
}

/** "으로" after a final consonant other than ㄹ, else "로". */
const ro = (word: string) => (hasFinal(word, true) ? "으로" : "로");

/**
 * `locale`: the language of the sentences, which may differ from the screens' (a Korean user on English screens,
 * 16-judge-r3-fixes:0). `buttons`: the language the phone's buttons are in, so the review names [Yes, pay now] as shown.
 */
export function quickReply(kiosk: KioskData, locale: Locale, calls: DoneCall[], buttons: SpeechLanguage = locale): string | null {
  if (kiosk.learned || calls.length === 0) return null;
  return sentencesFor(kiosk, locale, calls, true, buttons)?.join(" ") ?? null;
}

/**
 * The reply when the model wrote none after changing something, or ran out of time (15-judge-fixes:0): the same fixed
 * sentences for every applied call, failures left out, then `question` (the open choice's question). A user who sees
 * "Sorry, could you say that again?" after a change repeats the order and gets it twice. Null when there is nothing to say.
 */
export function summaryReply(
  kiosk: KioskData,
  locale: Locale,
  calls: DoneCall[],
  question: string | null,
  buttons: SpeechLanguage = locale,
): string | null {
  const sentences = [...(sentencesFor(kiosk, locale, calls, false, buttons) ?? []), ...(question ? [question] : [])];
  return sentences.length > 0 ? sentences.join(" ") : null;
}

/**
 * `strict` (quickReply): null unless every call is a plain applied change the sentences cover. Otherwise failures,
 * choices and lines the result does not hold are skipped, and staff calls and running replays get their own sentence.
 */
function sentencesFor(kiosk: KioskData, locale: Locale, calls: DoneCall[], strict: boolean, buttons: SpeechLanguage): string[] | null {
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
    if (!c.outcome.ok) {
      if (strict) return null;
      continue;
    }
    const { response } = c.outcome;
    if (strict && (!SIMPLE.has(c.name) || response.pending || (response.result?.upsell?.offerItemIds.length ?? 0) > 0)) return null;
    // A learned kiosk's change is still being replayed: its result holds the cart from before it.
    if (response.pending) {
      if (parts.at(-1)?.kind !== "entering") push("entering");
      continue;
    }
    if (c.name === "callStaff") {
      push("staff");
      continue;
    }
    // offerChoices: the caller ends the reply with its question.
    if (!SIMPLE.has(c.name)) continue;
    const lineId = (c.args as { lineId?: unknown } | null)?.lineId;
    let said: [Kind, string?] | null;
    if (c.name === "addToCart") {
      const l = response.cart.find((x) => x.lineId === response.result?.lineId);
      const qty = (c.args as { qty?: unknown }).qty;
      said = l ? ["add", counted(l, typeof qty === "number" && qty > 0 ? qty : 1)] : null;
    } else if (c.name === "updateCart") {
      const l = response.cart.find((x) => x.lineId === lineId);
      said = l ? ["update", counted(l, l.qty)] : null;
    } else if (c.name === "removeFromCart") {
      const l = c.cartBefore.find((x) => x.lineId === lineId);
      said = l ? ["remove", lineLabel(kiosk, l, locale).title] : null;
    } else if (c.name === "setDineOption") {
      const name = response.dineOption ? kiosk.dineOptions?.[response.dineOption]?.name[locale] : undefined;
      said = name ? ["dine", name] : null;
    } else {
      said = [c.name === "undoLastChange" ? "undo" : c.name === "requestCheckout" ? "review" : "confirm"];
    }
    // A line the result does not hold cannot be named from data: quickReply leaves it to the model, a summary skips it.
    if (!said) {
      if (strict) return null;
      continue;
    }
    push(...said);
    total = response.total;
  }

  const won = formatWon(total, locale);
  const payNow = lt("payNow", buttons, kiosk.domain);
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
      case "review": {
        // A learned order ends at the review: the user pays on the kiosk itself (I-100).
        const checkout = kiosk.learned?.checkout.name;
        if (checkout) {
          return ko
            ? `주문 내역을 확인하고 키오스크에서 ${checkout.ko}${hasFinal(checkout.ko) ? "을" : "를"} 눌러 결제해 주세요.`
            : `Please check your order, then tap ${checkout.ko} (${checkout.en}) on the kiosk and pay there.`;
        }
        return ko
          ? `${ticket ? "선택한 승차권을" : "주문 내역을"} 확인해 주세요. 모두 ${won}이에요. 맞으면 "네"라고 하시거나 "${payNow}"를 눌러 주세요.`
          : `Please check your ${ticket ? "tickets" : "order"}. The total is ${won}. If it is right, say yes or tap "${payNow}".`;
      }
      case "confirm":
        return ko ? "카드를 키오스크에 넣어 주세요." : "Please insert your card into the kiosk.";
      case "staff":
        return ko ? "직원을 불렀어요. 곧 도와드릴 거예요." : "I've called staff. Someone will come to help you.";
      case "entering":
        return ko ? "키오스크에 입력하고 있어요." : "The kiosk is entering it now.";
    }
  });
  // The total after a cart change, unless the review or payment sentence already covers it.
  const changed = parts.some((p) => ["add", "update", "remove", "undo"].includes(p.kind));
  const closed = parts.some((p) => p.kind === "review" || p.kind === "confirm");
  if (changed && !closed) sentences.push(ko ? `모두 ${won}이에요.` : `Total ${won}.`);
  return sentences;
}

/**
 * What to offer when the model said nothing and nothing happened (15-judge-fixes:0): one line naming what this kiosk
 * sells (its category names) and up to 3 items that can be ordered at any hour, best sellers first, then the first
 * item of each category. Data only, so the buttons are real.
 */
export function introOffer(kiosk: KioskData, locale: Locale): { line: string; choices: ChoiceRef[] } {
  const orderable = kiosk.items.filter((i) => !i.soldOut && !i.availableHours);
  const picks = [
    ...orderable.filter((i) => i.badge === "best"),
    ...kiosk.categories.flatMap((c) => orderable.find((i) => i.category === c.categoryId) ?? []),
  ];
  const choices = [...new Set(picks.map((i) => i.itemId))].slice(0, 3).map((id) => ({ kind: "item" as const, id }));
  const names = kiosk.categories.map((c) => c.name[locale]);
  const ticket = kiosk.domain === "ticket";
  if (locale === "ko") {
    const list = names.join(", ");
    const eul = hasFinal(list) ? "을" : "를";
    return { line: ticket ? `이 기계에서는 ${list}${eul} 살 수 있어요.` : `여기서는 ${list}${eul} 주문할 수 있어요.`, choices };
  }
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
  return { line: ticket ? `This machine sells ${list}.` : `Here you can order ${list}.`, choices };
}

// A question needs the model's answer even when the tools went through ("add a cola, is it halal").
const QUESTION_EN = /\b(what|which|how|why|when|where|who|whose|is it|is this|is that|are they|are there|does|do you have|recommend)\b/i;
const QUESTION_KO = /뭐|무엇|무슨|어디|언제|얼마|몇|왜|어떤|어떻게|어느|인가요|까요|있나요|되나요|추천/;
const OTHER_SCRIPTS = /[぀-ヿ一-鿿฀-๿À-ÖØ-öø-ɏḀ-ỿ]/;
// Typed English apart from look-alike languages in plain Latin letters (Indonesian, Spanish without accents).
const ENGLISH_WORDS =
  /\b(please|one|two|three|four|five|the|and|with|without|i|i'll|i'd|i'm|my|make|add|remove|cancel|that|this|for|of|it|both|large|small|also|too|just|take|eat|here|want|like|have|get|give|more|another|same|again|instead|change|all|yes)\b/i;

/** True when the message is written in the screens' language, the only languages the fixed sentences have. */
export function inScreensLanguage(message: string, locale: Locale): boolean {
  if (OTHER_SCRIPTS.test(message)) return false;
  if (locale === "ko") return (message.match(/[가-힣]/g)?.length ?? 0) >= 2;
  return /^[\x20-\x7e‘’“”–—…×]*$/.test(message) && ENGLISH_WORDS.test(message);
}

/** True when a template reply fits the message: written in the screens' language, and not asking anything. */
export function plainRequest(message: string, locale: Locale): boolean {
  if (/[?？]/.test(message) || !inScreensLanguage(message, locale)) return false;
  return locale === "ko" ? !QUESTION_KO.test(message) : !QUESTION_EN.test(message);
}
