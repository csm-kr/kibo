import { findItem } from "@/lib/adapters/catalog";
import type { ChoiceRef, TemplateId } from "@/lib/commands/errors";
import { aiOnly, SPEECH_LANGUAGES, type SpeechLanguage } from "@/lib/i18n/languages";
import { formatWon, tilePrice } from "@/lib/kiosk/menu";
import type { KioskData, Locale, Variant } from "@/types/menu";

// Labels and questions for choice buttons (pendingChoice). They come from menu data and fixed words,
// never from model text, so the phone can only show what the kiosk really has.

// Each fixed text in every AI language (16-judge-r3-fixes:0): with the picker on Japanese the phone shows the question
// and these labels in Japanese. Item and option names stay as the menu data has them. The server keeps the screens'
// locale (the instructions, its own replies); only the phone passes `language`.
type Text = Record<SpeechLanguage, string>;

const VARIANT_LABEL: Record<Variant, Text> = {
  single: { ko: "단품", en: "Single", ja: "単品", zh: "单点", es: "Solo", vi: "Món lẻ", fr: "Seul", th: "เดี่ยว", id: "Satuan" },
  set: { ko: "세트", en: "Set", ja: "セット", zh: "套餐", es: "Menú", vi: "Combo", fr: "Menu", th: "ชุด", id: "Paket" },
  largeSet: { ko: "라지 세트", en: "Large set", ja: "Lセット", zh: "大份套餐", es: "Menú grande", vi: "Combo lớn", fr: "Grand menu", th: "ชุดใหญ่", id: "Paket besar" },
};

const YES_NO: Record<string, Text> = {
  yes: { ko: "네", en: "Yes", ja: "はい", zh: "是", es: "Sí", vi: "Vâng", fr: "Oui", th: "ใช่", id: "Ya" },
  no: { ko: "아니요", en: "No", ja: "いいえ", zh: "不用", es: "No", vi: "Không", fr: "Non", th: "ไม่", id: "Tidak" },
};

/** The header's staff button in the same words. */
const STAFF: Text = {
  ko: "직원 호출",
  en: "Call staff",
  ja: "スタッフを呼ぶ",
  zh: "呼叫店员",
  es: "Llamar al personal",
  vi: "Gọi nhân viên",
  fr: "Appeler le personnel",
  th: "เรียกพนักงาน",
  id: "Panggil staf",
};

