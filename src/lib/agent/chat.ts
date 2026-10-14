import { z } from "zod";
import { getKiosk } from "@/lib/adapters/catalog";
import { CommandError } from "@/lib/commands/errors";
import { sessionId } from "@/lib/commands/schemas";
import { SPEECH_LANGUAGES } from "@/lib/i18n/languages";
import { kstDay, type UsageStore } from "@/lib/limits/usage";
import { bumpSessionCounter, runCommand } from "@/lib/session/service";
import type { SessionStore } from "@/lib/store/types";
import type { CartLine, SessionStatus } from "@/types/session";
import { agentAction, type AgentAction } from "./actions";
import { KIOSK_BUSY, waitForBridge } from "./bridgeWait";
import { chatInstructions } from "./instructions";
import { toolCallToCommand, toolResult } from "./mapping";
import type { ModelClient, ModelTurn } from "./model";
import { choiceQuestion } from "./choices";
import { inScreensLanguage, introOffer, plainRequest, quickReply, summaryReply, type DoneCall } from "./quickReply";
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
  // What the AI speaks when it is not the screens' locale (14-final:4); the reply follows the user's own language.
  language: z.enum(SPEECH_LANGUAGES).optional(),
});

export type ChatInput = z.infer<typeof chatRequest> & { bearer: string | null };

export interface ChatDeps {
  store: SessionStore;
  model: ModelClient;
  usage: UsageStore;
  now: () => number;
  /** Between checks of a learned kiosk's replay; tests move a fake clock. */
  sleep?: (ms: number) => Promise<void>;
}

export interface ChatResponse {
  reply: string;
  status: SessionStatus;
  cart: CartLine[];
  total: number;
  cartVersion: number;
  /** What the AI did in this request, for /demo (ids and codes only). */
  actions: AgentAction[];
  /**
   * The request ordered something but changed nothing because the dine option was missing, and it ended on the dine
   * buttons: after the user's tap the phone sends the same message again, so the order is not lost (15-judge-fixes:1).
   */
  heldForDine: boolean;
}

const MAX_ROUNDS = 5;
const SESSION_LIMIT = 60;
const DEMO_SESSION_LIMIT = 30;
const DAILY_LIMIT = 3000;
const LIMITED = "You've reached the message limit for this order. Please use the buttons.";
/** Only when the model wrote nothing and the server has nothing true to say or offer; never after an applied change. */
export const FALLBACK = "Sorry, could you say that again?";
const CONFIRM_ON_CARD = "Please confirm on the card.";
// Judges waited 9–16 s for typed replies whose cart was right after about 10 s (15-judge-fixes, round 2). One more
// model round costs 2–7 s, often only to write a confirmation the server can build from the results; so once 12 s
// have passed and a change is in, the server replies itself. Nothing applied yet: the model keeps going.
const REPLY_BUDGET_MS = 12_000;

/**
 * After the first round the server can always answer itself (applied changes, a refusal's choices), so a later model
 * call that hangs is cut sooner than the client's 40 s (I-268: a second call hung to the deadline after a refusal).
 * Healthy calls take about 3.5 s, p90 7.5 s (evals/results/2026-10-15-full.md).
 */
export const LATER_ROUND_DEADLINE_MS = 15_000;
// Before the review: offering items there would pull the user out of checking or paying.
const OFFER_STATES = new Set<SessionStatus>(["idle", "connected", "ordering"]);

type Outcome = Parameters<typeof toolResult>[2];

