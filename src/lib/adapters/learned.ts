import { z } from "zod";
import { kt } from "@/lib/i18n/kiosk";
import type { KioskData, LearnedKiosk, LocalizedName, RecipeStep } from "@/types/menu";

// A learned skill (skills/*.json) comes from kiosk page text, which is untrusted (docs/SECURITY.md
// "Learned kiosks"): short single-line names, ASCII ids, integer prices, no unknown fields.

const text = z.string().min(1).max(40).regex(/^[^\r\n]*$/);
const id = z.string().regex(/^[a-z0-9_]+$/).max(64);
const won = z.number().int();
// Names reach the model's instructions; `<` and `>` could end the <menu_data> block (I-152). Labels never do.
const nameText = text.regex(/^[^<>]*$/);
const name = z.strictObject({ ko: nameText, en: nameText });
// Recipe names and recipe variables are camelCase (startOrder, qtyMinus1).
const varName = z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/).max(40);

const recipeStep: z.ZodType<RecipeStep> = z.lazy(() =>
  z.strictObject({
    op: z.enum(["click", "check", "clickIfVisible", "clickNth", "forEach", "repeat", "chooseOptions"]),
    label: text.optional(),
    role: z.string().regex(/^[a-z]+$/).max(20).optional(),
    name: text.optional(),
    text: text.optional(),
    exact: z.boolean().optional(),
    within: text.optional(),
    index: z.union([z.number().int().min(0), text]).optional(),
    over: varName.optional(),
    as: varName.optional(),
    times: z.union([z.number().int().min(0), text]).optional(),
    steps: z.array(recipeStep).optional(),
    // chooseOptions only: run these group ids where this step stands (round 4).
    groups: z.array(id).max(20).optional(),
  }),
);

/** Every label, name and text a step (or its sub-steps) targets. */
function stepTargets(s: RecipeStep): string[] {
  return [s.label, s.name, s.text].filter((t): t is string => t !== undefined).concat((s.steps ?? []).flatMap(stepTargets));
}

function stepGroups(s: RecipeStep): string[] {
  return [...(s.groups ?? []), ...(s.steps ?? []).flatMap(stepGroups)];
}