const QUESTION: Record<TemplateId, Text> = {
  pick_item: { ko: "어떤 메뉴로 드릴까요?", en: "Which one would you like?", ja: "どれにしますか？", zh: "您要哪一个？", es: "¿Cuál quiere?", vi: "Bạn muốn món nào?", fr: "Lequel voulez-vous ?", th: "ต้องการอันไหน", id: "Mau yang mana?" },
  pick_variant: { ko: "세트로 드릴까요?", en: "Make it a set?", ja: "セットにしますか？", zh: "要做成套餐吗？", es: "¿Lo quiere en menú?", vi: "Bạn có lấy combo không?", fr: "En menu ?", th: "รับเป็นชุดไหม", id: "Mau dibuat paket?" },
  pick_option: { ko: "어떤 걸로 드릴까요?", en: "Which one would you like?", ja: "どれにしますか？", zh: "您要哪一种？", es: "¿Cuál prefiere?", vi: "Bạn chọn loại nào?", fr: "Lequel préférez-vous ?", th: "เลือกแบบไหน", id: "Pilih yang mana?" },
  pick_dine: {
    ko: "드시고 가세요, 포장하세요?",
    en: "Eat here or take out?",
    ja: "店内で食べますか、持ち帰りますか？",
    zh: "在这里吃还是带走？",
    es: "¿Para comer aquí o para llevar?",
    vi: "Ăn tại chỗ hay mang đi?",
    fr: "Sur place ou à emporter ?",
    th: "ทานที่นี่หรือกลับบ้าน",
    id: "Makan di sini atau dibawa pulang?",
  },
  yes_no: { ko: "이대로 할까요?", en: "Shall I go ahead?", ja: "このまま進めますか？", zh: "就这样可以吗？", es: "¿Sigo así?", vi: "Tôi làm như vậy nhé?", fr: "Je continue ainsi ?", th: "ทำแบบนี้เลยไหม", id: "Lanjut seperti ini?" },
  alternatives: { ko: "이 메뉴는 어떠세요?", en: "How about one of these?", ja: "こちらはいかがですか？", zh: "这些怎么样？", es: "¿Qué tal uno de estos?", vi: "Bạn xem những món này nhé?", fr: "Et l'un de ceux-ci ?", th: "ลองอันนี้ไหม", id: "Bagaimana kalau salah satu ini?" },
  upsell: {
    ko: "디저트도 함께 드릴까요?",
    en: "Would you like a dessert too?",
    ja: "デザートもいかがですか？",
    zh: "要不要再来份甜点？",
    es: "¿Quiere también un postre?",
    vi: "Bạn có muốn thêm món tráng miệng?",
    fr: "Un dessert avec ça ?",
    th: "รับของหวานด้วยไหม",
    id: "Mau tambah makanan penutup?",
  },
  ask_staff: {
    ko: "직원에게 확인해 드릴까요?",
    en: "Shall I call staff to check for you?",
    ja: "スタッフに確認してもらいましょうか？",
    zh: "要请店员帮您确认吗？",
    es: "¿Llamo al personal para que lo compruebe?",
    vi: "Tôi gọi nhân viên kiểm tra giúp bạn nhé?",
    fr: "J'appelle le personnel pour vérifier ?",
    th: "ให้เรียกพนักงานมาตรวจสอบให้ไหม",
    id: "Mau saya panggilkan staf untuk memastikan?",
  },
};

// A ticket machine sells tickets, not menu items.
const TICKET_QUESTION: Partial<Record<TemplateId, Text>> = {
  pick_item: { ko: "어떤 승차권으로 드릴까요?", en: "Which ticket would you like?", ja: "どの乗車券にしますか？", zh: "您要哪张车票？", es: "¿Qué billete quiere?", vi: "Bạn muốn vé nào?", fr: "Quel billet voulez-vous ?", th: "ต้องการตั๋วใบไหน", id: "Mau tiket yang mana?" },
  alternatives: { ko: "이 승차권은 어떠세요?", en: "How about one of these?", ja: "こちらの乗車券はいかがですか？", zh: "这些车票怎么样？", es: "¿Qué tal uno de estos billetes?", vi: "Bạn xem các vé này nhé?", fr: "Et l'un de ces billets ?", th: "ลองตั๋วเหล่านี้ไหม", id: "Bagaimana kalau salah satu tiket ini?" },
};

// pick_option for the ticket groups (data/kiosks/airport_rail.json); other groups keep the general question.
const GROUP_QUESTION: Record<string, Text> = {
  passenger: { ko: "어느 승객으로 드릴까요?", en: "Who is the ticket for?", ja: "どなたの乗車券ですか？", zh: "车票是给谁的？", es: "¿Para quién es el billete?", vi: "Vé này cho ai?", fr: "Pour qui est le billet ?", th: "ตั๋วนี้สำหรับใคร", id: "Tiket ini untuk siapa?" },
  seat: { ko: "어느 좌석으로 드릴까요?", en: "Window or aisle seat?", ja: "窓側と通路側、どちらにしますか？", zh: "靠窗还是靠过道？", es: "¿Ventanilla o pasillo?", vi: "Ghế cửa sổ hay lối đi?", fr: "Côté fenêtre ou couloir ?", th: "ริมหน้าต่างหรือริมทางเดิน", id: "Kursi jendela atau lorong?" },
  top_up: { ko: "얼마를 충전할까요?", en: "How much would you like to top up?", ja: "いくらチャージしますか？", zh: "要充值多少？", es: "¿Cuánto quiere recargar?", vi: "Bạn muốn nạp bao nhiêu?", fr: "Combien voulez-vous recharger ?", th: "ต้องการเติมเงินเท่าไหร่", id: "Mau isi ulang berapa?" },
};

