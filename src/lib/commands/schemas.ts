import { z } from "zod";
import { CommandError } from "./errors";
import { MAX_QTY } from "./cart";

// Every command body comes from a browser, so everything is bounded here before any logic runs.

/** Session ids are 16 random bytes in base64url; every route that takes one checks this before the store sees it. */
export const SESSION_ID = /^[A-Za-z0-9_-]{16,64}$/;
export const sessionId = z.string().regex(SESSION_ID);

const id = z.string().min(1).max(64).regex(/^[a-z0-9_]+$/);
const variant = z.enum(["single", "set", "largeSet"]);
const qty = z.number().int().min(1).max(MAX_QTY);
const selections = z
  .record(id, z.array(id).max(6))
  .refine((s) => Object.keys(s).length <= 6, "At most 6 option groups");
const empty = z.strictObject({});

const envelope = {
  sessionId,
  commandId: z.string().min(1).max(128),
  cartVersion: z.number().int().min(0).optional(),
  utteranceSeq: z.number().int().min(0).optional(),
  source: z.enum(["voice", "text", "button", "touch"]),
};

function command<T extends string, A extends z.ZodType>(type: T, args: A) {
  return z.strictObject({ ...envelope, type: z.literal(type), args });
}

const commandSchema = z.discriminatedUnion("type", [
  command("startTouch", empty),
  command("clearCart", empty),
  command("undoLastChange", empty),
  command("requestCheckout", empty),
  command("cancelCheckout", empty),
  command("confirmCheckout", empty),
  command("editOrder", empty),
  command("cardAction", empty),
  command("reissueClaim", empty),
  command("setDineOption", z.strictObject({ option: z.enum(["eat_in", "take_out"]) })),
  command(
    "addToCart",
    z.strictObject({ itemId: id, variant: variant.optional(), qty: qty.optional(), selections: selections.optional() }),
  ),
  command(
    "updateCart",
    z.strictObject({
      lineId: id,
      changes: z
        .strictObject({ qty: qty.optional(), variant: variant.optional(), selections: selections.optional() })
        .refine((c) => c.qty !== undefined || c.variant !== undefined || c.selections !== undefined, "No change"),
    }),
  ),
  command("removeFromCart", z.strictObject({ lineId: id })),
  command(
    "offerChoices",
    z.strictObject({
      templateId: z.enum(["pick_item", "pick_variant", "pick_option", "pick_dine", "yes_no", "alternatives", "upsell"]),
      choices: z
        // Variant ids are camelCase ("largeSet"), so they are allowed next to the snake_case id pattern.
        .array(z.strictObject({ kind: z.enum(["item", "variant", "option", "dine", "yesno", "staff"]), id: z.union([id, variant]) }))
        .min(1)
        .max(6),
    }),
  ),
  command("callStaff", z.strictObject({ reasonCode: z.enum(["unknown_info", "user_request", "stuck", "learned_mismatch"]) })),
  // Learned kiosks: what the bridge saw after replaying the pending command. The lines are third-party page text,
  // bounded here and never stored.
  command(
    "bridgeReport",
    z.strictObject({
      commandId: z.string().min(1).max(128),
      ok: z.boolean(),
      kioskTotal: z.number().int().min(0).nullable(),
      kioskLines: z.array(z.string().max(120)).max(20),
    }),
  ),
]);

export type Command = z.infer<typeof commandSchema>;
export type CommandType = Command["type"];

export function parseCommand(body: unknown): Command {
  const parsed = commandSchema.safeParse(body);
  if (!parsed.success) throw new CommandError("BAD_REQUEST", "That request could not be understood.");
  return parsed.data;
}
