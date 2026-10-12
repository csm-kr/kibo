import { z } from "zod";
import malo from "../../../data/kiosks/malo.json";
import doughhouse from "../../../skills/doughhouse.json";
import type {
  KioskData,
  Locale,
  LocalizedName,
  MenuItem,
  MenuOption,
  OptionGroup,
  Variant,
} from "@/types/menu";
import { learnedToKiosk, skillSchema } from "./learned";

export type KioskId = "malo" | "doughhouse";

export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogError";
  }
}

const localizedName = z.strictObject({ ko: z.string(), en: z.string() });
const variant = z.enum(["single", "set", "largeSet"]);
const imagePath = z.string().startsWith("/menu/");
const won = z.number().int();

const menuOption = z.strictObject({
  optionId: z.string(),
  name: localizedName,
  image: imagePath.optional(),
  priceDelta: won,
  soldOut: z.boolean(),
});

const optionGroup = z.strictObject({
  groupId: z.string(),
  name: localizedName,
  appliesTo: z.array(variant),
  required: z.boolean(),
  min: z.number().int().min(0),
  max: z.number().int().min(1),
  defaultOptionIds: z.array(z.string()),
  options: z.array(menuOption).min(1),
});

const menuItem = z.strictObject({
  itemId: z.string(),
  name: localizedName,
  category: z.string(),
  image: imagePath,
  kcal: z.number().int().min(0),
  badge: z.enum(["best", "new"]).nullable(),
  allergens: z.array(z.string()),
  soldOut: z.boolean(),
  availableHours: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/).nullable(),
  variants: z.array(z.strictObject({ variant, price: won.min(0) })).min(1),
  optionGroups: z.array(optionGroup),
});

const dineOption = z.strictObject({ name: localizedName, image: imagePath });

export const kioskSchema: z.ZodType<KioskData> = z.strictObject({
  kioskId: z.string(),
  kind: z.literal("direct"),
  brand: z.strictObject({ name: localizedName, tagline: localizedName }),
  theme: z.strictObject({
    primary: z.string(),
    primaryDark: z.string(),
    primaryTint: z.string(),
    accent: z.string(),
    background: z.string(),
  }),
  locale: z.enum(["ko", "en"]),
  currency: z.literal("KRW"),
  dineOptions: z.strictObject({ eat_in: dineOption, take_out: dineOption }),
  categories: z.array(z.strictObject({ categoryId: z.string(), name: localizedName, icon: imagePath })),
  items: z.array(menuItem),
  upsellRules: z.array(
    z.strictObject({
      whenCategory: z.string().optional(),
      whenItemId: z.string().optional(),
      offerItemIds: z.array(z.string()),
    }),
  ),
});

const sources: Record<KioskId, () => KioskData> = {
  malo: () => kioskSchema.parse(malo),
  doughhouse: () => learnedToKiosk(skillSchema.parse(doughhouse)),
};
const cache = new Map<KioskId, KioskData>();

export function isKioskId(v: string): v is KioskId {
  return Object.hasOwn(sources, v);
}

export function getKiosk(kioskId: string): KioskData {
  if (!isKioskId(kioskId)) throw new CatalogError(`Unknown kiosk: ${kioskId}`);
  let kiosk = cache.get(kioskId);
  if (!kiosk) {
    kiosk = sources[kioskId]();
    cache.set(kioskId, kiosk);
  }
  return kiosk;
}

export function findItem(k: KioskData, itemId: string): MenuItem | undefined {
  return k.items.find((i) => i.itemId === itemId);
}

export function groupsFor(item: MenuItem, variant: Variant): OptionGroup[] {
  return item.optionGroups.filter((g) => g.appliesTo.includes(variant));
}

export function findOption(group: OptionGroup, optionId: string): MenuOption | undefined {
  return group.options.find((o) => o.optionId === optionId);
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** availableHours is "HH:MM-HH:MM" in KST (UTC+9); the end minute is exclusive. */
export function isAvailableNow(item: MenuItem, now: number): boolean {
  if (!item.availableHours) return true;
  const [start, end] = item.availableHours.split("-").map(toMinutes);
  const minuteOfDay = Math.floor((((now + KST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS / 60000);
  return minuteOfDay >= start && minuteOfDay < end;
}

export function localName(n: LocalizedName, locale: Locale): string {
  return n[locale];
}
