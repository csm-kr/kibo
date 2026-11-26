// Texts for the multi-turn flow session (kibo-59, 11-27; modelled on spikes/crowd-voice/multi.ts): the customer
// orders in four turns with KIBO's replies in between, while bystanders talk the whole time. Two bystander flavours:
// chat (the existing small-talk clips) and menu talk: a neighbour discussing what they will eat, with items from the
// same menu, not said to the assistant. Every item named is in data/kiosks/malo.json.

import { BYSTANDER_VOICES, CUSTOMER_VOICES, type Lang, type TtsText } from "./sources";

export const FLOW_TURNS: Record<Lang, { kind: "fries" | "no" | "pay"; text: string }[]> = {
  en: [
    { kind: "fries", text: "Make both fries large, please." },
    { kind: "no", text: "No, thanks." },
    { kind: "pay", text: "That's all. I'll pay." },
  ],
  ko: [
    { kind: "fries", text: "감자튀김은 둘 다 라지로 해 주세요." },
    { kind: "no", text: "아니요, 괜찮아요." },
    { kind: "pay", text: "그게 다예요. 결제할게요." },
  ],
};

export const MENU_TALK: Record<Lang, string[]> = {
  en: [
    "I think I'll get the bulgogi burger this time. Or maybe the spicy chicken one?",
    "Their onion rings are good. Do you want to share a large fries with me?",
    "I'm getting the shrimp burger and a lemonade. What are you having?",
    "Should we get the chicken nuggets too? The six piece is enough for both of us.",
    "I always get the double cheeseburger, but today I want something lighter, maybe a wrap.",
    "Let's get two iced teas and the spicy wings to share.",
  ],
  ko: [
    "이번엔 불고기버거 먹을까? 아니면 매콤 치킨버거?",
    "여기 어니언링 맛있어. 감자튀김 라지 하나 같이 먹을래?",
    "나는 새우버거랑 레몬에이드 할래. 너는 뭐 먹을 거야?",
    "치킨너겟도 시킬까? 여섯 조각이면 둘이 먹기 충분해.",
    "나는 맨날 더블치즈버거 먹는데 오늘은 가볍게 스낵랩 먹을래.",
    "아이스티 두 잔이랑 매콤 윙 같이 먹자.",
  ],
};

const LANGS: Lang[] = ["en", "ko"];

export const FLOW_TEXTS: TtsText[] = [
  ...CUSTOMER_VOICES.flatMap((voice) => LANGS.flatMap((lang) => FLOW_TURNS[lang].map((t) => ({ role: "customer" as const, kind: t.kind, voice, lang, text: t.text })))),
  ...BYSTANDER_VOICES.flatMap((voice, i) => LANGS.map((lang) => ({ role: "bystander" as const, kind: "menu" as const, voice, lang, text: MENU_TALK[lang][i] }))),
];
