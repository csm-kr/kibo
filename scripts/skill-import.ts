// Converts a skill written by the offline learner (spikes/kibo-learn, rounds 3–4) into the product's skill format
// (src/lib/adapters/learned.ts skillSchema), so the bridge can replay it. A draft for human review, printed, never
// written to skills/: names get ASCII ids, English names are copied from the kiosk's labels until a reviewer
// translates them, and provenance.reviewed stays 0000-00-00 until a person sets it.
//
//   npm run skill:import -- <path to skill.json> <kioskId> [checkout label]
//
// Never carried: the order review (review, openReview) and charges. The product bridge never presses the kiosk's
// order or payment buttons (docs/SECURITY.md "Learned kiosks"), so a skill that needs them gets a note instead.
import { readFileSync } from "node:fs";
import { type Skill, skillSchema } from "../src/lib/adapters/learned";
import type { RecipeStep } from "../src/types/menu";

/* eslint-disable @typescript-eslint/no-explicit-any -- the learner's JSON has no type; every field is checked by skillSchema */
type Raw = Record<string, any>;

const STEP_KEYS = new Set(["op", "label", "role", "name", "text", "exact", "within", "index", "over", "as", "times", "steps", "groups"]);
const PRODUCT_OPS = new Set(["click", "check", "clickIfVisible", "clickNth", "forEach", "repeat", "chooseOptions"]);
// The kiosk's own button that ends the order, when no label is given: the first control that names an order or payment.
const CHECKOUT_WORD = /주문|결제|order|pay|checkout/i;

export interface ImportOptions {
  /** The kiosk's button that ends the order (the phone names it); default the first uiLabel with an order word. */
  checkout?: string;
  /** Where the learner's skill came from, for provenance.evidence. */
  source?: string;
}

