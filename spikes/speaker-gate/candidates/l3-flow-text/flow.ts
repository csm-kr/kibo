// The flow filter (F2, l3-flow-text): a fast Gemini text call that keeps only the words of a mixed transcript that
// continue THIS customer's flow of meaning (owner 11-26), given the dialogue state. Pure prompt and parsing here;
// the call is in run.ts.

export interface FlowState {
  lang: "en" | "ko";
  /** Item names from the menu data, in the customer's language. */
  menu: string[];
  /** What is in the cart now, as short lines. */
  cart: string[];
  /** What KIBO said last (its open question). */
  lastQuestion: string;
  /** The customer's own earlier words in this session, oldest first. */
  earlier: string[];
}

export interface FlowResult {
  text: string;
  complete: boolean;
  unsure: boolean;
}

export const FLOW_MODEL = "gemini-3.8-flash";
/** Version of the instruction below; changes go in the log. */
export const FLOW_VERSION = 1;

export const FLOW_INSTRUCTION = `You are the listening filter in front of a voice ordering assistant at a burger restaurant's self-order kiosk. The customer talks to the assistant on their phone. The phone's microphone also hears the people around them, so the transcript below can mix the customer's words with other people's: people next to them chatting, another person in the queue talking about or ordering their own food, song lyrics, announcements.

Keep only the words that continue THIS customer's flow of meaning with the assistant: words that answer the assistant's last question, add to or change this customer's own order, or are spoken to the assistant. Use the order so far and the customer's earlier words to decide what belongs to them. Drop side conversation, lyrics, announcements, and a second, different order that does not fit this customer's flow.

Copy the kept words exactly as they appear in the transcript, in the same order. Never add, correct, translate or reword anything. If nothing belongs to the customer, return an empty text.

Also answer two flags: "complete" is true when the kept words read as a finished request or answer (the customer has stopped mid-sentence otherwise); "unsure" is true when you could not tell whether some menu talk was the customer's.`;

export function flowPrompt(s: FlowState, transcript: string): string {
  return [
    `Menu items: ${s.menu.join(", ")}`,
    `Order so far: ${s.cart.length ? s.cart.join("; ") : "(empty)"}`,
    `The customer's earlier words to the assistant: ${s.earlier.length ? s.earlier.map((e) => `"${e}"`).join(" ") : "(none)"}`,
    `The assistant just said: "${s.lastQuestion}"`,
    `Language: ${s.lang === "ko" ? "Korean" : "English"}`,
    "",
    "Transcript of what the microphone heard:",
    transcript,
  ].join("\n");
}

export const FLOW_SCHEMA = {
  type: "object",
  properties: { text: { type: "string" }, complete: { type: "boolean" }, unsure: { type: "boolean" } },
  required: ["text", "complete", "unsure"],
};

/** The model's JSON; anything else keeps nothing (a filter that fails open would pass every bystander word). */
export function parseFlow(raw: string): FlowResult {
  try {
    const o = JSON.parse(raw) as Partial<FlowResult>;
    if (typeof o.text !== "string" || typeof o.complete !== "boolean" || typeof o.unsure !== "boolean") throw new Error("shape");
    return { text: o.text, complete: o.complete, unsure: o.unsure };
  } catch {
    return { text: "", complete: false, unsure: true };
  }
}
