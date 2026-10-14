// Grounding check for agent replies (I-072), used by scripts/eval-agent.ts. A reply may describe items only
// with menu data: no invented taste, temperature or freshness words, popularity only for `best` items, and no
// food that is not on the menu. Menu names are removed before the word checks, so "Hot coffee" or
// "Crispy chicken burger" never count as descriptions.

import type { KioskData } from "@/types/menu";

const DENY = [
  "warm", "hot", "fresh", "homemade", "famous", "delicious", "tasty", "signature", "organic", "juicy", "crispy",
  "따뜻", "따끈", "뜨거운", "신선", "수제", "유명", "맛있", "시그니처", "유기농", "바삭",
];
const POPULAR = [
  "popular", "best seller", "best-seller", "bestseller", "best selling", "best-selling", "favorite", "favourite",
  "인기", "베스트", "잘 나가", "많이 찾",
];
const OFF_MENU = [
  "milkshake", "shake", "pizza", "hot dog", "hotdog", "donut", "doughnut", "waffle", "pancake",
  "쉐이크", "셰이크", "피자", "도넛", "와플", "핫도그", "팬케이크",
];

export interface GroundingResult {
  pass: boolean;
  /** Deny-list words, "off-menu:<word>" and "popular:<itemId>"; never the reply text. */
  matched: string[];
  /** Item ids the reply names. */
  mentioned: string[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Latin words need letter boundaries ("hot" is not in "shot", "milk" is not in "milkshake"), with an optional
 * plural ending; Korean words take particles, so they match as substrings.
 */
function pattern(word: string): RegExp {
  const body = escape(word);
  return new RegExp(/[a-z]/i.test(word) ? `(?<![\\p{L}\\p{N}])${body}(?:e?s)?(?![\\p{L}\\p{N}])` : body, "giu");
}

export function checkGrounding(reply: string, kiosk: KioskData): GroundingResult {
  // Longest first, so "Double cheeseburger" is removed before "Cheeseburger" could match inside it.
  const names: { text: string; itemId: string | null }[] = [];
  for (const item of kiosk.items) {
    for (const n of [item.name.ko, item.name.en]) names.push({ text: n, itemId: item.itemId });
    for (const g of item.optionGroups) for (const o of g.options) for (const n of [o.name.ko, o.name.en]) names.push({ text: n, itemId: null });
  }
  names.sort((a, b) => b.text.length - a.text.length);
  // "Your pizza" is fine on a pizza kiosk: off-menu words its own item names use do not count.
  const ownWords = OFF_MENU.filter((w) => kiosk.items.some((i) => pattern(w).test(i.name.ko) || pattern(w).test(i.name.en)));

  const deny = new Set<string>();
  const offMenu = new Set<string>();
  const popular = new Set<string>();
  const mentioned = new Set<string>();

  for (const sentence of reply.split(/[.!?。\n]+/)) {
    let rest = sentence;
    const here = new Set<string>();
    for (const n of names) {
      const re = pattern(n.text);
      if (!re.test(rest)) continue;
      rest = rest.replace(re, " ");
      if (n.itemId) here.add(n.itemId);
    }
    here.forEach((id) => mentioned.add(id));
    for (const w of DENY) if (pattern(w).test(rest)) deny.add(w);
    for (const w of OFF_MENU) if (!ownWords.includes(w) && pattern(w).test(rest)) offMenu.add(w);
    if (POPULAR.some((w) => pattern(w).test(rest))) {
      for (const id of here) if (kiosk.items.find((i) => i.itemId === id)?.badge !== "best") popular.add(id);
    }
  }

  const matched = [
    ...DENY.filter((w) => deny.has(w)),
    ...OFF_MENU.filter((w) => offMenu.has(w)).map((w) => `off-menu:${w}`),
    ...[...popular].map((id) => `popular:${id}`),
  ];
  return { pass: matched.length === 0, matched, mentioned: [...mentioned].sort() };
}

const PAY_OFFERS = [
  /\b(would|do) you (like|want) to pay\b/i,
  /\b(shall|should|can) i (pay|complete|proceed)\b/i,
  /\bi('ll| will) (pay|complete the payment)\b/i,
  /\bpay for you\b/i,
  /결제해 ?드릴/,
  /결제할까요/,
  /결제하시겠/,
  /결제를 진행할까요/,
];

/**
 * True when a reply asks whether to pay or offers to pay (I-100). On a learned kiosk the order ends at the review and
 * the user pays on the kiosk itself, so the AI may only tell them to do that.
 */
export function offersToPay(reply: string): boolean {
  return PAY_OFFERS.some((re) => re.test(reply));
}

/**
 * The app's own words for its screens, and "I am adding" about a change the tool already made (14-final:1). "Please
 * wait" alone is not here: after a staff call "잠시만 기다려 주세요" is the right reply (the first eval run flagged it).
 */
const INTERNAL: [string, RegExp][] = [
  ["confirm card", /\bconfirm(ation)? card\b/i],
  ["확인 카드", /확인 ?카드/],
  ["I am adding", /\bI(?:'m| am) adding\b/i],
  ["담는 중", /(담|추가하)고 있(어요|습니다)|(담|추가하)는 중/],
];

const IN_PROGRESS = new Set(["I am adding", "담는 중"]);

/**
 * Internal words found in a reply; the user sees "your order", never the name of a screen part. `replaying`: a learned
 * kiosk, whose changes are still being entered on its page when the AI answers, so "adding" is true there.
 */
export function internalWords(reply: string, opts: { replaying?: boolean } = {}): string[] {
  return INTERNAL.filter(([word, re]) => !(opts.replaying && IN_PROGRESS.has(word)) && re.test(reply)).map(([word]) => word);
}
