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
    op: z.enum(["click", "check", "clickIfVisible", "clickNth", "forEach", "repeat"]),
    label: text.optional(),
    role: z.string().regex(/^[a-z]+$/).max(20).optional(),
    name: text.optional(),
    text: text.optional(),
    exact: z.boolean().optional(),
    index: z.union([z.number().int().min(0), text]).optional(),
    over: varName.optional(),
    as: varName.optional(),
    times: z.union([z.number().int().min(0), text]).optional(),
    steps: z.array(recipeStep).optional(),
  }),
);

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
    cartLinePattern: z.string().max(200),
  })
  .refine((s) => isForbiddenLabel(s.checkout.label, s.forbiddenLabels), {
    message: "checkout.label must be a forbidden label",
    path: ["checkout", "label"],
  });

export type Skill = z.infer<typeof skillSchema>;

/** A neutral stroke icon: KIBO never copies a learned kiosk's photos. */
export const LEARNED_PLACEHOLDER = "/learned-kiosks/item.svg";

/** True when the bridge must not click this label (it contains a forbidden word or label). */
export function isForbiddenLabel(label: string, forbidden: string[]): boolean {
  return forbidden.some((f) => label.includes(f));
}

function both(key: "dineChip" | "takeOutChip"): LocalizedName {
  return { ko: kt(key, "ko"), en: kt(key, "en") };
}

/** Normalizes a reviewed skill into the same shape as a direct-adapter menu, plus what the bridge needs. */
export function learnedToKiosk(skill: Skill): KioskData {
  const options: Record<string, string> = {};
  for (const item of skill.catalog) {
    for (const g of item.optionGroups) {
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
