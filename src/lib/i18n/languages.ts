import type { KioskDomain, Locale } from "@/types/menu";
import { pt, type PhoneTextKey } from "./phone";

// The languages the phone's AI speaks (14-final:4). The screens stay Korean or English; for every other language the
// AI talks and writes in it, and only the handful of strings a first-time user must read are translated (AI_TEXT).
// Live codes: each was accepted by gemini-3.8-live on the Gemini API and on Vertex AI us-central1, which replied in
// that language to a typed turn on 10-14 (evidence/live-languages.json). Spoken input in these languages is untested.

export const SPEECH_LANGUAGES = ["ko", "en", "ja", "zh", "es", "vi", "fr", "th", "id"] as const;
export type SpeechLanguage = (typeof SPEECH_LANGUAGES)[number];
type AiOnlyLanguage = Exclude<SpeechLanguage, "ko" | "en">;

export const LANGUAGES: Record<SpeechLanguage, { native: string; english: string; liveCode: string }> = {
  ko: { native: "한국어", english: "Korean", liveCode: "ko-KR" },
  en: { native: "English", english: "English", liveCode: "en-US" },
  ja: { native: "日本語", english: "Japanese", liveCode: "ja-JP" },
  zh: { native: "中文(简体)", english: "Chinese (Simplified)", liveCode: "cmn-CN" },
  es: { native: "Español", english: "Spanish", liveCode: "es-ES" },
  vi: { native: "Tiếng Việt", english: "Vietnamese", liveCode: "vi-VN" },
  fr: { native: "Français", english: "French", liveCode: "fr-FR" },
  th: { native: "ไทย", english: "Thai", liveCode: "th-TH" },
  id: { native: "Bahasa Indonesia", english: "Indonesian", liveCode: "id-ID" },
};

export const isSpeechLanguage = (v: unknown): v is SpeechLanguage => SPEECH_LANGUAGES.includes(v as SpeechLanguage);

/** The screens' language: Korean for Korean, English for everyone else. */
export const uiLocale = (language: SpeechLanguage): Locale => (language === "ko" ? "ko" : "en");

/** The AI speaks it, the screens do not. */
export const aiOnly = (language: SpeechLanguage): language is AiOnlyLanguage => language !== "ko" && language !== "en";

/** The mic label, the review's two buttons, "insert your card into the kiosk", the order number (P3–P6) and the greeting. */
const AI_TEXT = {
  // Short: Japanese and Chinese wrap between any two characters, and the mic's label column is ~120px at 320 wide.
  micTap: { ja: "タップして開始", zh: "点击开始", es: "Toca para empezar", vi: "Chạm để bắt đầu", fr: "Touchez pour démarrer", th: "แตะเพื่อเริ่ม", id: "Ketuk untuk mulai" },
  micWait: { ja: "少々お待ちください", zh: "请稍候", es: "Un momento", vi: "Chờ một chút", fr: "Un instant", th: "รอสักครู่", id: "Tunggu sebentar" },
  micHold: { ja: "押しながら話す", zh: "按住说话", es: "Mantén para hablar", vi: "Giữ để nói", fr: "Maintenez pour parler", th: "กดค้างเพื่อพูด", id: "Tahan untuk bicara" },
  micRelease: { ja: "離すと送信", zh: "松开发送", es: "Suelta para enviar", vi: "Thả để gửi", fr: "Relâchez pour envoyer", th: "ปล่อยเพื่อส่ง", id: "Lepas untuk kirim" },
  sayYes: {
    ja: "「はい」と言ってもOKです。",
    zh: "也可以说“是”。",
    es: "También puedes decir sí.",
    vi: "Bạn cũng có thể nói vâng.",
    fr: "Vous pouvez aussi dire oui.",
    th: "พูดว่า ใช่ ก็ได้",
    id: "Anda juga bisa bilang ya.",
  },
  payNow: { ja: "はい、支払います", zh: "是的，去付款", es: "Sí, pagar ahora", vi: "Vâng, thanh toán", fr: "Oui, payer", th: "ใช่ ชำระเงิน", id: "Ya, bayar sekarang" },
  pickMore: { ja: "もっと選ぶ", zh: "再选一些", es: "Elegir más", vi: "Chọn thêm", fr: "Ajouter autre chose", th: "เลือกเพิ่ม", id: "Pilih lagi" },
  payTitle: {
    ja: "キオスクにカードを入れてください",
    zh: "请把银行卡插入自助机",
    es: "Introduce tu tarjeta en el quiosco",
    vi: "Hãy đưa thẻ vào máy kiosk",
    fr: "Insérez votre carte dans la borne",
    th: "เสียบบัตรที่เครื่องคีออส",
    id: "Masukkan kartu Anda ke kios",
  },
  orderNumber: { ja: "注文番号", zh: "订单号", es: "Número de pedido", vi: "Số đơn hàng", fr: "Numéro de commande", th: "หมายเลขคำสั่งซื้อ", id: "Nomor pesanan" },
  referenceNumber: { ja: "参照番号", zh: "参考号", es: "Número de referencia", vi: "Số tham chiếu", fr: "Numéro de référence", th: "หมายเลขอ้างอิง", id: "Nomor referensi" },
  // The AI's first line when voice opens or typing starts (owner 10-17), in the language it speaks.
  greeting: {
    ja: "こんにちは！何にしますか？話すだけで大丈夫です。",
    zh: "您好！您想要什么？直接说就可以。",
    es: "¡Hola! ¿Qué desea? Solo dígalo.",
    vi: "Xin chào! Bạn muốn gì? Cứ nói là được.",
    fr: "Bonjour ! Que désirez-vous ? Dites-le simplement.",
    th: "สวัสดี ต้องการอะไร พูดบอกได้เลย",
    id: "Halo! Mau pesan apa? Cukup ucapkan saja.",
  },
  greetingDine: {
    ja: "こんにちは！店内でお召し上がりですか、お持ち帰りですか？",
    zh: "您好！在这里吃还是带走？",
    es: "¡Hola! ¿Para comer aquí o para llevar?",
    vi: "Xin chào! Bạn ăn tại đây hay mang đi?",
    fr: "Bonjour ! Sur place ou à emporter ?",
    th: "สวัสดี ทานที่นี่หรือรับกลับบ้าน",
    id: "Halo! Makan di sini atau dibawa pulang?",
  },
  greetingHold: {
    ja: "マイクのボタンを押しながら話してください。",
    zh: "请按住麦克风按钮说话。",
    es: "Mantenga pulsado el botón del micrófono mientras habla.",
    vi: "Hãy giữ nút micro trong khi nói.",
    fr: "Maintenez le bouton du micro pendant que vous parlez.",
    th: "กดปุ่มไมค์ค้างไว้ขณะพูด",
    id: "Tahan tombol mikrofon saat berbicara.",
  },
} satisfies Partial<Record<PhoneTextKey, Record<AiOnlyLanguage, string>>>;

export const AI_ONLY_KEYS = Object.keys(AI_TEXT) as (keyof typeof AI_TEXT)[];

/** A phone string in the AI language where it is translated, else the phone's Korean or English copy. */
export function lt(key: PhoneTextKey, language: SpeechLanguage, domain?: KioskDomain): string {
  if (aiOnly(language) && key in AI_TEXT) return AI_TEXT[key as keyof typeof AI_TEXT][language];
  return pt(key, uiLocale(language), domain);
}
