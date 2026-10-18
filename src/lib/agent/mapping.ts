import { z } from "zod";
import { findItem, groupsFor } from "@/lib/adapters/catalog";
import { CommandError, type ErrorDetail } from "@/lib/commands/errors";
import { issueDetail, type CommandType } from "@/lib/commands/schemas";
import type { CommandResponse } from "@/lib/session/service";
import type { KioskData, Locale } from "@/types/menu";
import type { CartLine } from "@/types/session";
import { choiceLabel } from "./choices";

// Pure mapping between tool calls, commands and tool results; runs on the server and in the browser.
// Only the shape is checked here; POST /api/command validates every value against the catalog.

const str = z.string().min(1).max(64);
const options = z.array(z.object({ groupId: str, optionIds: z.array(str).max(6) })).max(6);
const line = { qty: z.number().optional(), variant: str.optional(), options: options.optional() };

const TOOL_ARGS = {
  setDineOption: z.object({ option: str }),
  addToCart: z.object({ itemId: str, ...line }),
  updateCart: z.object({ lineId: str, ...line }),
  removeFromCart: z.object({ lineId: str }),
  undoLastChange: z.object({}),
  offerChoices: z.object({ templateId: str, choices: z.array(z.object({ kind: str, id: str })) }),
  showMenu: z.object({ category: str }),
  callStaff: z.object({ reasonCode: str }),
  requestCheckout: z.object({}),
  confirmCheckout: z.object({}),
} satisfies Partial<Record<CommandType, z.ZodType>>;

type ToolName = keyof typeof TOOL_ARGS;

const BAD = "That request could not be understood.";

/** options [{ groupId, optionIds }] → selections { groupId: optionIds }; an empty list means "not said". */
function toSelections(list: z.infer<typeof options> | undefined): Record<string, string[]> | undefined {
  if (!list || list.length === 0) return undefined;
  const merged = new Map<string, string[]>();
  for (const { groupId, optionIds } of list) merged.set(groupId, [...(merged.get(groupId) ?? []), ...optionIds]);
  return Object.fromEntries(merged);
}

/** Drops undefined fields so the command matches what the model actually said. */
function defined(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

export function toolCallToCommand(name: string, args: unknown): { type: CommandType; args: object } {
  if (!Object.hasOwn(TOOL_ARGS, name)) throw new CommandError("BAD_REQUEST", "That action is not available.");
  const tool = name as ToolName;
  const parsed = TOOL_ARGS[tool].safeParse(args ?? {});
  if (!parsed.success) throw new CommandError("BAD_REQUEST", BAD, issueDetail(parsed.error));
  const a = parsed.data;

  switch (tool) {
    case "addToCart": {
      const { itemId, qty, variant, options: o } = a as z.infer<typeof TOOL_ARGS.addToCart>;
      return { type: tool, args: defined({ itemId, variant, qty, selections: toSelections(o) }) };
    }
    case "updateCart": {
      const { lineId, qty, variant, options: o } = a as z.infer<typeof TOOL_ARGS.updateCart>;
      return { type: tool, args: { lineId, changes: defined({ qty, variant, selections: toSelections(o) }) } };
    }
    default:
      return { type: tool, args: a };
  }
}

/** Option names in menu order, like the kiosk's cart chips. */
function optionNames(k: KioskData, l: CartLine, locale: Locale): string[] {
  const item = findItem(k, l.itemId);
  if (!item) return [];
  return groupsFor(item, l.variant).flatMap((g) =>
    g.options.filter((o) => (l.selections[g.groupId] ?? []).includes(o.optionId)).map((o) => o.name[locale]),
  );
}

/** Cart lines with names from menu data, so the model never has to invent one. */
export function cartForModel(k: KioskData, cart: CartLine[], locale: Locale) {
  return cart.map((l) => ({
    lineId: l.lineId,
    name: findItem(k, l.itemId)?.name[locale] ?? "",
    variant: l.variant,
    options: optionNames(k, l, locale),
    qty: l.qty,
    unitPrice: l.unitPrice,
  }));
}

type Outcome =
  | { ok: true; response: CommandResponse }
  | { ok: false; error: { code: string; message: string; detail?: ErrorDetail } };

// After a refusal Live offered the same drinks three times and spoke the question twice (10-17): the result now says
// the buttons are on the phone, and a repeat (dropped on the phone, src/lib/agent/offers.ts) that nothing new is. A value,
// not a sentence: Live read the sentence aloud as its own turn (10-18, I-417); the rule for it is in the instructions.

/** What the model sees after a tool call. Never tokens, ids of the session or the claim token. */
export function toolResult(k: KioskData, locale: Locale, outcome: Outcome, tool?: string): object {
  if (!outcome.ok) {
    const { code, message, detail } = outcome.error;
    return {
      ok: false,
      code,
      message,
      ...(detail?.templateId && { templateId: detail.templateId }),
      ...(detail?.choices && {
        choices: detail.choices.map((c) => ({ kind: c.kind, id: c.id, name: choiceLabel(k, c, locale) })),
      }),
      // Which argument a schema refused and why (10-17), so the model fixes its call instead of asking again.
      ...(detail?.field && { field: detail.field, reason: detail.reason }),
    };
  }
  const { status, total, cart, result, pending, dineOption, duplicate } = outcome.response;
  const upsell = result?.upsell?.offerItemIds;
  return {
    ok: true,
    // Learned kiosks: the cart below is from before the change, which the kiosk is still replaying.
    ...(pending && { pending: true, message: "The kiosk is doing it now; say you are adding it and wait." }),
    ...(tool === "offerChoices" && { buttons: duplicate ? "alreadyShown" : "shown" }),
    status,
    // A tap on the phone may have set it after the voice model's instructions were pinned (14-final:4).
    ...(k.dineOptions && dineOption !== undefined && { dineOption }),
    total,
    cart: cartForModel(k, cart, locale),
    ...(upsell && upsell.length > 0 && {
      upsell: upsell.map((itemId) => ({ itemId, name: findItem(k, itemId)?.name[locale] ?? "" })),
    }),
  };
}