export const skillSchema = z
  .strictObject({
    kioskId: id,
    kind: z.literal("learned"),
    brand: name,
    locale: z.enum(["ko", "en"]),
    currency: z.literal("KRW"),
    page: z.string().regex(/^\/learned-kiosks\/[a-z0-9_-]+\/[a-z0-9_.-]+$/),
    provenance: z.strictObject({
      learnedBy: z.string().max(64),
      evidence: z.string().max(200),
      reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    dineOptions: z.strictObject({ eat_in: text, take_out: text }),
    categories: z.array(z.strictObject({ categoryId: id, name, label: text })).min(1),
    catalog: z.array(
      z.strictObject({
        itemId: id,
        name,
        label: text,
        category: id,
        price: won.min(0),
        soldOut: z.boolean(),
        // The recipe that adds this item, when it is not addToCart (a set with its own popup, round 4).
        recipe: varName.optional(),
        optionGroups: z.array(
          z.strictObject({
            groupId: id,
            name,
            label: text,
            required: z.boolean(),
            min: z.number().int().min(0),
            max: z.number().int().min(1),
            defaultOptionIds: z.array(id),
            options: z.array(z.strictObject({ optionId: id, name, label: text, priceDelta: won })).min(1),
            // chooseOptions: how this group picks one option (a stepper's +) and what follows it (a wizard's 다음).
            select: z.array(recipeStep).optional(),
            after: z.array(recipeStep).optional(),
            // Shown only after another group's choice; skipped with its after steps when the line did not make it.
            appliesWhen: z.strictObject({ groupId: id, optionId: id }).optional(),
          }),
        ),
      }),
    ).min(1),
    uiLabels: z.array(text),
    forbiddenLabels: z.array(text).min(1),
    // The kiosk's own button that ends the order; the phone names it ("tap 주문하기 and pay there"), the bridge never clicks it.
    checkout: z.strictObject({ label: text, name }),
    recipes: z.record(varName, z.array(recipeStep)),
    cartTotalPattern: z.string().max(200),
    // One cart line in the page's text; it may span text lines (a kiosk that shows a line as a block, bk9).
    cartLinePattern: z.string().max(200),
    // What stands between two options in a cart line, as a regex; a comma when absent.
    cartOptionSeparator: z.string().min(1).max(60).optional(),
    // A page drawn at a fixed size (a kiosk screen, bk9's 720×1280) is laid out at exactly that size; without it the
    // page takes the learner's 1080 width at 1120–1600 tall (14-final:3).
    pageSize: z.strictObject({ width: z.number().int().min(320).max(1600), height: z.number().int().min(480).max(2400) }).optional(),
    // Popups that can come up between any two steps (a timeout modal): the text that shows one and the step that
    // answers it (round 3, I-194).
    interrupts: z.array(z.strictObject({ text: text.min(4), dismiss: recipeStep })).max(5).optional(),
    // Popup offers the recipes always decline (round 4): the declining button, the offer as shown, and the name the
    // AI may say. An order that asks for the offer is refused before any tap.
    declines: z.array(z.strictObject({ choice: text, offer: text, name })).max(5).optional(),
  })
  .refine((s) => isForbiddenLabel(s.checkout.label, s.forbiddenLabels), {
    message: "checkout.label must be a forbidden label",
    path: ["checkout", "label"],
  })
  // An interrupt's answer and a decline's button are controls: never a payment control, and never an item, category
  // or option, which would change the order on its own.
  .refine(
    (s) => {
      const order = new Set([
        ...s.catalog.map((i) => i.label),
        ...s.categories.map((c) => c.label),
        ...s.catalog.flatMap((i) => i.optionGroups.flatMap((g) => g.options.map((o) => o.label))),
      ]);
      const targets = [...(s.interrupts ?? []).flatMap((i) => stepTargets(i.dismiss)), ...(s.declines ?? []).map((d) => d.choice)];
      return targets.every((t) => !order.has(t) && !isForbiddenLabel(t, s.forbiddenLabels));
    },
    { message: "an interrupt's answer or a decline must be a plain control", path: ["interrupts"] },
  )
  .refine((s) => s.catalog.every((i) => i.recipe === undefined || Object.hasOwn(s.recipes, i.recipe)), {
    message: "an item names a recipe the skill does not have",
    path: ["catalog"],
  })
  .refine(
    (s) =>
      s.catalog.every((i) =>
        i.optionGroups.every((g) => {
          if (!g.appliesWhen) return true;
          const other = i.optionGroups.find((o) => o.groupId === g.appliesWhen!.groupId && o !== g);
          return !!other && other.options.some((o) => o.optionId === g.appliesWhen!.optionId);
        }),
      ),
    { message: "appliesWhen must name another group of the item and one of its options", path: ["catalog"] },
  )
  .refine(
    (s) => {
      const ids = new Set(s.catalog.flatMap((i) => i.optionGroups.map((g) => g.groupId)));
      return Object.values(s.recipes).flat().flatMap(stepGroups).every((g) => ids.has(g));
    },
    { message: "chooseOptions names a group the skill does not have", path: ["recipes"] },
  );

export type Skill = z.infer<typeof skillSchema>;

/** A neutral stroke icon: KIBO never copies a learned kiosk's photos. */
export const LEARNED_PLACEHOLDER = "/learned-kiosks/item.svg";

// Spacing, case, punctuation and emoji never hide a payment word ("주문 하기", "💳 신용/체크카드").
const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
// Payment words the bridge refuses on every kiosk, on top of the skill's own list.
const PAYMENT = ["결제", "카드", "pay", "card", "checkout"];
// A line that starts with one of these keeps the order going (a timeout modal's 계속 주문하기, I-193, I-234), so the
// skill's order words alone do not refuse it; a payment word still does ("Continue to checkout", 결제 취소).
const KEEP_ORDERING = ["계속", "더담기", "continue", "cancel"];

/**
 * True when the bridge must not click this label. Each line of it is checked: a line refuses when it is one of the
 * skill's forbidden labels, holds a payment word, or holds a forbidden label without starting with a keep-ordering
 * word. Stricter than the learner's whole-label rule (spikes/kibo-learn/plan.mjs `isForbidden`): when in doubt, refuse.
 */
export function isForbiddenLabel(label: string, forbidden: string[]): boolean {
  const own = forbidden.map(norm).filter(Boolean);
  return label.split("\n").map(norm).filter(Boolean).some((line) => {
    if (own.includes(line) || PAYMENT.some((w) => line.includes(w))) return true;
    if (KEEP_ORDERING.some((w) => line.startsWith(w))) return false;
    return own.some((f) => line.includes(f));
  });
}

function both(key: "dineChip" | "takeOutChip"): LocalizedName {
  return { ko: kt(key, "ko"), en: kt(key, "en") };
}

/** Normalizes a reviewed skill into the same shape as a direct-adapter menu, plus what the bridge needs. */
export function learnedToKiosk(skill: Skill): KioskData {
  const options: Record<string, string> = {};
  const groupSteps: LearnedKiosk["groupSteps"] = {};
  const stepsSeen: Record<string, string> = {};
  for (const item of skill.catalog) {
    for (const g of item.optionGroups) {
      // Like option ids, one group id (size on every pizza) must always mean the same steps.
      const steps = {
        ...(g.select && { select: g.select }),
        ...(g.after && { after: g.after }),
        ...(g.appliesWhen && { appliesWhen: g.appliesWhen }),
      };
      if (Object.hasOwn(stepsSeen, g.groupId) && stepsSeen[g.groupId] !== JSON.stringify(steps)) {
        throw new Error(`Group id ${g.groupId} has two sets of steps`);
      }
      stepsSeen[g.groupId] = JSON.stringify(steps);
      if (g.select || g.after || g.appliesWhen) groupSteps[g.groupId] = steps;
      for (const o of g.options) {
        // The bridge looks options up by id alone, so one id must always mean one kiosk label.
        if (options[o.optionId] !== undefined && options[o.optionId] !== o.label) {
          throw new Error(`Option id ${o.optionId} has two kiosk labels`);
        }
        options[o.optionId] = o.label;
      }
    }
  }

  const learned: LearnedKiosk = {
    page: skill.page,
    recipes: skill.recipes,
    dineLabels: skill.dineOptions,
    uiLabels: skill.uiLabels,
    forbiddenLabels: skill.forbiddenLabels,
    checkout: skill.checkout,
    cartTotalPattern: skill.cartTotalPattern,
    cartLinePattern: skill.cartLinePattern,
    cartOptionSeparator: skill.cartOptionSeparator ?? ",",
    ...(skill.pageSize && { pageSize: skill.pageSize }),
    groupSteps,
    itemRecipes: Object.fromEntries(skill.catalog.flatMap((i) => (i.recipe && i.recipe !== "addToCart" ? [[i.itemId, i.recipe]] : []))),
    interrupts: skill.interrupts ?? [],
    declines: skill.declines ?? [],
    labels: {
      items: Object.fromEntries(skill.catalog.map((i) => [i.itemId, i.label])),
      categories: Object.fromEntries(skill.categories.map((c) => [c.categoryId, c.label])),
      options,
    },
  };

  return {
    kioskId: skill.kioskId,
    kind: "learned",
    domain: "food",
    brand: { name: skill.brand, tagline: { ko: "학습된 키오스크", en: "Learned kiosk" } },
    theme: {
      primary: "#4B463F",
      primaryDark: "#33302B",
      primaryTint: "#F3EEE4",
      accent: "#E2DACB",
      background: "#FBF7EF",
    },
    locale: skill.locale,
    locales: [skill.locale],
    currency: skill.currency,
    dineOptions: {
      eat_in: { name: both("dineChip"), image: LEARNED_PLACEHOLDER },
      take_out: { name: both("takeOutChip"), image: LEARNED_PLACEHOLDER },
    },
    categories: skill.categories.map((c) => ({ categoryId: c.categoryId, name: c.name, icon: LEARNED_PLACEHOLDER })),
    items: skill.catalog.map((i) => ({
      itemId: i.itemId,
      name: i.name,
      category: i.category,
      image: LEARNED_PLACEHOLDER,
      kcal: 0,
      badge: null,
      allergens: [],
      soldOut: i.soldOut,
      availableHours: null,
      variants: [{ variant: "single", price: i.price }],
      optionGroups: i.optionGroups.map((g) => ({
        groupId: g.groupId,
        name: g.name,
        appliesTo: ["single"],
        required: g.required,
        min: g.min,
        max: g.max,
        defaultOptionIds: g.defaultOptionIds,
        options: g.options.map((o) => ({ optionId: o.optionId, name: o.name, priceDelta: o.priceDelta, soldOut: false })),
      })),
    })),
    // The kiosk's own side-dish popup is closed by the addToCart recipe.
    upsellRules: [],
    learned,
  };
}
