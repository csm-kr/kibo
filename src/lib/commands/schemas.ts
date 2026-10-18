import { z } from "zod";
import { CommandError, type ErrorDetail } from "./errors";
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
  command("showMenu", z.strictObject({ category: id })),
  command("setKioskLanguage", z.strictObject({ language: z.enum(["ko", "en", "ja"]) })),
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
      templateId: z.enum(["pick_item", "pick_variant", "pick_option", "pick_dine", "yes_no", "alternatives", "upsell", "ask_staff"]),
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

const COMMAND_TYPES = new Set<string>(commandSchema.options.map((o) => o.shape.type.value));

export function isCommandType(v: unknown): v is CommandType {
  return typeof v === "string" && COMMAND_TYPES.has(v);
}

// Field names of the command and tool-call schemas. A path segment that is not one of these (a record key, a made-up
// field) came from the browser or the model, so it is shown as "*", never echoed.
const FIELDS = new Set([
  ...Object.keys(envelope),
  ...["type", "args", "itemId", "variant", "qty", "selections", "lineId", "changes", "option", "category", "language", "templateId", "choices"],
  ...["kind", "id", "reasonCode", "commandId", "ok", "kioskTotal", "kioskLines", "options", "groupId", "optionIds"],
]);

const size = (origin: unknown) => (origin === "array" ? " items" : origin === "string" ? " characters" : "");

function reasonOf(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return `expected ${issue.expected}`;
    case "too_big":
      return `at most ${issue.maximum}${size(issue.origin)}`;
    case "too_small":
      return `at least ${issue.minimum}${size(issue.origin)}`;
    case "invalid_value":
      return `one of ${issue.values.map(String).join(", ")}`.slice(0, 200);
    case "invalid_format":
      return "wrong format";
    case "invalid_key":
      return "invalid key";
    case "unrecognized_keys":
      return "unknown field";
    case "invalid_union":
      return "not an accepted value";
    case "custom":
      // Our own refine messages ("No change", "At most 6 option groups").
      return issue.message;
    default:
      return "invalid";
  }
}

/**
 * The first schema issue as a field path and a short reason, so a model can fix its call (10-17). Built from the
 * schema only: no value, record key or unknown field name from the request (SECURITY "Command handling").
 */
export function issueDetail(error: z.ZodError): ErrorDetail | undefined {
  const issue = error.issues[0];
  if (!issue) return undefined;
  const field = issue.path
    .slice(0, 6)
    .map((p) => (typeof p === "number" || FIELDS.has(String(p)) ? String(p) : "*"))
    .join(".");
  return { field, reason: reasonOf(issue) };
}

export function parseCommand(body: unknown): Command {
  const parsed = commandSchema.safeParse(body);
  if (!parsed.success) throw new CommandError("BAD_REQUEST", "That request could not be understood.", issueDetail(parsed.error));
  return parsed.data;
}
