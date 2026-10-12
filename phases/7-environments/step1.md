# Step 1: domain-model

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: PRD "Out of MVP scope" and "Business model" (B2G: stations), ARCHITECTURE "data/kiosks/{kioskId}.json", ADR-004, ADR-009; ISSUE I-019 (English kiosk UI later) and I-020 (Korean and English only).
- Code: `src/types/menu.ts`, `src/lib/adapters/catalog.ts` (+ tests), `src/lib/adapters/learned.ts`, `src/lib/commands/{cart,machine}.ts` (+ tests), `data/kiosks/malo.json`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
The user asked to show KIBO in more environments than a burger shop, starting with an **airport**. The next steps add an airport rail ticket kiosk. Tickets are not food: no dine-in/take-out, no kcal, no sets, and fares can be lower than the base price (a child fare). This step generalizes the data model and rules without changing MALO's behaviour. **Tests first.**

## Task
### Types (`src/types/menu.ts`) and schema (`kioskSchema`)
- `KioskData.domain: "food" | "ticket"` (MALO and learned Doughhouse are `food`).
- `KioskData.dineOptions` becomes optional (absent for ticket kiosks).
- `KioskData.locales: Locale[]`: the languages the kiosk's own screen offers (MALO `["ko", "en"]` after the next step adds English copy; default `["ko"]`); `locale` stays the default.
- `MenuItem.kcal: number | null` (null hides it), `MenuItem.subtitle?: LocalizedName` (one short line under the name, e.g. "Non-stop · 43 min"), `MenuItem.allergens` may be empty.
- `MenuOption.priceDelta` may be negative (a child or senior fare); a resolved `unitPrice` below 0 is a data error caught by the schema tests, not a runtime case.
- `KioskData.vocabulary?: { item: LocalizedName; add: LocalizedName; cart: LocalizedName }` for domain words on screens and in instructions (food default: 메뉴/menu, 담기/Add, 장바구니/Cart; tickets: 승차권/ticket, 선택/Select, 선택한 승차권/Selected tickets).

### Rules (`cart.ts`, `machine.ts`)
- `requestCheckout` asks for a dine option **only** when the kiosk has `dineOptions`; `setDineOption` on a kiosk without them → `BAD_REQUEST`.
- `unitPrice` with negative deltas is computed the same way; keep all other validation.
- Upsell stays data-driven (`upsellRules` may be empty).

### Catalog tests
Refactor `catalog.test.ts` so the generic checks (ids unique, names ko/en ≤ 40 chars, images exist, defaults valid, no brand words, prices multiples of 10 and every resolved fare ≥ 0) run for **every** kiosk returned by a new `allKioskIds()`; keep MALO's specific checks (7 categories, burgers, hero prices) as they are.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
```

## Verify
1. Run the AC commands; MALO's behaviour and all existing tests are unchanged.
2. R-002: update ARCHITECTURE's menu schema block and the commands table (`requestCheckout`, `setDineOption`) in the same change; grep `docs/` and `phases/` for `dineOptions` and `kcal`.
3. Update this step in `phases/7-environments/index.json` (completed + summary / error / blocked).

## Do not
- Do not add the airport data yet (next step).
- Do not add languages beyond Korean and English (I-020).
- Break existing tests.
