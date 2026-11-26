// The benchmark's spoken texts and voices (Gemini TTS) and the project's own music. Real recorded voices come from
// public read speech (bench/prep_real.py); their texts are the corpora's own transcripts.

export type Lang = "en" | "ko";

export interface TtsText {
  role: "customer" | "bystander";
  /** hero: the hero order; enrol: the enrolment sentence; extra: another order sentence; short1/short2: a short
   *  answer; order: a rival order from the same menu; chat: small talk; yes: a yes on the order review; song: a
   *  voice-over of lyrics-like lines (stand-in for singing). The flow session (flow-sources.ts) adds fries, no and
   *  pay (the customer's later turns) and menu (a neighbour talking about their own food, not to the assistant). */
  kind: "hero" | "enrol" | "extra" | "short1" | "short2" | "order" | "chat" | "yes" | "song" | "fries" | "no" | "pay" | "menu";
  voice: string;
  lang: Lang;
  text: string;
}

export const CUSTOMER_VOICES = ["Kore", "Leda", "Zephyr", "Orus", "Achird", "Sulafat"];
export const BYSTANDER_VOICES = ["Puck", "Charon", "Fenrir", "Aoede", "Enceladus", "Despina"];

/** The hero order, word for word as the e2e fixtures (scripts/make-voice-fixtures.ts); its cart is HERO_CART. */
export const HERO = {
  en: "Two cheeseburger sets. One without pickles. Drinks zero cola and cider.",
  ko: "치즈버거 세트 두 개 주세요. 하나는 피클 빼고, 음료는 제로콜라랑 사이다로요.",
};
const ENROL = {
  en: "Hi, I'm eating here today. Let me have a look at the menu first.",
  ko: "안녕하세요, 오늘은 여기서 먹고 갈게요. 메뉴 먼저 볼게요.",
};
const EXTRA = {
  en: "Make both fries large, and add one apple pie, please.",
  ko: "감자튀김은 둘 다 라지로 하고, 애플파이 하나 추가해 주세요.",
};

const SHORT1 = { en: "Yes.", ko: "네." };
const SHORT2 = { en: "That's all.", ko: "그게 다예요." };
const YES = { en: "Yes. Yes, that's right.", ko: "네. 네, 맞아요." };

const ORDERS: Record<Lang, string[]> = {
  en: [
    "Can I get a spicy chicken burger and a large cola, please.",
    "I'll have the bulgogi burger with onion rings and a lemonade.",
    "One shrimp burger and an iced tea for me, please.",
    "Could I get six chicken nuggets and an orange juice?",
    "A double cheeseburger and a hot coffee, thanks.",
    "I want the crispy chicken burger and a chocolate sundae.",
  ],
  ko: [
    "매운 치킨버거 하나랑 콜라 큰 거 주세요.",
    "저는 새우버거 하나랑 레모네이드 주세요.",
    "불고기버거 세트에 어니언링으로 바꿔 주세요.",
    "치킨너겟 여섯 조각이랑 오렌지 주스 하나요.",
    "더블 치즈버거 하나랑 따뜻한 커피 주세요.",
    "크리스피 치킨버거랑 초코 선데이 하나 주세요.",
  ],
};
const CHATS: Record<Lang, string[]> = {
  en: [
    "So I told him we should take the later train. It is cheaper anyway.",
    "Did you see the game last night? The second half was unbelievable.",
    "My sister is moving to a new apartment next month, near the river.",
    "I think it might rain later, so I brought an umbrella just in case.",
    "The meeting ran late again, and I still have to answer all my emails.",
    "We should book the hotel soon, before the prices go up for the holiday.",
  ],
  ko: [
    "아까 회의 진짜 길었지. 점심은 뭐 먹을까?",
    "어제 경기 봤어? 후반전이 정말 대단했어.",
    "우리 언니가 다음 달에 강 근처로 이사 간대.",
    "이따 비 올 것 같아서 우산 챙겨 왔어.",
    "오늘 회의가 또 늦게 끝나서 메일 답장을 아직 못 했어.",
    "연휴 전에 호텔 빨리 예약해야 가격이 안 올라.",
  ],
};

const LANGS: Lang[] = ["en", "ko"];

export const CUSTOMER_TEXTS: TtsText[] = CUSTOMER_VOICES.flatMap((voice) =>
  LANGS.flatMap((lang) => [
    { role: "customer" as const, kind: "hero" as const, voice, lang, text: HERO[lang] },
    { role: "customer" as const, kind: "enrol" as const, voice, lang, text: ENROL[lang] },
    { role: "customer" as const, kind: "extra" as const, voice, lang, text: EXTRA[lang] },
    { role: "customer" as const, kind: "short1" as const, voice, lang, text: SHORT1[lang] },
    { role: "customer" as const, kind: "short2" as const, voice, lang, text: SHORT2[lang] },
  ]),
);

export const BYSTANDER_TEXTS: TtsText[] = BYSTANDER_VOICES.flatMap((voice, i) =>
  LANGS.flatMap((lang) => [
    { role: "bystander" as const, kind: "order" as const, voice, lang, text: ORDERS[lang][i] },
    { role: "bystander" as const, kind: "chat" as const, voice, lang, text: CHATS[lang][i] },
    { role: "bystander" as const, kind: "yes" as const, voice, lang, text: YES[lang] },
  ]),
);

/** Stand-in for singing (owner, 11-26: music with a voice in it): a TTS voice-over of lyrics-like lines, laid over
 *  the project's own score. Asked to sing, Gemini TTS read the instruction aloud (11-26), so the lines are spoken.
 *  No licensed song with vocals was used: real singing is not covered. */
export const SONG_VOICES = ["Callirrhoe", "Algenib"];
const SONG_LINES: Record<Lang, string> = {
  en: "Under the city lights we dance until the morning. Hold on, hold on, the night is young and we are free.",
  ko: "도시의 불빛 아래 우리는 아침까지 춤을 춰. 놓지 마, 놓지 마, 이 밤은 아직 길어.",
};
export const SONG_TEXTS: TtsText[] = SONG_VOICES.flatMap((voice) =>
  LANGS.map((lang) => ({ role: "bystander" as const, kind: "song" as const, voice, lang, text: SONG_LINES[lang] })),
);

export function ttsFile(t: Pick<TtsText, "voice" | "kind" | "lang">): string {
  return `${t.voice}-${t.kind}-${t.lang}.wav`;
}

/** Music the project made itself (the ads' scores). No third-party music. Paths from the repo root. */
export const MUSIC = ["videos/kibo-ad-40s/out/score.wav", "videos/malo-ad-30s/out/score.wav"];
