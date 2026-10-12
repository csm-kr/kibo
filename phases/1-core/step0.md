# Step 0: menu-data

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt. Sections that matter here: ARCHITECTURE "data/kiosks/{kioskId}.json" and "Environment variables", PRD "Covering real kiosk complexity" and "Demo scenario", UI_GUIDE "Components" (tile: badge, kcal).
- `AGENTS.md`: this is Next.js 16.4; read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code.
- `design/prototype/Main.dc.html` lines 495–520 (`CATS`, `MENU`, `SET_SIDES`, `SET_DRINKS`, `INGR`): the reference items and prices.
- `public/menu/` (18 generated photos, e.g. `/menu/burger_cheese.jpg`), `package.json`, `tsconfig.json` (`@/*` → `src/*`).

Shell in this harness: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir` and `git status|diff|add|commit|log` are allowed. There is no `cp`, `mv`, `rm`, `cat` or `curl`; use the Read/Write/Edit tools or a `node -e` one-liner.

## Task
### 1. Dependencies and test config
- `npm install zod@^4 firebase-admin@^14 @google/genai@^2.28 qrcode` and `npm install -D @types/qrcode`.
- `vitest.config.ts`: `test.include = ["src/**/*.test.ts", "src/**/*.test.tsx"]`, `environment: "node"`, alias `@` → `<root>/src`. Keep `"test": "vitest run --passWithNoTests"`.

### 2. Types: `src/types/menu.ts`
```ts
export type Locale = "ko" | "en";
export type LocalizedName = { ko: string; en: string };
export type Variant = "single" | "set" | "largeSet";
export interface MenuOption { optionId: string; name: LocalizedName; image?: string; priceDelta: number; soldOut: boolean }
export interface OptionGroup { groupId: string; name: LocalizedName; appliesTo: Variant[]; required: boolean; min: number; max: number; defaultOptionIds: string[]; options: MenuOption[] }
export interface MenuItem { itemId: string; name: LocalizedName; category: string; image: string; kcal: number; badge: "best" | "new" | null; allergens: string[]; soldOut: boolean; availableHours: string | null; variants: { variant: Variant; price: number }[]; optionGroups: OptionGroup[] }
export interface Category { categoryId: string; name: LocalizedName; icon: string }
export interface UpsellRule { whenCategory?: string; whenItemId?: string; offerItemIds: string[] }
export interface KioskTheme { primary: string; primaryDark: string; primaryTint: string; accent: string; background: string }
export interface KioskData { kioskId: string; kind: "direct"; brand: { name: LocalizedName; tagline: LocalizedName }; theme: KioskTheme; locale: Locale; currency: "KRW"; dineOptions: { eat_in: { name: LocalizedName; image: string }; take_out: { name: LocalizedName; image: string } }; categories: Category[]; items: MenuItem[]; upsellRules: UpsellRule[] }
```
`kind` is `"direct"` now; a later phase adds learned kiosks.

### 3. Menu: `data/kiosks/malo.json` (MALO BURGER, fictional)
Brand name `{ko: "말로 버거", en: "MALO BURGER"}`; theme from UI_GUIDE (primary `#0E5E5A`, primaryDark `#083E3B`, primaryTint `#DDF0EE`, accent `#F2B13D`, background `#FBF7EF`); locale `ko`; dine images `/menu/dine_in.jpg`, `/menu/take_out.jpg`.

**7 categories, 34–37 items** (ids in snake_case, ASCII):
- `burger` (8): must include, with these single prices: `cheese_burger` 4900 (badge best), `bulgogi_burger` 5200, `double_cheese_burger` 6400, `spicy_chicken_burger` 5600 (badge new), `shrimp_burger` 5500 (**soldOut: true**); add 3 more fictional burgers.
- `chicken` (4–5): include `chicken_nuggets` with a **required `sauce` group without default** (min 1, max 1), so a missing sauce returns `NEEDS_CHOICE`.
- `side` (5–6): include `fries_m` 2000, `fries_l` 2500, `cheese_sticks` 2500, `coleslaw` 1800.
- `drink` (5–6): include `cola`, `zero_cola`, `cider` at 1800 each, with a required `size` group (default `m`: m +0, l +500).
- `coffee` (3–4): include `iced_coffee` 2300.
- `dessert` (4): include `soft_cone` 1000 (badge best), `apple_pie` 1600.
- `morning` (3): every item has `availableHours: "05:00-10:30"` (KST), so ordering later in the day returns `UNAVAILABLE`.

