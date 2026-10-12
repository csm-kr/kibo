import { findItem } from "@/lib/adapters/catalog";
import type { ChoiceRef, TemplateId } from "@/lib/commands/errors";
import type { KioskData, Locale, Variant } from "@/types/menu";

// Labels and questions for choice buttons (pendingChoice). They come from menu data and fixed words,
// never from model text, so the phone can only show what the kiosk really has.

const VARIANT_LABEL: Record<Variant, Record<Locale, string>> = {
  single: { ko: "단품", en: "Single" },
  set: { ko: "세트", en: "Set" },
  largeSet: { ko: "라지 세트", en: "Large set" },
};

const YES_NO: Record<string, Record<Locale, string>> = {
  yes: { ko: "네", en: "Yes" },
  no: { ko: "아니요", en: "No" },
};

const QUESTION: Record<TemplateId, Record<Locale, string>> = {
  pick_item: { ko: "어떤 메뉴로 드릴까요?", en: "Which one would you like?" },
  pick_variant: { ko: "세트로 드릴까요?", en: "Make it a set?" },
  pick_option: { ko: "어떤 걸로 드릴까요?", en: "Which one would you like?" },
  pick_dine: { ko: "드시고 가세요, 포장하세요?", en: "Eat here or take out?" },
  yes_no: { ko: "이대로 할까요?", en: "Shall I go ahead?" },
  alternatives: { ko: "이 메뉴는 어떠세요?", en: "How about one of these?" },
  upsell: { ko: "디저트도 함께 드릴까요?", en: "Would you like a dessert too?" },
};

// A ticket machine sells tickets, not menu items.
const TICKET_QUESTION: Partial<Record<TemplateId, Record<Locale, string>>> = {
  pick_item: { ko: "어떤 승차권으로 드릴까요?", en: "Which ticket would you like?" },
  alternatives: { ko: "이 승차권은 어떠세요?", en: "How about one of these?" },
};

// pick_option for the ticket groups (data/kiosks/airport_rail.json); other groups keep the general question.
const GROUP_QUESTION: Record<string, Record<Locale, string>> = {
  passenger: { ko: "어느 승객으로 드릴까요?", en: "Who is the ticket for?" },
  seat: { ko: "어느 좌석으로 드릴까요?", en: "Window or aisle seat?" },
  top_up: { ko: "얼마를 충전할까요?", en: "How much would you like to top up?" },
};

function groupOf(k: KioskData, optionId: string): string | undefined {
  for (const item of k.items) {
    for (const group of item.optionGroups) if (group.options.some((o) => o.optionId === optionId)) return group.groupId;
  }
  return undefined;
}

/** An empty string for ids that are not in the data; the server already refuses those in offerChoices. */
export function choiceLabel(k: KioskData, choice: ChoiceRef, locale: Locale): string {
  switch (choice.kind) {
    case "item":
      return findItem(k, choice.id)?.name[locale] ?? "";
    case "option": {
      for (const item of k.items) {
        for (const group of item.optionGroups) {
          const option = group.options.find((o) => o.optionId === choice.id);
          if (option) return option.name[locale];
        }
      }
      return "";
    }
    case "variant":
      return Object.hasOwn(VARIANT_LABEL, choice.id) ? VARIANT_LABEL[choice.id as Variant][locale] : "";
    case "dine":
      return choice.id === "eat_in" || choice.id === "take_out" ? (k.dineOptions?.[choice.id].name[locale] ?? "") : "";
    case "yesno":
      return Object.hasOwn(YES_NO, choice.id) ? YES_NO[choice.id][locale] : "";
  }
}

export function choiceQuestion(
  k: KioskData,
  pending: { templateId: TemplateId; choices: ChoiceRef[] },
  locale: Locale,
): string {
  const { templateId, choices } = pending;
  if (templateId === "pick_option") {
    const first = choices.find((c) => c.kind === "option");
    const groupId = first ? groupOf(k, first.id) : undefined;
    if (groupId && Object.hasOwn(GROUP_QUESTION, groupId)) return GROUP_QUESTION[groupId][locale];
  }
  if (k.domain === "ticket") {
    const q = TICKET_QUESTION[templateId];
    if (q) return q[locale];
  }
  return QUESTION[templateId][locale];
}
