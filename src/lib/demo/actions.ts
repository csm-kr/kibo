import { findItem, groupsFor } from "@/lib/adapters/catalog";
import type { AgentAction } from "@/lib/agent/actions";
import { choiceLabel } from "@/lib/agent/choices";
import type { ChoiceRef } from "@/lib/commands/errors";
import { variantWord } from "@/lib/i18n/kiosk";
import { lineLabel } from "@/lib/kiosk/menu";
import type { KioskData, Locale, Variant } from "@/types/menu";

// Row text for /demo's "What the AI did" strip: plain words built from the action's ids and menu data, plus the
// technical name and result code. Never model text.

export interface ActionRow {
  /** "Added 2 × Cheeseburger set (Zero cola · No pickles)" */
  text: string;
  /** "addToCart ✓ 180 ms", "confirmCheckout refused (CONFLICT)" */
  tech: string;
}

type Words = Record<Locale, string>;

const REASON: Record<string, Words> = {
  NEEDS_CHOICE: { ko: "먼저 선택이 필요해요", en: "a choice is needed first" },
  SOLD_OUT: { ko: "품절이에요", en: "sold out" },
  UNAVAILABLE: { ko: "지금은 주문할 수 없어요", en: "not available right now" },
  CONFLICT: { ko: "지금은 할 수 없어요", en: "not allowed at this point" },
  RATE_LIMITED: { ko: "요청이 너무 많아요", en: "too many requests" },
  NETWORK: { ko: "연결이 끊겼어요", en: "no answer from the server" },
};
const REFUSED: Words = { ko: "서버가 거절했어요", en: "the server refused it" };
const CONFIRM_CARD: Words = { ko: "확인 카드가 필요해요", en: "the confirm card is required" };
const AN_ITEM: Words = { ko: "항목", en: "an item" };

/** What was tried, for a refusal: "Tried to add X". */
const TRIED: Record<string, (x: string, l: Locale) => string> = {
  setDineOption: (_, l) => (l === "ko" ? "먹고 갈지, 포장할지 정하려고 했어요" : "Tried to set eat here or take out"),
  addToCart: (x, l) => (l === "ko" ? `${x}을(를) 담으려고 했어요` : `Tried to add ${x}`),
  updateCart: (x, l) => (l === "ko" ? `${x}을(를) 바꾸려고 했어요` : `Tried to change ${x}`),
  removeFromCart: (x, l) => (l === "ko" ? `${x}을(를) 빼려고 했어요` : `Tried to remove ${x}`),
  undoLastChange: (_, l) => (l === "ko" ? "되돌리려고 했어요" : "Tried to undo"),
  offerChoices: (_, l) => (l === "ko" ? "선택지를 보여 주려고 했어요" : "Tried to show choices"),
  callStaff: (_, l) => (l === "ko" ? "직원을 부르려고 했어요" : "Tried to call staff"),
  requestCheckout: (_, l) => (l === "ko" ? "확인 카드를 열려고 했어요" : "Tried to open the confirm card"),
  confirmCheckout: (_, l) => (l === "ko" ? "결제하려고 했어요" : "Tried to pay"),
};
const TRIED_UNKNOWN: Words = { ko: "이 키오스크에 없는 동작을 시도했어요", en: "Tried something this kiosk does not have" };

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function itemTitle(k: KioskData, args: Record<string, unknown>, locale: Locale): string {
  const item = findItem(k, str(args.itemId));
  if (!item) return AN_ITEM[locale];
  const variant = item.variants.find((v) => v.variant === args.variant)?.variant;
  return variant && item.variants.length > 1 ? `${item.name[locale]} ${variantWord(variant, locale)}` : item.name[locale];
}

/** Option names in menu order, like the kiosk's cart chips. */
function optionDetail(k: KioskData, itemId: string, variant: Variant | undefined, selections: unknown, locale: Locale): string {
  const item = findItem(k, itemId);
  if (!item || !selections || typeof selections !== "object") return "";
  // An update does not say the line's variant: take one that has every group it changes.
  const groupIds = Object.keys(selections);
  const fits = item.variants.find((v) => groupIds.every((g) => groupsFor(item, v.variant).some((x) => x.groupId === g)));
  const line = {
    lineId: "",
    itemId,
    variant: variant ?? fits?.variant ?? item.variants[0].variant,
    qty: 1,
    selections: selections as Record<string, string[]>,
    unitPrice: 0,
  };
  return lineLabel(k, line, locale).detail;
}

