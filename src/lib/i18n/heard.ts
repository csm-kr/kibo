import type { SpeechLanguage } from "./languages";

// The phone's screens follow the language the user speaks or types (owner 10-18, I-404): an English order on a Korean
// iPhone left the review and "insert your card" in Korean. One finished utterance of the user's own words, by script
// and a few function words, no model or library; null whenever it is short, mixed or unclear, so the language stays.
// Spanish, French and Indonesian are never told apart here (the model already follows them, ownWords.ts).

const HANGUL = /[가-힣]/g;
const KANA = /[぀-ヿ]/g;
const HAN = /[㐀-䶿一-鿿]/g;
const THAI = /[฀-๿]/g;
const LATIN = /[A-Za-zÀ-ɏḀ-ỿ]/g;
// Letters only Vietnamese uses (not the â, ê, ô French also has), as in scripts/grounding.ts.
const VIETNAMESE = /[ăđơưạảặẳậẩẹẻẽệểễịỉĩọỏộổỗợởỡụủựửữũỳỵỷỹằầềồờừắấếốớứ]/giu;
// Simplified characters and words Japanese does not use, so Han-only Japanese (直通列車) is not taken for Chinese.
const CHINESE = /[我个这那吗呢们么请给张杯份和了的要点买来吧两]/;
// A one-word Korean line counts only as a sentence (콜라주세요), not as a bare name or a yes (불고기버거, 네).
const KOREAN_ENDING = /[요다까죠]$/;

// Short English function words, without the "a", "no" and "me" Spanish and French share; "set" and names are no evidence.
const ENGLISH = new Set(
  (
    "please one two three four five the and with without i i'll i'd i'm my make add remove cancel that this for of it " +
    "both large small also too just take eat here want like have get give more another same again instead change all " +
    "can could would some an to is are do need order pay on out go what how much"
  ).split(" "),
);
const OTHER_LATIN = new Set(
  (
    "el los las del y o con por para una uno quiero quisiera gracias favor sin dos tres también más sí hamburguesa papas " +
    "le les des du et avec pour je voudrais un une sans vous plaît deux trois frites merci oui " +
    "dan dengan yang untuk saya mau satu dua tiga tolong pesan tanpa ingin minta terima kasih"
  ).split(" "),
);
const ACCENTS = /[¿¡ñçáéíóúàèùâêîôûëïüœ]/gi;

const count = (text: string, re: RegExp) => text.match(re)?.length ?? 0;

/** The language of one finished utterance, or null when it is not clear. */
export function heardLanguage(text: string): SpeechLanguage | null {
  const hangul = count(text, HANGUL);
  const kana = count(text, KANA);
  const han = count(text, HAN);
  const thai = count(text, THAI);
  const latin = count(text, LATIN);
  // A Hangul, kana or Han character stands for a syllable, about two Latin or Thai letters.
  const total = 2 * (hangul + kana + han) + thai + latin;
  const most = (weight: number) => weight > total / 2;
  const tokens = text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t));

  if (hangul >= 2 && most(2 * hangul)) {
    const words = tokens.filter((t) => /[가-힣]/.test(t));
    const last = words.at(-1)?.replace(/[^가-힣]+$/, "") ?? "";
    return words.length >= 2 || KOREAN_ENDING.test(last) ? "ko" : null;
  }
  if (kana >= 2 && kana + han >= 4 && most(2 * (kana + han))) return "ja";
  if (han >= 2 && kana === 0 && most(2 * han)) return CHINESE.test(text) ? "zh" : null;
  if (thai >= 4 && most(thai)) return "th";
  if (!most(latin) || tokens.length < 3) return null;
  if (count(text, VIETNAMESE) >= 2) return "vi";
  const words = text.toLowerCase().replace(/’/g, "'").match(/[\p{L}']+/gu) ?? [];
  const english = words.filter((w) => ENGLISH.has(w)).length;
  const other = words.filter((w) => OTHER_LATIN.has(w)).length + count(text, ACCENTS);
  return english > 0 && english > other ? "en" : null;
}

const SCRIPT: Record<SpeechLanguage, string> = { ko: "hangul", ja: "kana", zh: "han", th: "thai", en: "latin", es: "latin", fr: "latin", vi: "latin", id: "latin" };

/**
 * The language to switch to after the user's own words, or null to keep the current one. Only a change of script
 * switches, so a Latin language the user chose (es, fr, vi, id) is never taken for English, and Japanese written in Han
 * only is never taken for Chinese.
 */
export function followSpeaker(current: SpeechLanguage, text: string): SpeechLanguage | null {
  const heard = heardLanguage(text);
  if (heard === null || SCRIPT[heard] === SCRIPT[current]) return null;
  if (current === "ja" && heard === "zh") return null;
  return heard;
}
