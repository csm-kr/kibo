import { z } from "zod";
import { getKiosk } from "@/lib/adapters/catalog";
import { CommandError } from "@/lib/commands/errors";
import { sessionId } from "@/lib/commands/schemas";
import { kstDay, type UsageStore } from "@/lib/limits/usage";
import { bumpSessionCounter, runCommand } from "@/lib/session/service";
import type { SessionStore } from "@/lib/store/types";
import type { CartLine, SessionStatus } from "@/types/session";
import { buildInstructions } from "./instructions";
import { toolCallToCommand, toolResult } from "./mapping";
import type { ModelClient, ModelTurn } from "./model";
import { toolDeclarations } from "./tools";

// The text agent (POST /api/chat): a Gemini function-calling loop over the same commands the phone sends.
// One request is one user utterance. The conversation lives on the phone; nothing of it is stored or logged here.

export const chatRequest = z.strictObject({
  sessionId,
  chatRequestId: z.uuid(),
  message: z.string().min(1).max(500),
  // Text turns only: a tool turn from the browser could fake a function result.
  history: z.array(z.strictObject({ role: z.enum(["user", "model"]), text: z.string().max(1000) })).max(10),
  utteranceSeq: z.number().int().min(0),
  cartVersion: z.number().int().min(0).optional(),
  locale: z.enum(["ko", "en"]),
});

export type ChatInput = z.infer<typeof chatRequest> & { bearer: string | null };

export interface ChatDeps {
  store: SessionStore;
  model: ModelClient;
  usage: UsageStore;
  now: () => number;
}

export interface ChatResponse {
  reply: string;
  status: SessionStatus;
  cart: CartLine[];
  total: number;
  cartVersion: number;
}

const MAX_ROUNDS = 5;
const SESSION_LIMIT = 60;
const DEMO_SESSION_LIMIT = 30;
const DAILY_LIMIT = 3000;
const LIMITED = "You've reached the message limit for this order. Please use the buttons.";
const FALLBACK = "Sorry, could you say that again?";
const CONFIRM_ON_CARD = "Please confirm on the card.";

type Outcome = Parameters<typeof toolResult>[2];

export async function runChat(deps: ChatDeps, input: ChatInput): Promise<ChatResponse> {
  const { store, model, usage, now } = deps;
  const known = await store.get(input.sessionId);
  if (!known) throw new CommandError("NOT_FOUND", "This order could not be found.");
  const limit = known.demo ? DEMO_SESSION_LIMIT : SESSION_LIMIT;
  const { allowed, session } = await bumpSessionCounter(
    store,
    { sessionId: input.sessionId, bearer: input.bearer, field: "chatCount", limit },
    now(),
  );
  if (!allowed || !(await usage.bump(kstDay(now()), "chatMessages", DAILY_LIMIT))) {
    throw new CommandError("RATE_LIMITED", LIMITED);
  }

  const kiosk = getKiosk(session.kioskId);
  const system = buildInstructions(kiosk, {
    cart: session.cart,
    status: session.status,
    dineOption: session.dineOption,
    locale: input.locale,
  });
  const declarations = toolDeclarations(kiosk);
  const tools = [{ functionDeclarations: declarations }];
  // A made-up tool name is model text, so only declared names are logged.
  const toolNames = new Set(declarations.map((d) => d.name));
  const contents: ModelTurn[] = [
    ...input.history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: "user", parts: [{ text: input.message }] },
  ];

  let n = 0;
  const execute = async (name: string, args: unknown): Promise<Outcome> => {
    const commandId = `${input.chatRequestId}:${n++}`;
    try {
      const cmd = toolCallToCommand(name, args);
      // The confirm card shows a cartVersion; without one the user has not seen a card to say yes to.
      if (cmd.type === "confirmCheckout" && input.cartVersion === undefined) {
        throw new CommandError("CONFLICT", CONFIRM_ON_CARD);
      }
      const body = {
        sessionId: input.sessionId,
        commandId,
        ...cmd,
        source: "text",
        utteranceSeq: input.utteranceSeq,
        ...(cmd.type === "confirmCheckout" ? { cartVersion: input.cartVersion } : {}),
      };
      return { ok: true, response: await runCommand(store, { body, bearer: input.bearer }, now()) };
    } catch (e) {
      if (!(e instanceof CommandError)) throw e;
      return { ok: false, error: { code: e.code, message: e.message, detail: e.detail } };
    }
  };

  let reply = "";
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const out = await model.generate({ system, contents, tools });
    if (out.text) reply = out.text;
    if (out.functionCalls.length === 0) break;
    // Unchanged, so Gemini 3's thought signatures go back with the function calls.
    contents.push(out.content);
    const parts = [];
    for (const call of out.functionCalls) {
      const outcome = await execute(call.name, call.args);
      // Tool names and result codes only (SECURITY "Secrets and repo hygiene").
      console.info("chat tool:", toolNames.has(call.name) ? call.name : "unknown", outcome.ok ? "ok" : outcome.error.code);
      const response = toolResult(kiosk, input.locale, outcome);
      parts.push({ functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response } });
    }
    contents.push({ role: "user", parts });
  }

  const latest = await store.get(input.sessionId);
  if (!latest) throw new CommandError("NOT_FOUND", "This order could not be found.");
  return {
    reply: reply || FALLBACK,
    status: latest.status,
    cart: latest.cart,
    total: latest.total,
    cartVersion: latest.cartVersion,
  };
}
