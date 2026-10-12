export type Locale = "ko" | "en";
export type LocalizedName = { ko: string; en: string };
export type Variant = "single" | "set" | "largeSet";

export interface MenuOption {
  optionId: string;
  name: LocalizedName;
  image?: string;
  priceDelta: number;
  soldOut: boolean;
}

export interface OptionGroup {
  groupId: string;
  name: LocalizedName;
  appliesTo: Variant[];
  required: boolean;
  min: number;
  max: number;
  defaultOptionIds: string[];
  options: MenuOption[];
}

export interface MenuItem {
  itemId: string;
  name: LocalizedName;
  category: string;
  image: string;
  kcal: number;
  badge: "best" | "new" | null;
  allergens: string[];
  soldOut: boolean;
  /** "HH:MM-HH:MM" in KST, end exclusive; null means all day. */
  availableHours: string | null;
  variants: { variant: Variant; price: number }[];
  optionGroups: OptionGroup[];
}

export interface Category {
  categoryId: string;
  name: LocalizedName;
  icon: string;
}

export interface UpsellRule {
  whenCategory?: string;
  whenItemId?: string;
  offerItemIds: string[];
}

export interface KioskTheme {
  primary: string;
  primaryDark: string;
  primaryTint: string;
  accent: string;
  background: string;
}

export interface KioskData {
  kioskId: string;
  kind: "direct";
  brand: { name: LocalizedName; tagline: LocalizedName };
  theme: KioskTheme;
  locale: Locale;
  currency: "KRW";
  dineOptions: {
    eat_in: { name: LocalizedName; image: string };
    take_out: { name: LocalizedName; image: string };
  };
  categories: Category[];
  items: MenuItem[];
  upsellRules: UpsellRule[];
}