export async function runChat(deps: ChatDeps, input: ChatInput): Promise<ChatResponse> {
  const { store, model, usage, now } = deps;
  const startedAt = now();
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
  const { system, currentOrder } = chatInstructions(kiosk, {
    cart: session.cart,
    status: session.status,
    dineOption: session.dineOption,
    pendingChoice: session.pendingChoice,
    locale: input.locale,
    language: input.language,
  });
  const declarations = toolDeclarations(kiosk);
  const tools = [{ functionDeclarations: declarations }];
  // A made-up tool name is model text, so only declared names are logged.
  const toolNames = new Set(declarations.map((d) => d.name));
  const contents: ModelTurn[] = [
    ...input.history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: "user", parts: [{ text: currentOrder }, { text: input.message }] },
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

  // Learned kiosks: after a change the bridge is still replaying, the next call waits for it (I-155); once a wait
  // ran out, the rest of the request is answered as busy instead of being sent.
  let replaying = false;
  let kioskStuck = false;
  const replayDone = async () => !(await store.get(input.sessionId))?.pendingBridgeCommand;
  const run = async (name: string, args: unknown): Promise<Outcome> => {
    if (replaying && (kioskStuck || !(await waitForBridge(replayDone, now, deps.sleep)))) {
      kioskStuck = true;
      return KIOSK_BUSY;
    }
    const outcome = await execute(name, args);
    replaying = outcome.ok && outcome.response.pending === true;
    return outcome;
  };

  // A plain request in the screens' language may get its reply from the first round's results (quickReply.ts):
  // the second model call only wrote a confirmation the server already knows (14-final:5).
  const screensLanguage = input.language === undefined || input.language === input.locale;
  const templated = screensLanguage && plainRequest(input.message, input.locale);
  // The time budget's reply is in Korean or English only, so a user writing another language waits for the model.
  const budgeted = screensLanguage && inScreensLanguage(input.message, input.locale);

  /**
   * The reply when the model wrote none, or ran out of time (15-judge-fixes:0). After an applied change: fixed
   * sentences naming it, then the open question. With nothing applied: the choices a refusal named, or what this kiosk
   * sells as buttons. Both offers go through offerChoices like the model's own, so they are real menu ids. Only when
   * none of that is possible (a review or payment under way, a refused offer) is it the generic retry.
   */
  const serverReply = async (): Promise<string> => {
    const applied = allDone.some((d) => d.outcome.ok);
    let latest = await store.get(input.sessionId);
    if (!latest) throw new CommandError("NOT_FOUND", "This order could not be found.");
    if (!latest.pendingChoice) {
      // The last round's refusal that named choices (NEEDS_CHOICE, SOLD_OUT) is the question the model left unasked.
      const refused = lastRound.findLast((d) => !d.outcome.ok && d.outcome.error.detail?.templateId && d.outcome.error.detail.choices?.length);
      const detail = refused && !refused.outcome.ok ? refused.outcome.error.detail : undefined;
      const intro = !detail && !applied && OFFER_STATES.has(latest.status) ? introOffer(kiosk, input.locale) : null;
      const offer = detail
        ? { templateId: detail.templateId, choices: detail.choices!.slice(0, 6) }
        : intro && intro.choices.length > 0
          ? // [Call staff] last: the request matched nothing, so none of these may be what the user wants.
            { templateId: "pick_item", choices: [...intro.choices, { kind: "staff", id: "staff" }] }
          : null;
      if (offer) {
        const t = performance.now();
        const outcome = await execute("offerChoices", offer);
        record("offerChoices", offer, outcome, performance.now() - t);
        latest = (await store.get(input.sessionId)) ?? latest;
        if (outcome.ok && intro) return `${intro.line} ${choiceQuestion(kiosk, latest.pendingChoice!, input.locale)}`;
      }
    }
    // Any accepted command clears pendingChoice, so one still open after an applied change was set in this request.
    const question = latest.pendingChoice ? choiceQuestion(kiosk, latest.pendingChoice, input.locale) : null;
    return summaryReply(kiosk, input.locale, allDone, question) ?? FALLBACK;
  };

  // The cart before each call, so a remove or update can name its line.
  let cart = session.cart;
  const actions: AgentAction[] = [];
  const record = (name: string, args: unknown, outcome: Outcome, ms: number) => {
    actions.push(agentAction(name, args, outcome, ms, cart));
    if (outcome.ok) cart = outcome.response.cart;
    // Tool names and result codes only (SECURITY "Secrets and repo hygiene").
    console.info("chat tool:", toolNames.has(name) ? name : "unknown", outcome.ok ? "ok" : outcome.error.code);
  };
  // Every call of the request and the last round's, for a reply the server builds when the model writes none.
  const allDone: DoneCall[] = [];
  let lastRound: DoneCall[] = [];
  let reply = "";
  let stoppedEarly = false;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let out: Awaited<ReturnType<ModelClient["generate"]>>;
    try {
      out = await model.generate({ system, contents, tools, ...(round > 0 ? { deadlineMs: LATER_ROUND_DEADLINE_MS } : {}) });
    } catch (e) {
      // A deadline or upstream error after a change went in, or after a refusal that named choices: an error would make
      // the user repeat the order (and maybe get it twice), so the server answers from what it holds. With nothing done
      // and nothing to offer it stays an error. Nothing is retried (ARCHITECTURE "Region and secrets").
      const refusedWithChoices = lastRound.some((d) => !d.outcome.ok && d.outcome.error.detail?.templateId && d.outcome.error.detail.choices?.length);
      if (!(e instanceof CommandError) || !(allDone.some((d) => d.outcome.ok) || refusedWithChoices)) throw e;
      stoppedEarly = true;
      break;
    }
    if (out.text) reply = out.text;
    if (out.functionCalls.length === 0) break;
    // Unchanged, so Gemini 3's thought signatures go back with the function calls.
    contents.push(out.content);
    const parts = [];
    const done: DoneCall[] = [];
    for (const call of out.functionCalls) {
      const t = performance.now();
      const cartBefore = cart;
      const outcome = await run(call.name, call.args);
      record(call.name, call.args, outcome, performance.now() - t);
      done.push({ name: call.name, args: call.args, outcome, cartBefore });
      const response = toolResult(kiosk, input.locale, outcome);
      parts.push({ functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response } });
    }
    contents.push({ role: "user", parts });
    allDone.push(...done);
    lastRound = done;
    // Only the first round, and only when the model said nothing itself: its text may hold an answer.
    const quick = round === 0 && templated && !out.text ? quickReply(kiosk, input.locale, done) : null;
    if (quick) {
      reply = quick;
      break;
    }
    if (budgeted && now() - startedAt > REPLY_BUDGET_MS && allDone.some((d) => d.outcome.ok)) {
      stoppedEarly = true;
      break;
    }
  }

  if (stoppedEarly || !reply) reply = await serverReply();

  let latest = await store.get(input.sessionId);
  if (!latest) throw new CommandError("NOT_FOUND", "This order could not be found.");
  // A refused add or checkout that needs the dine option is always asked with buttons, even when the model asked in
  // words only, so the phone has something to tap and knows to send the order again.
  const dineRefused = allDone.some((d) => !d.outcome.ok && d.outcome.error.detail?.templateId === "pick_dine");
  const dineOpen = kiosk.dineOptions !== undefined && latest.dineOption === null && !latest.pendingBridgeCommand;
  if (dineRefused && dineOpen && !latest.pendingChoice && OFFER_STATES.has(latest.status)) {
    const offer = { templateId: "pick_dine", choices: [{ kind: "dine", id: "eat_in" }, { kind: "dine", id: "take_out" }] };
    const t = performance.now();
    const outcome = await execute("offerChoices", offer);
    record("offerChoices", offer, outcome, performance.now() - t);
    latest = (await store.get(input.sessionId)) ?? latest;
  }
  const dineAsked = actions.some((a) => a.tool === "offerChoices" && a.code === "ok" && a.args.templateId === "pick_dine");
  // Only a request that changed nothing (an offer is not a change): sending it again must not add anything twice.
  const changedNothing = !allDone.some((d) => d.outcome.ok && d.name !== "offerChoices");
  const heldForDine = dineOpen && dineAsked && changedNothing && latest.pendingChoice?.templateId === "pick_dine";
  return {
    reply,
    status: latest.status,
    cart: latest.cart,
    total: latest.total,
    cartVersion: latest.cartVersion,
    actions,
    heldForDine,
  };
}
