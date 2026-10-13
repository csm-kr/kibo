import type { AgentAction } from "../src/lib/agent/actions";

// `actions` arrays in the shape /api/chat returns, for tests that answer /api/chat themselves (no model calls).

/** Step 1 of "Sunja's lunch": two cheeseburger sets with different drinks, one without pickles. */
export const HERO_ACTIONS: AgentAction[] = [
  {
    tool: "addToCart",
    args: { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"], ingredients: ["no_pickles"] } },
    code: "ok",
    ms: 182,
  },
  { tool: "addToCart", args: { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["cider"] } }, code: "ok", ms: 164 },
];

/** Step 1 of "Mei's tickets" on the airport rail ticket machine: two adult express tickets. */
export const RAIL_ACTIONS: AgentAction[] = [
  { tool: "addToCart", args: { itemId: "express_city_center", variant: "single", qty: 2, selections: { passenger: ["adult"] } }, code: "ok", ms: 171 },
];

/** A refusal of each kind the strip words differently. */
export const MIXED_ACTIONS: AgentAction[] = [
  { tool: "addToCart", args: { itemId: "cheese_burger", variant: "set" }, code: "NEEDS_CHOICE", ms: 41 },
  {
    tool: "offerChoices",
    args: { templateId: "pick_option", choices: [{ kind: "option", id: "cola" }, { kind: "option", id: "zero_cola" }, { kind: "option", id: "cider" }] },
    code: "ok",
    ms: 38,
  },
  ...HERO_ACTIONS,
  { tool: "confirmCheckout", args: {}, code: "CONFLICT", ms: 22 },
  { tool: "callStaff", args: { reasonCode: "unknown_info" }, code: "ok", ms: 30 },
];