function okText(k: KioskData, a: AgentAction, locale: Locale): string {
  const ko = locale === "ko";
  const args = a.args;
  switch (a.tool) {
    case "setDineOption": {
      const name = choiceLabel(k, { kind: "dine", id: str(args.option) }, locale);
      return ko ? `${name}(으)로 정했어요` : `Chose ${name}`;
    }
    case "addToCart": {
      const qty = typeof args.qty === "number" ? args.qty : 1;
      const detail = optionDetail(k, str(args.itemId), args.variant as Variant | undefined, args.selections, locale);
      const what = `${itemTitle(k, args, locale)}${detail ? ` (${detail})` : ""}`;
      if (a.pending) return ko ? `키오스크에 보냈어요: ${what} ${qty}개` : `Sent to the kiosk: ${qty} × ${what}`;
      return ko ? `${what} ${qty}개를 담았어요` : `Added ${qty} × ${what}`;
    }
    case "updateCart": {
      const name = findItem(k, str(args.itemId))?.name[locale];
      const changes = (args.changes ?? {}) as Record<string, unknown>;
      const parts: string[] = [];
      if (typeof changes.variant === "string" && findItem(k, str(args.itemId))?.variants.some((v) => v.variant === changes.variant)) {
        parts.push(variantWord(changes.variant as Variant, locale));
      }
      const detail = optionDetail(k, str(args.itemId), changes.variant as Variant | undefined, changes.selections, locale);
      if (detail) parts.push(detail);
      if (typeof changes.qty === "number") parts.push(ko ? `${changes.qty}개` : `× ${changes.qty}`);
      const target = name ?? (ko ? "담은 항목" : "a line");
      const change = parts.join(" · ");
      if (ko) return change ? `${target}을(를) 바꿨어요: ${change}` : `${target}을(를) 바꿨어요`;
      return change ? `Changed ${target}: ${change}` : `Changed ${target}`;
    }
    case "removeFromCart": {
      const name = findItem(k, str(args.itemId))?.name[locale] ?? (ko ? "담은 항목" : "a line");
      return ko ? `${name}을(를) 뺐어요` : `Removed ${name}`;
    }
    case "undoLastChange":
      return ko ? "마지막 변경을 되돌렸어요" : "Undid the last change";
    case "offerChoices": {
      const choices = Array.isArray(args.choices) ? (args.choices as ChoiceRef[]) : [];
      const labels = choices.map((c) => choiceLabel(k, c, locale)).filter(Boolean);
      const shown = labels.length > 4 ? [...labels.slice(0, 4), "…"] : labels;
      return ko ? `물어봤어요: ${shown.join(", ")}` : `Asked which one: ${shown.join(", ")}`;
    }
    case "callStaff":
      return ko ? "직원을 호출했어요" : "Called staff";
    case "requestCheckout":
      return ko ? "확인 카드를 열었어요" : "Opened the confirm card";
    case "confirmCheckout":
      return ko ? "'네'라는 답을 듣고 결제 단계로 넘겼어요" : "Moved to payment after your yes";
    default:
      return TRIED_UNKNOWN[locale];
  }
}

export function actionRow(k: KioskData, a: AgentAction, locale: Locale): ActionRow {
  if (a.code === "ok" && a.tool !== "unknown") {
    const pending = a.pending ? (locale === "ko" ? " · 키오스크가 입력 중" : " · kiosk entering it") : "";
    return { text: okText(k, a, locale), tech: `${a.tool} ✓ ${a.ms} ms${pending}` };
  }
  const tried = Object.hasOwn(TRIED, a.tool) ? TRIED[a.tool](itemTitleFor(k, a, locale), locale) : TRIED_UNKNOWN[locale];
  const reason = a.tool === "confirmCheckout" && a.code === "CONFLICT" ? CONFIRM_CARD : (REASON[a.code] ?? REFUSED);
  return { text: `${tried} → ${reason[locale]}`, tech: `${a.tool} refused (${a.code})` };
}

/** The item a refused call was about: its title for an add, its name for a line. */
function itemTitleFor(k: KioskData, a: AgentAction, locale: Locale): string {
  if (a.tool === "addToCart") return itemTitle(k, a.args, locale);
  return findItem(k, str(a.args.itemId))?.name[locale] ?? (locale === "ko" ? "담은 항목" : "a line");
}