const NO_THANKS: Text = { ko: "괜찮아요", en: "No thanks", ja: "いりません", zh: "不用了", es: "No, gracias", vi: "Không, cảm ơn", fr: "Non merci", th: "ไม่เป็นไร", id: "Tidak, terima kasih" };

const DECLINE: Partial<Record<TemplateId, Text>> = { upsell: NO_THANKS, ask_staff: NO_THANKS };

/** The AI language's text where the picker chose one the screens do not have, else the screens' locale. */
const pick = (text: Text, locale: Locale, language?: SpeechLanguage) => text[language && aiOnly(language) ? language : locale];

/** Every fixed button label in every language: a message equal to one is a tap, not the user's own words. */
export const FIXED_LABELS: ReadonlySet<string> = new Set(
  [...Object.values(VARIANT_LABEL), ...Object.values(YES_NO), STAFF, ...Object.values(DECLINE)].flatMap((t) => SPEECH_LANGUAGES.map((l) => t[l])),
);

function groupOf(k: KioskData, optionId: string): string | undefined {
  for (const item of k.items) {
    for (const group of item.optionGroups) if (group.options.some((o) => o.optionId === optionId)) return group.groupId;
  }
  return undefined;
}

/** An empty string for ids that are not in the data; the server already refuses those in offerChoices. */
export function choiceLabel(k: KioskData, choice: ChoiceRef, locale: Locale, language?: SpeechLanguage): string {
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
      return Object.hasOwn(VARIANT_LABEL, choice.id) ? pick(VARIANT_LABEL[choice.id as Variant], locale, language) : "";
    case "dine":
      return choice.id === "eat_in" || choice.id === "take_out" ? (k.dineOptions?.[choice.id].name[locale] ?? "") : "";
    case "yesno":
      return Object.hasOwn(YES_NO, choice.id) ? pick(YES_NO[choice.id], locale, language) : "";
    case "staff":
      return choice.id === "staff" ? pick(STAFF, locale, language) : "";
  }
}

/** Fixed words (not menu data), so they follow the AI language on the phone. */
export const fixedChoice = (choice: ChoiceRef) => choice.kind === "variant" || choice.kind === "yesno" || choice.kind === "staff";

/**
 * The price beside a choice button, from menu data: an item's tile price, or what an option adds. Null where the
 * button cannot know it (a variant or a fare discount belongs to an item the choice does not name) or it adds nothing.
 */
export function choicePrice(k: KioskData, choice: ChoiceRef, locale: Locale): string | null {
  if (choice.kind === "item") {
    const item = findItem(k, choice.id);
    return item ? formatWon(tilePrice(item), locale) : null;
  }
  if (choice.kind !== "option") return null;
  for (const item of k.items) {
    for (const group of item.optionGroups) {
      const option = group.options.find((o) => o.optionId === choice.id);
      if (option) return option.priceDelta > 0 ? `+${formatWon(option.priceDelta, locale)}` : null;
    }
  }
  return null;
}

/** An offer the user may simply turn down gets its own decline button (heuristic 3); a question needs an answer. */
export function declineLabel(templateId: TemplateId, locale: Locale, language?: SpeechLanguage): string | null {
  const text = DECLINE[templateId];
  return text ? pick(text, locale, language) : null;
}

export function choiceQuestion(
  k: KioskData,
  pending: { templateId: TemplateId; choices: ChoiceRef[] },
  locale: Locale,
  language?: SpeechLanguage,
): string {
  const { templateId, choices } = pending;
  if (templateId === "pick_option") {
    const first = choices.find((c) => c.kind === "option");
    const groupId = first ? groupOf(k, first.id) : undefined;
    if (groupId && Object.hasOwn(GROUP_QUESTION, groupId)) return pick(GROUP_QUESTION[groupId], locale, language);
  }
  if (k.domain === "ticket") {
    const q = TICKET_QUESTION[templateId];
    if (q) return pick(q, locale, language);
  }
  return pick(QUESTION[templateId], locale, language);
}
