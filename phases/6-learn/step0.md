# Step 0: learned-adapter

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: KIBO_LEARN (all), ADR-007, ADR-009; ARCHITECTURE "`skills/{kioskId}.json`", "Agent tools (9)" (what learned kiosks support), "Sequence diagrams" 3; SECURITY "Learned kiosks (KIBO Learn)".
- The learned kiosk and its skill from the experiments: `spikes/kibo-learn/kiosk/index.html` (Doughhouse, a black-box kiosk page), `spikes/kibo-learn/results/skill.run2.json` (the skill Gemini wrote), `spikes/kibo-learn/driver.mjs` (labelling rules, recipe ops), `spikes/kibo-learn/runner.mjs`.
- Code: `src/types/menu.ts`, `src/lib/adapters/catalog.ts` (+ tests), `src/lib/commands/cart.ts`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`. Copy files with `node -e` (`fs.copyFileSync`).

## Task
Turn the learned Doughhouse skill into a reviewed, committed skill file and load it through the same catalog API as MALO. **Tests first.**

### The kiosk page
Copy `spikes/kibo-learn/kiosk/index.html` **unchanged** to `public/learned-kiosks/doughhouse/index.html`. It stands for a third-party kiosk: KIBO never edits it (the bridge in step 2 wraps it).

### Reviewed skill: `skills/doughhouse.json`
Start from `skill.run2.json` and add what the human review adds (KIBO_LEARN "Skill format"; ARCHITECTURE: ids generated from labels, `name.en` added during review):
```
{ kioskId: "doughhouse", kind: "learned", brand: { ko: "도우하우스", en: "Doughhouse" }, locale: "ko", currency: "KRW",
  page: "/learned-kiosks/doughhouse/index.html",
  provenance: { learnedBy: "gemini-3.8-flash", evidence: "spikes/kibo-learn/results/skill.run2.json", reviewed: "2026-10-13" },
  dineOptions: { eat_in: "<exact kiosk label>", take_out: "<exact kiosk label>" },
  categories: [{ categoryId, name: { ko, en }, label }],
  catalog: [{ itemId, name: { ko, en }, label, category, price, soldOut,
              optionGroups: [{ groupId, name: { ko, en }, label, required, min, max, defaultOptionIds: [],
                               options: [{ optionId, name: { ko, en }, label, priceDelta }] }] }],
  uiLabels: [...], forbiddenLabels: [...], recipes: { startOrder, addToCart, removeLine }, cartTotalPattern, cartLinePattern }
```
- `label` fields are the exact texts the kiosk shows (from the learned skill); ids are ASCII snake_case (`margherita`, `size`, `large`, …); English names plain and short.
- `forbiddenLabels`: labels the bridge must never click (payment, card, order completion): at least the payment method tile, "주문하기" (checkout) and anything with 결제 or 카드. The user finishes on the kiosk.
- `removeLine`: a recipe that deletes cart line number `{lineIndex}` with the kiosk's own 삭제 button (add an `{ "op": "clickNth", "label": "삭제", "index": "{lineIndex}" }` op; the bridge implements it).
- `cartLinePattern`: a regex for one cart line in the kiosk's text (`name (opts) xN price원`), used for verification.
- Keep `recipes.startOrder` and `recipes.addToCart` as learned (the evidence), only adding what review needs.

### Types and loading
- `src/types/menu.ts`: `KioskData.kind` becomes `"direct" | "learned"`; add `learned?: { page: string; recipes: Record<string, RecipeStep[]>; dineLabels: { eat_in: string; take_out: string }; uiLabels: string[]; forbiddenLabels: string[]; cartTotalPattern: string; cartLinePattern: string; labels: { items: Record<itemId, string>; categories: Record<categoryId, string>; options: Record<optionId, string> } }`. `RecipeStep` = `{ op: "click" | "check" | "clickIfVisible" | "clickNth" | "forEach" | "repeat"; label?; role?; name?; text?; exact?; index?; over?; as?; times?; steps? }`.
- `src/lib/adapters/learned.ts`: `skillSchema` (zod, strict; SECURITY: names ≤ 40 chars, no newlines, integer prices, ids ASCII) and `learnedToKiosk(skill) → KioskData`: items get `variants: [{ variant: "single", price }]`, `image` = a neutral placeholder that exists in `public/` (add `public/learned-kiosks/item.svg`, a simple stroke icon), `kcal: 0`, `badge: null`, `allergens: []`, `availableHours: null`; categories get `icon` = the same placeholder; a neutral theme; `dineOptions` names from i18n (매장 / 포장) with the placeholder image; `upsellRules: []` (the kiosk's own popup is handled by the recipe).
- `getKiosk("doughhouse")` returns it; `KioskId` includes it; `isKioskId` updated. MALO stays unchanged.

### Tests
- the skill parses; every label used in `recipes` that is not a `{placeholder}` is in `uiLabels`, a category label, or a dine label; no forbidden label appears in any recipe;
- `learnedToKiosk` output passes the existing `kioskSchema` checks that make sense for learned kiosks (ids unique, names ko/en, images exist), and `resolveLine` works for "large pepperoni, thin dough, bacon and olive" with the right price (17,900 + 4,000 + 0 + 1,500 + 800);
- the potato pizza is sold out; toppings max 3 is enforced by `resolveLine`.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. Run the AC commands.
2. Check: the copied kiosk page is byte-identical to the spike; no brand names; `forbiddenLabels` cover payment.
3. Update this step in `phases/6-learn/index.json` (completed + summary / error / blocked).

## Do not
- Do not edit the learned kiosk page; the point is that KIBO needs no integration.
- Do not invent items or prices not in the kiosk page.
- Do not add runtime self-healing (ADR-007).
- Break existing tests.
