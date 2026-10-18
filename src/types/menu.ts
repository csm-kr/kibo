export type Locale = "ko" | "en";
/**
 * A language the kiosk's own screen can show. Japanese is a kiosk screen language only (the airport rail ticket
 * machine's K1 offers 日本語): the phone, the server and the AI keep `Locale`, and the model never sees `ja` names.
 */
export type KioskLocale = Locale | "ja";
/** `ja` only in kiosk data whose screen offers Japanese; a screen without it falls back to `en`. */
export type LocalizedName = { ko: string; en: string; ja?: string };
export type Variant = "single" | "set" | "largeSet";

/** What a kiosk sells: food has dine options and kcal; tickets have neither. */
export type KioskDomain = "food" | "ticket";

export interface MenuOption {
  optionId: string;
  name: LocalizedName;
  image?: string;
  /** May be negative (a child or senior fare); no selection may bring a unit price below 0 (catalog tests). */
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
  /** One short line under the name, e.g. "Non-stop · 39 min". */
  subtitle?: LocalizedName;
  category: string;
  image: string;
  /** null hides it (tickets). */
  kcal: number | null;
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
  /** Category rail, toolbar and quiet panels; absent: the shared cream panel #F3EEE4. */
  panel?: string;
}

/**
 * One recipe step for the learned-kiosk bridge. String fields may hold `{placeholders}`. `within` picks, among
 * matching targets, the one closest to that text (the + in its own row). `chooseOptions` runs, per option group of
 * the item, the group's `select` steps (or its own `steps`) for each chosen option, then the group's `after` steps.
 */
export interface RecipeStep {
  op: "click" | "check" | "clickIfVisible" | "clickNth" | "forEach" | "repeat" | "chooseOptions";
  label?: string;
  role?: string;
  name?: string;
  text?: string;
  exact?: boolean;
  within?: string;
  index?: number | string;
  over?: string;
  as?: string;
  times?: number | string;
  steps?: RecipeStep[];
  /** chooseOptions only: the group ids it runs where it stands (a set popup after the add button, round 4). */
  groups?: string[];
}

/** A group shown only after another choice: skipped, with its after steps, when the line did not make it. */
export interface GroupCondition {
  groupId: string;
  optionId: string;
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
  /** One cart line in the page's text, possibly over several text lines; groups 1 name, 2 options, 3 quantity, 4 price. */
  cartLinePattern: string;
  /** The regex between two options of a cart line ("," on Doughhouse). */
  cartOptionSeparator: string;
  /** The page's own fixed size, when it is drawn at one (bk9's 720×1280); else the learner's width (replayView). */
  pageSize?: { width: number; height: number };
  /** By group id: the group's own steps for chooseOptions (a stepper's +, a wizard's 다음) and its condition. */
  groupSteps: Record<string, { select?: RecipeStep[]; after?: RecipeStep[]; appliesWhen?: GroupCondition }>;
  /** By item id, when it is not addToCart (a set with its own popup steps). */
  itemRecipes: Record<string, string>;
  /** Popups that can come up between any two steps (a timeout modal), answered before each step (round 3, I-194). */
  interrupts: { text: string; dismiss: RecipeStep }[];
  /** Popup offers the recipes always decline; `name` is the checked text the AI may say, never `offer` (I-152). */
  declines: { choice: string; offer: string; name: LocalizedName }[];
  labels: {
    items: Record<string, string>;
    categories: Record<string, string>;
    options: Record<string, string>;
  };
}

/** How a kiosk takes payment; KIBO's kiosks take cards only (10-17). */
export type PaymentMethod = "card" | "cash";

export interface KioskVocabulary {
  item: LocalizedName;
  add: LocalizedName;
  cart: LocalizedName;
}

export interface KioskData {
  kioskId: string;
  kind: "direct" | "learned";
  domain: KioskDomain;
  brand: { name: LocalizedName; tagline: LocalizedName };
  /** K1 attract picture: a photo, or an SVG drawn on the theme tint; absent shows the tint alone. */
  hero?: string;
  theme: KioskTheme;
  /**
   * The kiosk screen's language: in the data its default (Korean or English), on the kiosk screens the one chosen on
   * K1 for this order (KioskScreen passes the kiosk down with it).
   */
  locale: KioskLocale;
  /** The languages the kiosk's own screen offers; includes `locale`. */
  locales: KioskLocale[];
  currency: "KRW";
  /** What the kiosk takes at payment, for the AI's answer to "can I pay in cash?". Absent on a learned kiosk, which the
   *  user pays on its own page. */
  payment?: { methods: PaymentMethod[] };
  /** Absent on kiosks that do not ask eat-in or take-out (tickets). */
  dineOptions?: {
    eat_in: { name: LocalizedName; image: string };
    take_out: { name: LocalizedName; image: string };
  };
  /** Domain words for screens and instructions; `vocabularyOf` falls back to food words. */
  vocabulary?: KioskVocabulary;
  categories: Category[];
  items: MenuItem[];
  upsellRules: UpsellRule[];
  learned?: LearnedKiosk;
}
