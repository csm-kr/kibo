import type { ToolResponse } from "@/lib/voice/toolRunner";

// Live asked the same question twice (I-417; 10-18 probes on the token path: 5 of 26 runs repeated a sentence): it
// speaks the question, calls offerChoices, and the answer to that call starts a new response that says it again. On
// the direct path offerChoices is NON_BLOCKING (live.ts), so its answer can be SILENT: added to the conversation
// without starting a response. Once the AI said anything since the user spoke, it is SILENT, even when what it said
// was no question: a statement-like ask ("say so if you need staff") came back word for word, and the phone's choice
// card shows the question anyway (Choices.tsx). WHEN_IDLE (the default) starts one response, to ask once.

export type Scheduling = "SILENT" | "WHEN_IDLE";

export interface Heard {
  /** What the AI said aloud since the user last spoke. */
  said: string;
  /** Every call of the model response this offer came in; any other call's answer starts the response that speaks. */
  calls: string[];
}

export function offerScheduling(response: object, heard: Heard): Scheduling {
  const r = response as { ok?: unknown; buttons?: unknown };
  // A refusal needs the model to fix its call or say why.
  if (r.ok !== true) return "WHEN_IDLE";
  if (r.buttons === "alreadyShown") return "SILENT";
  if (heard.calls.some((n) => n !== "offerChoices")) return "SILENT";
  return heard.said.trim() ? "SILENT" : "WHEN_IDLE";
}

export function scheduleOffers(responses: ToolResponse[], heard: Heard): (ToolResponse & { scheduling?: Scheduling })[] {
  return responses.map((x) => (x.name === "offerChoices" ? { ...x, scheduling: offerScheduling(x.response, heard) } : x));
}