export function importSkill(raw: Raw, kioskId: string, opts: ImportOptions = {}): { skill: Skill; notes: string[] } {
  const notes: string[] = [];
  const name = (s: string) => ({ ko: s, en: s });

  const catalog: Raw[] = (raw.catalog ?? []).map((it: Raw) => ({
    ...it,
    optionGroups: (it.optionGroups ?? []).map((g: Raw | string) => {
      if (typeof g !== "string") return g;
      const def = raw.sharedGroups?.[g];
      if (!def) throw new Error(`${it.name}: option group "${g}" is not in sharedGroups`);
      return { name: g, ...def };
    }),
  }));

  // Ids: one per category label, one per option label (the bridge looks options up by id alone), and one per group
  // name with the same steps and condition (one group id must always mean the same steps).
  const categoryIds = new Map<string, string>((raw.categories ?? []).map((c: string, i: number) => [c, `category_${i + 1}`]));
  const optionIds = new Map<string, string>();
  const optionId = (label: string) => {
    if (!optionIds.has(label)) optionIds.set(label, `option_${optionIds.size + 1}`);
    return optionIds.get(label)!;
  };
  const groupIds = new Map<string, string>();
  const groupsByName = new Map<string, Set<string>>();
  const groupId = (g: Raw) => {
    const key = JSON.stringify([g.name, g.select ?? null, g.after ?? null, g.appliesWhen ?? null]);
    if (!groupIds.has(key)) groupIds.set(key, `group_${groupIds.size + 1}`);
    const id = groupIds.get(key)!;
    groupsByName.set(g.name, (groupsByName.get(g.name) ?? new Set()).add(id));
    return id;
  };
  catalog.forEach((it) => it.optionGroups.forEach((g: Raw) => (g.id = groupId(g))));

  const step = (s: Raw): RecipeStep => {
    if (s.op === "openReview") throw new Error("openReview: the product bridge never presses the kiosk's order button");
    if (!PRODUCT_OPS.has(s.op)) throw new Error(`Unknown recipe op ${JSON.stringify(s.op)}`);
    const unknown = Object.keys(s).filter((k) => !STEP_KEYS.has(k));
    if (unknown.length) throw new Error(`Unknown recipe step fields: ${unknown.join(", ")}`);
    const out: Raw = { ...s };
    if (s.steps) out.steps = s.steps.map(step);
    if (s.groups) {
      out.groups = s.groups.flatMap((n: string) => {
        const ids = groupsByName.get(n);
        if (!ids) throw new Error(`chooseOptions names a group no item has: ${n}`);
        return [...ids];
      });
    }
    return out as RecipeStep;
  };

  const optionGroups = (it: Raw) =>
    it.optionGroups.map((g: Raw) => {
      const options = g.options.map((o: Raw) => ({ optionId: optionId(o.name), name: name(o.name), label: o.name, priceDelta: o.priceDelta ?? 0 }));
      // A count option ("김밥 추가 1줄" ×2) cannot be ordered as a count on a learned kiosk yet (I-190): once each.
      if (g.type === "quantity") notes.push(`${it.name} › ${g.name}: a count option, ordered at most once per option (I-190)`);
      const max = g.type === "multi" ? Math.min(g.max ?? options.length, options.length) : g.type === "quantity" ? options.length : 1;
      let appliesWhen;
      if (g.appliesWhen != null) {
        const [gName, oName] = String(g.appliesWhen).split("=").map((x) => x.trim());
        const other = it.optionGroups.find((x: Raw) => x !== g && x.name === gName);
        if (!other || !other.options.some((o: Raw) => o.name === oName)) throw new Error(`${it.name} › ${g.name}: appliesWhen ${g.appliesWhen} is not on the item`);
        appliesWhen = { groupId: other.id, optionId: optionId(oName) };
      }
      return {
        groupId: g.id,
        name: name(g.name),
        label: g.name,
        required: !!g.required,
        min: g.required ? 1 : 0,
        max,
        defaultOptionIds: [],
        options,
        ...(g.select && { select: g.select.map(step) }),
        ...(g.after && { after: g.after.map(step) }),
        ...(appliesWhen && { appliesWhen }),
      };
    });

  const uiLabels: string[] = raw.uiLabels ?? [];
  const checkout = opts.checkout ?? uiLabels.find((l) => CHECKOUT_WORD.test(l));
  if (!checkout) throw new Error("No order button among uiLabels; pass its label as the third argument");
  const forbiddenLabels: string[] = [...(raw.forbiddenLabels ?? [])];
  if (!forbiddenLabels.includes(checkout)) forbiddenLabels.push(checkout);

  if (raw.review) notes.push("review dropped: the product bridge never opens the kiosk's order review (payment rule)");
  if (raw.charges?.length) notes.push("charges dropped: the phone's total leaves them out, so the bridge's total check calls staff");
  if (!raw.cartLinePattern) notes.push("no cartLinePattern: write one before use, or every replay fails its line check and calls staff");
  if (!raw.recipes?.removeLine) notes.push("no removeLine recipe: removing a line calls staff");

  const skill = skillSchema.parse({
    kioskId,
    kind: "learned",
    brand: name(raw.kiosk),
    locale: "ko",
    currency: "KRW",
    page: `/learned-kiosks/${kioskId}/index.html`,
    provenance: { learnedBy: "KIBO Learn (imported)", evidence: opts.source ?? "imported", reviewed: "0000-00-00" },
    dineOptions: raw.dineOptions,
    categories: (raw.categories ?? []).map((c: string) => ({ categoryId: categoryIds.get(c), name: name(c), label: c })),
    catalog: catalog.map((it, i) => ({
      itemId: `item_${i + 1}`,
      name: name(it.name),
      label: it.name,
      category: categoryIds.get(it.category),
      price: it.price,
      soldOut: !!it.soldOut,
      ...(it.recipe && it.recipe !== "addToCart" && { recipe: it.recipe }),
      optionGroups: optionGroups(it),
    })),
    uiLabels,
    forbiddenLabels,
    checkout: { label: checkout, name: name(checkout) },
    recipes: Object.fromEntries(Object.entries(raw.recipes ?? {}).map(([k, steps]) => [k, (steps as Raw[]).map(step)])),
    cartTotalPattern: raw.cartTotalPattern ?? "",
    cartLinePattern: raw.cartLinePattern ?? "",
    ...(raw.interrupts?.length && { interrupts: raw.interrupts.map((i: Raw) => ({ text: i.text, dismiss: step(i.dismiss) })) }),
    ...(raw.declines?.length && { declines: raw.declines.map((d: Raw) => ({ choice: d.choice, offer: d.offer, name: name(d.offer) })) }),
  });
  return { skill, notes };
}

function main() {
  const [path, kioskId, checkout] = process.argv.slice(2);
  if (!path || !kioskId) {
    console.error("Usage: npm run skill:import -- <skill.json> <kioskId> [checkout label]");
    process.exit(2);
  }
  const { skill, notes } = importSkill(JSON.parse(readFileSync(path, "utf8")), kioskId, { checkout, source: path });
  for (const n of notes) console.error(`note: ${n}`);
  console.log(JSON.stringify(skill, null, 2));
}

if (process.argv[1]?.endsWith("skill-import.ts")) main();
