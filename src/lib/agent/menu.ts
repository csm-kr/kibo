import type { KioskData } from "@/types/menu";

// The menu as the model sees it: everything it may quote (names, subtitles, prices, options, allergens, kcal, badge),
// nothing it does not need (images, theme). Compact, because it goes into every voice and text session.

export function menuForModel(k: KioskData) {
  return {
    currency: k.currency,
    categories: k.categories.map((c) => ({ id: c.categoryId, name: c.name })),
    items: k.items.map((i) => ({
      itemId: i.itemId,
      name: i.name,
      // Ticket subtitles hold travel time and stops ("Non-stop · 39 min"), which the model may quote.
      ...(i.subtitle ? { subtitle: i.subtitle } : {}),
      category: i.category,
      variants: i.variants,
      groups: i.optionGroups.map((g) => ({
        groupId: g.groupId,
        name: g.name,
        appliesTo: g.appliesTo,
        required: g.required,
        min: g.min,
        max: g.max,
        default: g.defaultOptionIds,
        options: g.options.map((o) => ({ id: o.optionId, name: o.name, priceDelta: o.priceDelta, soldOut: o.soldOut })),
      })),
      soldOut: i.soldOut,
      hours: i.availableHours,
      allergens: i.allergens,
      kcal: i.kcal,
      badge: i.badge,
    })),
  };
}
