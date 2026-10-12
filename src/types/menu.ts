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

/** One recipe step for the learned-kiosk bridge. String fields may hold `{placeholders}`. */
export interface RecipeStep {
  op: "click" | "check" | "clickIfVisible" | "clickNth" | "forEach" | "repeat";
  label?: string;
  role?: string;
  name?: string;
  text?: string;
  exact?: boolean;
  index?: number | string;
  over?: string;
  as?: string;
  times?: number | string;
  steps?: RecipeStep[];
}

/** What the bridge needs to drive a learned kiosk page (skills/*.json). */
export interface LearnedKiosk {
  page: string;
  recipes: Record<string, RecipeStep[]>;
  dineLabels: { eat_in: string; take_out: string };
  uiLabels: string[];
  /** A label containing any of these is never clicked (payment, card, checkout). */
  forbiddenLabels: string[];
  /** The kiosk's own button that ends the order, named on the phone; one of the forbidden labels. */
  checkout: { label: string; name: LocalizedName };
  cartTotalPattern: string;
  cartLinePattern: string;
  labels: {
    items: Record<string, string>;
    categories: Record<string, string>;
    options: Record<string, string>;
  };
}

export interface KioskData {
  kioskId: string;
  kind: "direct" | "learned";
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
  learned?: LearnedKiosk;
}