Every burger has variants `single`, `set` (+2000) and `largeSet` (+2700), and these groups:
- `side`: appliesTo `["set","largeSet"]`, required, min 1, max 1, **`defaultOptionIds: ["fries_m"]`**; options `fries_m` +0, `fries_l` +500, `cheese_sticks` +1000, `coleslaw` +0. Option names are short (`{ko:"감자튀김 M", en:"Fries (M)"}`).
- `drink`: appliesTo `["set","largeSet"]`, required, min 1, max 1, **no default** (the AI must ask); options `cola`, `zero_cola`, `cider` +0, `iced_coffee` +500.
- `ingredients`: appliesTo all three variants, optional, min 0, max 3; options `no_pickles` +0, `no_onion` +0, `extra_cheese` +500, `extra_patty` +1500.

Other rules:
- Names: Korean like a real Korean kiosk; English plain and short. **No real brand names anywhere** (no cola or coffee brands, no chains). Generic words only ("cola", "zero cola", "cider").
- `image`: a path under `/menu/` that exists in `public/menu/`. Use the matching photo when there is one (`burger_cheese.jpg`, `burger_bulgogi.jpg`, `burger_double.jpg`, `burger_chicken.jpg`, `burger_shrimp.jpg`, `fries.jpg`, `cheese_sticks.jpg`, `coleslaw.jpg`, `cola.jpg`, `zero_cola.jpg`, `cider.jpg`, `iced_coffee.jpg`, `soft_cone.jpg`, `apple_pie.jpg`); otherwise the closest existing photo for now (real photos are added later by changing this field only). Option images likewise where useful (side and drink options).
- `kcal` an integer; `allergens` plain lowercase words (`wheat`, `milk`, `egg`, `soy`, `beef`, `pork`, `chicken`, `shrimp`). **Never** add halal, vegan or similar claims: the data principle says unknown information means "call staff".
- Prices: integers in KRW, multiples of 100.
- `upsellRules`: `{ whenCategory: "burger", offerItemIds: ["soft_cone","apple_pie"] }` and `{ whenCategory: "chicken", offerItemIds: ["soft_cone"] }`.
- Category `icon`: an existing `/menu/*.jpg`.

### 4. Catalog module: `src/lib/adapters/catalog.ts`
```ts
export type KioskId = "malo";
export function getKiosk(kioskId: string): KioskData            // throws CatalogError for unknown ids
export function isKioskId(v: string): v is KioskId
export function findItem(k: KioskData, itemId: string): MenuItem | undefined
export function groupsFor(item: MenuItem, variant: Variant): OptionGroup[]   // groups whose appliesTo includes the variant
export function findOption(group: OptionGroup, optionId: string): MenuOption | undefined
export function isAvailableNow(item: MenuItem, now: number): boolean        // availableHours in KST (UTC+9), end exclusive
export function localName(n: LocalizedName, locale: Locale): string
```
- Import the JSON statically (`import malo from "../../../data/kiosks/malo.json"`), validate it once with a zod schema that mirrors the types (export the schema as `kioskSchema`), cache the parsed result.

### 5. Tests first: `src/lib/adapters/catalog.test.ts`
Write these before finishing the data, then make them pass:
- the file parses with `kioskSchema`; 7 categories; 34–37 items; every item's category exists; ids unique (items; options within a group; groups within an item);
- every `image`, option `image`, category `icon` and dine image exists under `public/`;
- every name has non-empty `ko` and `en`, ≤ 40 characters, no newline;
- no real brand words (case-insensitive list at least: coca, pepsi, sprite, fanta, chilsung, mcdonald, burger king, lotteria, kfc, mom's touch, starbucks, ediya, twosome, dunkin, baskin, subway);
- every burger has the three variants and the `side`/`drink`/`ingredients` groups exactly as above; `drink` has no default; `side` default is `fries_m`;
- `defaultOptionIds` always refer to options in the same group; `min ≤ max`; required groups have `min ≥ 1`;
- upsell `offerItemIds` exist; `shrimp_burger` is sold out; every `morning` item has hours;
- `isAvailableNow` for a morning item: true at 09:00 KST, false at 11:00 KST (build the epoch from a UTC date, e.g. `Date.UTC(2026,9,13,0,0)` is 09:00 KST).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. Run the AC commands.
2. Check: files in the paths above; Gemini-only rule untouched; no brand words; no secrets.
3. Update this step in `phases/1-core/index.json` (completed + summary / error / blocked).

## Do not
- Do not put menu data in Firestore (ADR-009).
- Do not add UI, API routes or session code; later steps do that.
- Do not invent health or religious claims (halal, vegan, gluten-free) in data: the product must call staff for those.
- Do not rename existing photos in `public/menu/`; later work swaps images by editing `image` fields.
- Break existing tests.
