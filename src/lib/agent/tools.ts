import type { FunctionDeclaration } from "@google/genai";
import type { KioskData } from "@/types/menu";

// The 9 agent tools (docs/ARCHITECTURE.md "Agent tools"), shared by Gemini Live and /api/chat.
// Enums come from the catalog so the model can only name real ids; the server still validates everything.

const VARIANTS = ["single", "set", "largeSet"];
const TEMPLATES = ["pick_item", "pick_variant", "pick_option", "pick_dine", "yes_no", "alternatives", "upsell"];
const CHOICE_KINDS = ["item", "variant", "option", "dine", "yesno"];

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

function object(properties: Record<string, object>, required: string[] = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

export function toolDeclarations(k: KioskData): FunctionDeclaration[] {
  const groups = k.items.flatMap((i) => i.optionGroups);
  const qty = { type: "integer", minimum: 1, maximum: 10 };
  const variant = { type: "string", enum: VARIANTS };
  const options = {
    type: "array",
    description: "Choices per option group; leave a group out to keep its default or current choice.",
    items: object(
      {
        groupId: { type: "string", enum: unique(groups.map((g) => g.groupId)) },
        optionIds: {
          type: "array",
          items: { type: "string", enum: unique(groups.flatMap((g) => g.options.map((o) => o.optionId))) },
        },
      },
      ["groupId", "optionIds"],
    ),
  };
  const lineId = { type: "string", description: "lineId from the latest cart." };

  const tools: [string, string, ReturnType<typeof object>][] = [
    ["setDineOption", "Set eat here (eat_in) or take out (take_out) when the user says it.", object(
      { option: { type: "string", enum: ["eat_in", "take_out"] } },
      ["option"],
    )],
    ["addToCart", "Add a new line to the cart; leave variant out if the user did not say single or set.", object(
      { itemId: { type: "string", enum: k.items.map((i) => i.itemId) }, variant, qty, options },
      ["itemId"],
    )],
    ["updateCart", "Change an existing cart line (quantity, single or set, options) instead of adding a new one.", object(
      { lineId, qty, variant, options },
      ["lineId"],
    )],
    ["removeFromCart", "Remove one line from the cart.", object({ lineId }, ["lineId"])],
    ["undoLastChange", "Undo the last cart change when the user says no, cancel that, or undo.", object({})],
    ["offerChoices", "Show the user choice buttons (menu ids only) when a choice is needed or the request is ambiguous.", object(
      {
        templateId: { type: "string", enum: TEMPLATES },
        choices: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: object({ kind: { type: "string", enum: CHOICE_KINDS }, id: { type: "string" } }, ["kind", "id"]),
        },
      },
      ["templateId", "choices"],
    )],
    ["callStaff", "Call staff to the kiosk when the menu data cannot answer, the user asks for staff, or the user is stuck.", object(
      { reasonCode: { type: "string", enum: ["unknown_info", "user_request", "stuck"] } },
      ["reasonCode"],
    )],
    ["requestCheckout", "Show the confirm card when the user is done ordering or wants to pay.", object({})],
    ["confirmCheckout", "Move to payment, only after the user clearly says yes in a new turn after the confirm card appeared.", object({})],
  ];

  // A learned kiosk changes a line by remove + add, and the user pays on the kiosk itself (ARCHITECTURE "Agent tools").
  const learnedOmits = k.kind === "learned" ? ["updateCart", "confirmCheckout"] : [];
  return tools
    .filter(([name]) => !learnedOmits.includes(name))
    .map(([name, description, parametersJsonSchema]) => ({ name, description, parametersJsonSchema }));
}
